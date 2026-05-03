# `purchase-orders` Module — Spec

## 0. Scope

进货单 CRUD + 确认（确认时自动加库存）。仅 DRAFT 单可改/删；CONFIRMED 永久不可逆。

依赖：`auth`、`products`、`suppliers`
被依赖：`stats`

---

## 1. Data shape — `PurchaseOrder`

| Field | Type | Constraint |
|---|---|---|
| id | int | auto-increment, > 0 |
| orderNo | string | unique，格式 `RH` + `YYYYMMDD` + 4 位序列号 |
| productId | int | references Product.id |
| quantity | int | > 0 |
| costPrice | number (Float) | > 0, ≤ 99999.99，2 decimals |
| totalAmount | number (Float) | = quantity × costPrice，server 计算（≤ 999999999.99） |
| supplierId | int | references Supplier.id |
| purchaser | string | trim length 1..50 |
| remark | string? | length ≤ 1000 |
| status | string | `'DRAFT'` (default) / `'CONFIRMED'` |
| purchaseDate | datetime | required（参与单号生成） |
| confirmedAt | datetime? | 仅 status=CONFIRMED 时非空 |
| createdAt | datetime | set on create |
| updatedAt | datetime | set on create, refreshed on update |

---

## 2. Procedures (tRPC)

### 2.1 `purchaseOrders.list` (query, protected)

- **Input**:
  ```ts
  z.object({
    orderNo: z.string().optional(),
    supplierId: z.number().int().positive().optional(),
    dateFrom: z.string().datetime().optional(),
    dateTo: z.string().datetime().optional(),
    status: z.enum(['DRAFT','CONFIRMED']).optional(),
    page: z.number().int().positive().default(1),
    pageSize: z.number().int().min(10).max(50).default(20),
  })
  ```
- **Output**:
  ```ts
  {
    items: Array<PurchaseOrder & { product: { id, code, name }, supplier: { id, name } }>,
    total, page, pageSize,
  }
  ```
- **行为**: orderNo 模糊匹配；purchaseDate 落在 [dateFrom, dateTo]；按 `purchaseDate` 降序，再 `orderNo` 降序

### 2.2 `purchaseOrders.byId` (query, protected)

- **Input**: `z.object({ id })`
- **Output**: `PurchaseOrder & { product, supplier }`
- **Errors**: `UNAUTHORIZED` / `ORDER_NOT_FOUND`

### 2.3 `purchaseOrders.create` (mutation, protected)

- **Input**:
  ```ts
  z.object({
    productId: z.number().int().positive(),
    quantity: z.number().int().positive(),
    costPrice: z.number().finite().positive().max(99999.99)
      .refine((n) => Math.round(n * 100) === n * 100, 'max 2 decimals'),
    supplierId: z.number().int().positive(),
    purchaser: z.string().trim().min(1).max(50),
    remark: z.string().max(1000).optional(),
    purchaseDate: z.string().datetime(),
  })
  ```
- **Output**: `PurchaseOrder`（status=DRAFT, confirmedAt=null）
- **Errors**: `UNAUTHORIZED` / `PRODUCT_NOT_FOUND` / `SUPPLIER_NOT_FOUND`
- **Precondition order**: 1. Zod  2. productId 存在  3. supplierId 存在  4. **事务**：a) `nextPurchaseOrderNo(db, purchaseDate)`  b) 计算 `totalAmount = quantity × costPrice`，四舍五入到 2 位  c) 持久化 row（status=DRAFT）

### 2.4 `purchaseOrders.update` (mutation, protected)

- **Input**: 与 create 同字段、全部 partial、加 `id`：
  ```ts
  z.object({
    id: z.number().int().positive(),
    productId: z.number().int().positive().optional(),
    quantity: z.number().int().positive().optional(),
    costPrice: z.number().finite().positive().max(99999.99).refine(...).optional(),
    supplierId: z.number().int().positive().optional(),
    purchaser: z.string().trim().min(1).max(50).optional(),
    remark: z.string().max(1000).nullable().optional(),
    purchaseDate: z.string().datetime().optional(),
  })
  ```
- **Output**: `PurchaseOrder`
- **Errors**: `UNAUTHORIZED` / `ORDER_NOT_FOUND` / `ORDER_NOT_DRAFT` / `PRODUCT_NOT_FOUND` / `SUPPLIER_NOT_FOUND`
- **Precondition order**: 1. Zod  2. id 存在（否则 `ORDER_NOT_FOUND`）  3. `status === 'DRAFT'`（否则 `ORDER_NOT_DRAFT`）  4. （若改 productId）product 存在  5. （若改 supplierId）supplier 存在  6. 重算 totalAmount  7. 持久化（**不重算 orderNo**，即便 purchaseDate 改也不变更）

### 2.5 `purchaseOrders.delete` (mutation, protected)

