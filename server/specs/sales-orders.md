# `sales-orders` Module — Spec

## 0. Scope

出货单 CRUD + 确认（确认时自动减库存）。仅 DRAFT 单可改/删；CONFIRMED 永久不可逆。

依赖：`auth`、`products`
被依赖：`stats`

---

## 1. Data shape — `SalesOrder`

| Field | Type | Constraint |
|---|---|---|
| id | int | auto-increment, > 0 |
| orderNo | string | unique，格式 `CH` + `YYYYMMDD` + 4 位序列号 |
| productId | int | references Product.id |
| quantity | int | > 0 |
| sellPrice | number (Float) | > 0, ≤ 99999.99，2 decimals |
| totalAmount | number (Float) | = quantity × sellPrice，server 计算 |
| customer | string | trim length 1..100 |
| shipper | string | trim length 1..50 |
| remark | string? | length ≤ 1000 |
| status | string | `'DRAFT'` (default) / `'CONFIRMED'` |
| salesDate | datetime | required（参与单号生成） |
| confirmedAt | datetime? | 仅 status=CONFIRMED 时非空 |
| createdAt | datetime | set on create |
| updatedAt | datetime | set on create, refreshed on update |

---

## 2. Procedures (tRPC)

### 2.1 `salesOrders.list` (query, protected)

- **Input**:
  ```ts
  z.object({
    orderNo: z.string().optional(),
    customer: z.string().optional(),
    dateFrom: z.string().datetime().optional(),
    dateTo: z.string().datetime().optional(),
    status: z.enum(['DRAFT','CONFIRMED']).optional(),
    page: z.number().int().positive().default(1),
    pageSize: z.number().int().min(10).max(50).default(20),
  })
  ```
- **Output**: 同 `purchaseOrders.list`，但每行含 `customer` 而非 `supplier`
- **行为**: 同 purchaseOrders.list 的搜索/排序

### 2.2 `salesOrders.byId` (query, protected)

- **Input**: `z.object({ id })`
- **Output**: `SalesOrder & { product }`
- **Errors**: `UNAUTHORIZED` / `ORDER_NOT_FOUND`

### 2.3 `salesOrders.create` (mutation, protected)

- **Input**:
  ```ts
  z.object({
    productId: z.number().int().positive(),
    quantity: z.number().int().positive(),
    sellPrice: z.number().finite().positive().max(99999.99)
      .refine((n) => Math.round(n * 100) === n * 100, 'max 2 decimals'),
    customer: z.string().trim().min(1).max(100),
    shipper: z.string().trim().min(1).max(50),
    remark: z.string().max(1000).optional(),
    salesDate: z.string().datetime(),
  })
  ```
- **Output**: `SalesOrder`（status=DRAFT）
- **Errors**: `UNAUTHORIZED` / `PRODUCT_NOT_FOUND`
- **Precondition order**: 1. Zod  2. productId 存在  3. **事务**：a) `nextSalesOrderNo(db, salesDate)`  b) `totalAmount = round2(quantity * sellPrice)`  c) 持久化（status=DRAFT）
- **注意**: 创建（DRAFT）阶段**不**校验库存；库存检查只在 confirm 发生。

### 2.4 `salesOrders.update` (mutation, protected)

- **Input**:
  ```ts
  z.object({
    id: z.number().int().positive(),
    productId: z.number().int().positive().optional(),
    quantity: z.number().int().positive().optional(),
    sellPrice: z.number().finite().positive().max(99999.99).refine(...).optional(),
    customer: z.string().trim().min(1).max(100).optional(),
    shipper: z.string().trim().min(1).max(50).optional(),
    remark: z.string().max(1000).nullable().optional(),
    salesDate: z.string().datetime().optional(),
  })
  ```