- **Input**: `z.object({ id })`
- **Output**: `{ ok: true }`
- **Errors**: `UNAUTHORIZED` / `ORDER_NOT_FOUND` / `ORDER_NOT_DRAFT`
- **Precondition order**: 1. Zod  2. id 存在  3. `status === 'DRAFT'`  4. 删除

### 2.6 `purchaseOrders.confirm` (mutation, protected)

- **Input**: `z.object({ id })`
- **Output**: `PurchaseOrder`（status=CONFIRMED, confirmedAt=now）
- **Errors**: `UNAUTHORIZED` / `ORDER_NOT_FOUND` / `ORDER_ALREADY_CONFIRMED` / `EXCEEDS_MAX_STOCK`
- **Precondition order**: 1. Zod  2. id 存在  3. `status === 'DRAFT'`（否则 `ORDER_ALREADY_CONFIRMED`）  4. `product.quantity + order.quantity ≤ product.maxStock`（否则 `EXCEEDS_MAX_STOCK`）  5. **事务**：a) `product.quantity += order.quantity`  b) `stockLog.create({ productId, delta: +quantity, reason: 'PURCHASE_ORDER:<orderNo>' })`  c) `order.status='CONFIRMED'`、`order.confirmedAt=now`

---

## 3. Invariants

- **I1** OrderNo monotone — 同一日（`purchaseDate` 落入同 0:00..23:59:59.999）内，新单的序列号严格 +1。
- **I2** OrderNo format — 持久化的 `orderNo` 满足 `^RH\d{8}\d{4}$` 且日期段与 `purchaseDate` 一致。
- **I3** Status finality — 状态只可能从 DRAFT → CONFIRMED；CONFIRMED → DRAFT 永远不发生。
- **I4** Confirm side-effect — 任意一次成功的 `confirm`：`product.quantity` 增加且仅增加 `order.quantity`（其他字段不变）；并写入对应 StockLog。
- **I5** Confirm idempotency-block — 重复 `confirm` 抛 `ORDER_ALREADY_CONFIRMED`，库存与 StockLog **不**再变。
- **I6** Edit/Delete only DRAFT — 任意 CONFIRMED 单的 `update` / `delete` 必抛 `ORDER_NOT_DRAFT`。
- **I7** TotalAmount equality — 持久化 `totalAmount` 等于 `Math.round(quantity * costPrice * 100) / 100`，不依赖前端传入。
- **I8** Round-trip — `create(X)` 后 `byId(returned.id)` 等于 X 加 server 字段（id, orderNo, totalAmount, status='DRAFT', confirmedAt=null, createdAt, updatedAt）。
- **I9** Max-stock guard — 任意成功的 confirm 之后 `product.quantity ≤ product.maxStock` 仍成立。

---

## 4. UI

### 4.1 Routes

| 路由 | 页面 |
|---|---|
| `/purchase-orders` | 列表 |
| `/purchase-orders/new` | 新增 |
| `/purchase-orders/[id]` | 详情（CONFIRMED 时只读） |
| `/purchase-orders/[id]/edit` | 编辑（仅 DRAFT；CONFIRMED 访问跳详情） |

### 4.2 Form fields

| Label | Field | 约束 | 错误文案 |
|---|---|---|---|
| `商品` | `productId` | int.positive() | `请选择商品` |
| `进货数量` | `quantity` | int > 0 | `进货数量必须为正整数` |
| `进货单价` | `costPrice` | > 0, ≤ 99999.99, 2 decimals（默认填商品 costPrice，可改） | `进价必须大于0` / `进价最多保留2位小数` |
| `进货金额` | `totalAmount` | 自动计算（disabled） | — |
| `供应商` | `supplierId` | int.positive() | `请选择供应商` |
| `进货员` | `purchaser` | trim().min(1).max(50) | `经办人不能为空` |
| `进货日期` | `purchaseDate` | ISO datetime（默认今天） | — |
| `备注` | `remark` | max(1000), optional | — |

### 4.3 Buttons & Toolbar

| 用途 | 文案 | 出现条件 | testid |
|---|---|---|---|
| 提交（表单） | `保存` / 提交中 `保存中...` | 新增/编辑表单 | — |
| 工具栏新增 | `新增进货单` | 列表页 | `purchase-orders-create` |
| 行内编辑 | `编辑` | DRAFT 行 | `row-<id>-edit` |
| 行内删除 | `删除` | DRAFT 行 | `row-<id>-delete` |
| 行内确认 | `确认` | DRAFT 行 | `row-<id>-confirm` |
| 行内查看 | `查看` | CONFIRMED 行 | `row-<id>-view` |
| 详情页确认 | `确认进货单` | DRAFT 详情页 | `confirm-button` |
| 详情页编辑 | `编辑` | DRAFT 详情页 | — |

### 4.4 testid catalog（本模块特有）

| testid | 元素 |
|---|---|
| `purchase-orders-list` | Table |
| `purchase-orders-create` | 工具栏新增 |
| `purchase-orders-search` | 搜索单号输入框 |
| `confirm-button` | 详情页 DRAFT 确认按钮 |

### 4.5 服务端错误展示