- **Output**: `SalesOrder`
- **Errors**: `UNAUTHORIZED` / `ORDER_NOT_FOUND` / `ORDER_NOT_DRAFT` / `PRODUCT_NOT_FOUND`
- **Precondition order**: 1. Zod  2. id 存在  3. status=DRAFT  4. 若改 productId → 商品存在  5. 重算 totalAmount  6. 持久化（不重算 orderNo）

### 2.5 `salesOrders.delete` (mutation, protected)

- **Input**: `z.object({ id })`
- **Output**: `{ ok: true }`
- **Errors**: `UNAUTHORIZED` / `ORDER_NOT_FOUND` / `ORDER_NOT_DRAFT`
- **Precondition order**: 同 `purchaseOrders.delete`

### 2.6 `salesOrders.confirm` (mutation, protected)

- **Input**: `z.object({ id })`
- **Output**: `SalesOrder`（status=CONFIRMED, confirmedAt=now）
- **Errors**: `UNAUTHORIZED` / `ORDER_NOT_FOUND` / `ORDER_ALREADY_CONFIRMED` / `INSUFFICIENT_STOCK`
- **Precondition order**: 1. Zod  2. id 存在  3. `status === 'DRAFT'`（否则 `ORDER_ALREADY_CONFIRMED`）  4. `product.quantity ≥ order.quantity`（否则 `INSUFFICIENT_STOCK`）  5. **事务**：a) `product.quantity -= order.quantity`  b) `stockLog.create({ delta: -quantity, reason: 'SALES_ORDER:<orderNo>' })`  c) `order.status='CONFIRMED'`、`order.confirmedAt=now`

---

## 3. Invariants

- **I1** OrderNo monotone — 同一日内序列号严格 +1。
- **I2** OrderNo format — `^CH\d{8}\d{4}$`，日期段与 `salesDate` 一致。
- **I3** Status finality — DRAFT → CONFIRMED 单向。
- **I4** Confirm side-effect — 一次成功的 confirm：`product.quantity` 减少且仅减少 `order.quantity`；写入对应 StockLog（delta 负数）。
- **I5** Confirm idempotency-block — 重复 `confirm` 抛 `ORDER_ALREADY_CONFIRMED`，库存不再变。
- **I6** Edit/Delete only DRAFT — CONFIRMED 单的 update/delete 必抛 `ORDER_NOT_DRAFT`。
- **I7** Stock non-negativity — confirm 后 `product.quantity ≥ 0`。
- **I8** TotalAmount equality — `totalAmount === round2(quantity * sellPrice)`。
- **I9** DRAFT 阶段不锁库存 — 多个 DRAFT 单合计数量 > 库存时仍可创建；首个 confirm 的单先消耗，后续 confirm 若库存不足则抛 `INSUFFICIENT_STOCK`。

---

## 4. UI

### 4.1 Routes

| 路由 | 页面 |
|---|---|
| `/sales-orders` | 列表 |
| `/sales-orders/new` | 新增 |
| `/sales-orders/[id]` | 详情（CONFIRMED 时只读） |
| `/sales-orders/[id]/edit` | 编辑（仅 DRAFT；CONFIRMED 跳详情） |

### 4.2 Form fields

| Label | Field | 约束 | 错误文案 |
|---|---|---|---|
| `商品` | `productId` | int.positive() | `请选择商品` |
| `出货数量` | `quantity` | int > 0 | `出货数量必须为正整数` |
| `出货单价` | `sellPrice` | > 0, ≤ 99999.99, 2 decimals（默认填商品 sellPrice，可改） | `售价必须大于0` / `售价最多保留2位小数` |
| `出货金额` | `totalAmount` | 自动计算（disabled） | — |
| `客户` | `customer` | trim().min(1).max(100) | `客户名称不能为空` |
| `出货员` | `shipper` | trim().min(1).max(50) | `经办人不能为空` |
| `出货日期` | `salesDate` | ISO datetime（默认今天） | — |
| `备注` | `remark` | max(1000), optional | — |

### 4.3 Buttons & Toolbar