| Error | 中文文案 |
|---|---|
| `PRODUCT_NOT_FOUND` | `商品不存在` |
| `SUPPLIER_NOT_FOUND` | `所选供应商不存在` |
| `ORDER_NOT_FOUND` | `单据不存在` |
| `ORDER_NOT_DRAFT` | `仅草稿状态的单据可以编辑或删除` |
| `ORDER_ALREADY_CONFIRMED` | `该单据已确认，不能重复操作` |
| `EXCEEDS_MAX_STOCK` | `进货后将超过最大库存容量` |

### 4.6 Submit behavior

- 客户端 Zod 失败 → 字段级 alert，**不**调 mutation
- 服务端错误 → 顶部 page-level alert
- 创建/更新成功 → toast `创建成功` / `更新成功`，跳 `/purchase-orders`
- 删除 → 二次确认 `确认删除该单据？` / `删除后不可恢复，是否继续？`；成功 toast `删除成功`
- 确认 → 二次确认 `确认 {单号}？` / `确认后将自动调整库存，且不可撤销，是否继续？`；成功 toast `确认成功，库存已更新`，刷新列表

### 4.7 列表展示

列：`进货单号` / `商品名称` / `进货数量` / `进货日期` / `供应商` / `进货员` / `状态（草稿/已确认）` / `操作`

工具栏：搜索单号、供应商筛选、日期范围、状态筛选、新增按钮。

### 4.8 详情页

显示全部字段；DRAFT 时显示 `编辑` `删除` `确认进货单` 三按钮；CONFIRMED 时仅显示 `已确认 ✓ 确认时间：YYYY-MM-DD HH:mm:ss`，无任何可操作按钮。

---

## 5. E2E flow

### 5.1 Happy path — 创建（DRAFT）

1. `resetBackend({ categories:[{name:'C1'}], suppliers:[{name:'S1'}], products:[{ code:'P1', name:'X', categoryName:'C1', supplierName:'S1', costPrice:10, sellPrice:20, quantity:0, unit:'件', minStock:1, maxStock:1000 }] })`
2. `login(page)`
3. nav → `nav-purchase-orders` → click `purchase-orders-create`
4. select 商品 `P1 - X`，fill `进货数量=100`，确认 `进货单价=10`、`进货金额=1000` 自动显示
5. select 供应商 `S1`，fill `进货员=张三`
6. click `保存`
7. expect URL `/purchase-orders`，列表中可见以 `RH` 开头的新单号，状态 `草稿`，toast `创建成功`

### 5.2 Happy path — 确认（DRAFT → CONFIRMED）

1. seed 同上 + 已存在一张 DRAFT 进货单 product P1, qty=100
2. login → 列表 → click `row-<id>-confirm` → `modal-confirm`
3. expect toast `确认成功，库存已更新`
4. 切到 `/products`，row P1 的 `当前库存=100`

### 5.3 服务端错误 — 超过最大库存

1. seed product P1 quantity=950, maxStock=1000
2. seed DRAFT 进货单 quantity=100
3. login → confirm → expect text `进货后将超过最大库存容量`
4. /products 中 P1 quantity 仍为 950（未变动）

### 5.4 服务端错误 — 重复确认

1. seed 一张 CONFIRMED 进货单
2. login → goto `/purchase-orders/[id]`（详情页）
3. expect 页面中无 `确认进货单` 按钮（因为 status=CONFIRMED）
4. 直接调 trpc 发 confirm —— 通过 `page.evaluate` 模拟（或 e2e-test-agent 跳过此条，由 unit 覆盖）

### 5.5 客户端零调用

1. login → goto `/purchase-orders/new`
2. counter = `countTrpcCalls(page, 'purchaseOrders.create')`
3. fill `进货数量=0`（违反 > 0）
4. click `保存`
5. expect text `进货数量必须为正整数`
6. counter == 0

### 5.6 编辑 — 仅 DRAFT 可编辑

1. seed 一张 CONFIRMED 进货单
2. login → goto `/purchase-orders/<id>/edit`
3. expect 跳转到 `/purchase-orders/<id>`（详情）
4. detail 页面显示 `已确认`，无编辑按钮

### 5.7 删除 — 仅 DRAFT 可删

1. seed 一张 CONFIRMED 进货单
2. login → 列表 → 该行无 `删除` 按钮（仅 `查看`）
3. 通过 trpc 调 delete → 抛 `ORDER_NOT_DRAFT`（由 unit 覆盖；e2e 仅断 UI 不出 删除/编辑 按钮即可）

### 5.8 单号生成（同日序列）

1. seed empty
2. login → 在 `purchaseDate=2026-05-02` 连续创建 3 张 DRAFT 单
3. 列表前 3 行的 orderNo 末 4 位严格 `0003`、`0002`、`0001`（按列表降序）

---

## 6. Out of scope

- 一单多商品（一对多明细行）—— 本期一单一商品
- 进货单作废 / 红冲
- 收货分次入库
- 与采购系统集成