| 用途 | 文案 | 出现条件 | testid |
|---|---|---|---|
| 提交（表单） | `保存` / `保存中...` | 表单 | — |
| 工具栏新增 | `新增出货单` | 列表 | `sales-orders-create` |
| 行内编辑 | `编辑` | DRAFT | `row-<id>-edit` |
| 行内删除 | `删除` | DRAFT | `row-<id>-delete` |
| 行内确认 | `确认` | DRAFT | `row-<id>-confirm` |
| 行内查看 | `查看` | CONFIRMED | `row-<id>-view` |
| 详情页确认 | `确认出货单` | DRAFT 详情 | `confirm-button` |

### 4.4 testid catalog

| testid | 元素 |
|---|---|
| `sales-orders-list` | Table |
| `sales-orders-create` | 工具栏新增 |
| `sales-orders-search` | 搜索单号 |
| `confirm-button` | 详情页确认按钮 |

### 4.5 服务端错误展示

| Error | 中文文案 |
|---|---|
| `PRODUCT_NOT_FOUND` | `商品不存在` |
| `ORDER_NOT_FOUND` | `单据不存在` |
| `ORDER_NOT_DRAFT` | `仅草稿状态的单据可以编辑或删除` |
| `ORDER_ALREADY_CONFIRMED` | `该单据已确认，不能重复操作` |
| `INSUFFICIENT_STOCK` | `库存不足，无法出货` |

### 4.6 Submit behavior

同 purchase-orders（client zod 阻塞、server error 顶部 alert、confirm 二次确认）。
确认成功 toast：`确认成功，库存已更新`。

### 4.7 列表展示

列：`出货单号` / `商品名称` / `出货数量` / `出货日期` / `客户` / `出货员` / `状态（草稿/已确认）` / `操作`

---

## 5. E2E flow

### 5.1 Happy path — 创建 + 确认 → 库存递减

1. `resetBackend({ categories:[{name:'C1'}], suppliers:[{name:'S1'}], products:[{ code:'P1', name:'X', categoryName:'C1', supplierName:'S1', costPrice:10, sellPrice:20, quantity:50, unit:'件', minStock:1, maxStock:1000 }] })`
2. login → `nav-sales-orders` → click `sales-orders-create`
3. select 商品 P1, fill 出货数量=10, 客户=`王五`, 出货员=`李四`
4. click `保存` → URL `/sales-orders`，列表 1 张 DRAFT 单
5. click `row-<id>-confirm` → `modal-confirm`
6. toast `确认成功，库存已更新`
7. /products 中 P1 quantity = 40

### 5.2 服务端错误 — 库存不足

1. seed product quantity=5
2. seed DRAFT 出货单 quantity=10
3. login → 列表 → confirm → expect text `库存不足，无法出货`
4. product quantity 仍 5

### 5.3 客户端零调用

1. login → goto `/sales-orders/new`
2. counter = `countTrpcCalls(page, 'salesOrders.create')`
3. fill 出货数量=0
4. click `保存`
5. expect text `出货数量必须为正整数`
6. counter == 0

### 5.4 DRAFT 阶段不锁库存

1. seed product quantity=10
2. 创建 2 张 DRAFT 单 each quantity=10
3. confirm 第 1 张 → 成功，product.quantity=0
4. confirm 第 2 张 → expect `库存不足，无法出货`

### 5.5 CONFIRMED 单的 UI 只读

1. seed 一张 CONFIRMED 出货单
2. login → 列表 → 该行仅 `查看`，无 `编辑/删除/确认`
3. goto `/sales-orders/<id>` → 显示 `已确认`，无确认按钮

### 5.6 单号生成（CH 前缀，同日序列）

1. seed 空
2. login → `salesDate=2026-05-02` 连续建 3 张
3. 单号末 4 位严格 0001/0002/0003

---

## 6. Out of scope

- 一单多明细
- 出货单作废
- 退货流程
- 与发货物流系统集成
