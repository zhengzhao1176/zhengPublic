# `products` Module — Spec

## 0. Scope

商品 CRUD（含批量删除、列表搜索/筛选/分页）。是库存系统的"底盘"。

依赖：`auth`、`categories`、`suppliers`
被依赖：`purchase-orders`、`sales-orders`、`stats`

---

## 1. Data shape — `Product`

| Field | Type | Constraint |
|---|---|---|
| id | int | auto-increment, > 0 |
| code | string | matches `^[A-Za-z0-9-]{3,20}$`，全局唯一（区分大小写） |
| name | string | trimmed length 1..100 |
| categoryId | int | references Category.id |
| description | string? | length ≤ 1000 |
| costPrice | number (Float) | finite, > 0, ≤ 99999.99，最多 2 位小数 |
| sellPrice | number (Float) | 同上 |
| quantity | int | ≥ 0 |
| unit | string | length 1..20 |
| supplierId | int | references Supplier.id |
| minStock | int | > 0 |
| maxStock | int | > minStock |
| createdAt | datetime | set on create |
| updatedAt | datetime | set on create, refreshed on update |

---

## 2. Procedures (tRPC)

### 2.1 `products.list` (query, protected)

- **Input**:
  ```ts
  z.object({
    keyword: z.string().optional(),
    categoryId: z.number().int().positive().optional(),
    stockStatus: z.enum(['ALL','LOW','OVER','NORMAL']).default('ALL'),
    page: z.number().int().positive().default(1),
    pageSize: z.number().int().min(10).max(50).default(20),
  })
  ```
- **Output**:
  ```ts
  {
    items: Array<Product & { category: { id, name }; supplier: { id, name } }>,
    total: number,
    page: number,
    pageSize: number,
  }
  ```
- **行为**:
  - keyword 同时模糊匹配 `code` 与 `name`（大小写不敏感，substring）
  - stockStatus：`LOW = quantity ≤ minStock`、`OVER = quantity ≥ maxStock`、`NORMAL = (quantity > minStock AND quantity < maxStock)`、`ALL = 任一`
  - 排序：`id` 降序
  - `total` 是过滤后的总数；`items` 长度 ≤ pageSize

### 2.2 `products.byId` (query, protected)

- **Input**: `z.object({ id })`
- **Output**: `Product & { category, supplier }`
- **Errors**: `UNAUTHORIZED` / `PRODUCT_NOT_FOUND`

### 2.3 `products.byCode` (query, protected)

- **Input**: `z.object({ code: z.string() })`
- **Output**: `(Product & { category, supplier }) | null`
- **Errors**: `UNAUTHORIZED`（不存在不抛错，返回 null）

### 2.4 `products.create` (mutation, protected)

- **Input**:
  ```ts
  z.object({
    code: z.string().regex(/^[A-Za-z0-9-]{3,20}$/),
    name: z.string().trim().min(1).max(100),
    categoryId: z.number().int().positive(),
    description: z.string().max(1000).optional(),
    costPrice: z.number().finite().positive().max(99999.99)
      .refine((n) => Math.round(n * 100) === n * 100, 'max 2 decimals'),
    sellPrice: z.number().finite().positive().max(99999.99)
      .refine((n) => Math.round(n * 100) === n * 100, 'max 2 decimals'),
    quantity: z.number().int().nonnegative(),
    unit: z.string().min(1).max(20),
    supplierId: z.number().int().positive(),
    minStock: z.number().int().positive(),
    maxStock: z.number().int(),
  }).refine((d) => d.maxStock > d.minStock, {
    message: 'maxStock must be greater than minStock',
    path: ['maxStock'],
  })
  ```
- **Output**: `Product`
- **Errors**: `UNAUTHORIZED` / `CATEGORY_NOT_FOUND` / `SUPPLIER_NOT_FOUND` / `CODE_EXISTS`
- **Precondition order**: 1. Zod  2. categoryId 存在（否则 `CATEGORY_NOT_FOUND`）  3. supplierId 存在（否则 `SUPPLIER_NOT_FOUND`）  4. code 全局唯一（否则 `CODE_EXISTS`）  5. 持久化

### 2.5 `products.update` (mutation, protected)

- **Input**: 与 create 同（含 refine），但 `code` **不可改**（schema 中 `.omit({ code: true })`）；其余字段可缺省（partial）；额外要求 `id`：
  ```ts
  z.object({
    id: z.number().int().positive(),
    name: z.string().trim().min(1).max(100).optional(),
    categoryId: z.number().int().positive().optional(),
    description: z.string().max(1000).nullable().optional(),
    costPrice: z.number().finite().positive().max(99999.99).refine(...).optional(),
    sellPrice: z.number().finite().positive().max(99999.99).refine(...).optional(),
    quantity: z.number().int().nonnegative().optional(),
    unit: z.string().min(1).max(20).optional(),
    supplierId: z.number().int().positive().optional(),
    minStock: z.number().int().positive().optional(),
    maxStock: z.number().int().optional(),
  }).superRefine((d, ctx) => {
    // 当 minStock 与 maxStock 至少一个被改动时，最终态必须 maxStock > minStock
  })
  ```
- **Output**: `Product`
- **Errors**: `UNAUTHORIZED` / `PRODUCT_NOT_FOUND` / `CATEGORY_NOT_FOUND` / `SUPPLIER_NOT_FOUND`
- **Precondition order**: 1. Zod  2. id 存在  3. 若改 categoryId → cat 存在  4. 若改 supplierId → sup 存在  5. 合并后 maxStock > minStock（router 内做最终校验，否则 `BAD_REQUEST`）  6. 持久化

### 2.6 `products.delete` (mutation, protected)

- **Input**: `z.object({ id })`
- **Output**: `{ ok: true }`
- **Errors**: `UNAUTHORIZED` / `PRODUCT_NOT_FOUND` / `PRODUCT_HAS_STOCK`
- **Precondition order**: 1. Zod  2. id 存在  3. `quantity === 0`（否则 `PRODUCT_HAS_STOCK`）  4. 删除

### 2.7 `products.batchDelete` (mutation, protected)

- **Input**: `z.object({ ids: z.array(z.number().int().positive()).min(1).max(100) })`
- **Output**:
  ```ts
  {
    deletedIds: number[],
    failed: Array<{ id: number; reason: 'PRODUCT_NOT_FOUND' | 'PRODUCT_HAS_STOCK' }>
  }
  ```
- **Errors**: `UNAUTHORIZED`（仅 auth；其余以 `failed` 数组返回，不抛错）
- **行为**: 对每个 id 独立尝试删除，结果分桶返回。不创建/不触发任何事务回滚（每个删除独立）。

---

## 3. Invariants

- **I1** Code uniqueness — 任意时刻 `count(p WHERE p.code === X) ≤ 1`。
- **I2** Round-trip — 任意 valid create(X) 后 `byId(returned.id)` 等于 X（name trim 后；数值精确保留 2 位）。
- **I3** Positive id — 每个持久化的 Product 满足 `id > 0`。
- **I4** Stock non-negativity — 每个持久化的 Product 满足 `quantity ≥ 0`。
- **I5** Stock range validity — 每个持久化的 Product 满足 `minStock < maxStock`。
- **I6** Numeric preservation — `Number(persisted.costPrice) === input.costPrice` 对任意合规输入成立。
- **I7** Trim invariant — 持久化 `name` 无前后空白。
- **I8** Delete only when empty — 当 `quantity > 0` 时 `delete` 必抛 `PRODUCT_HAS_STOCK`，且 row 仍存在。
- **I9** batchDelete partial fidelity — `deletedIds` 中所有 id 在调用后真的不存在；`failed` 中所有 id 在调用后仍存在。
- **I10** Category/Supplier referential integrity — `create/update` 必拒绝指向不存在的 categoryId / supplierId。

---

## 4. UI

### 4.1 Routes

| 路由 | 页面 |
|---|---|
| `/products` | 列表（搜索 + 筛选 + 分页 + 工具栏 + 行内编辑/删除 + 批量删除） |
| `/products/new` | 新增表单 |
| `/products/[id]/edit` | 编辑表单（`code` 字段 disabled） |

### 4.2 Form fields

| Label | Field | 约束 | 错误文案（字面量） |
|---|---|---|---|
| `编码` | `code` | regex `^[A-Za-z0-9-]{3,20}$` | `编码必须为3-20位字母数字或短横线` |
| `名称` | `name` | trim().min(1).max(100) | `名称不能为空` / `名称长度不能超过100` |
| `分类` | `categoryId` | int.positive() | `请选择分类` |
| `描述` | `description` | max(1000), optional | `描述长度不能超过1000` |
| `进价` | `costPrice` | > 0, ≤ 99999.99, ≤ 2 decimals | `进价必须大于0` / `进价最多保留2位小数` |
| `售价` | `sellPrice` | > 0, ≤ 99999.99, ≤ 2 decimals | `售价必须大于0` / `售价最多保留2位小数` |
| `初始库存` | `quantity` | int ≥ 0 | `库存数量必须 >= 0` |
| `单位` | `unit` | min(1).max(20) | `请填写单位` |
| `供应商` | `supplierId` | int.positive() | `请选择供应商` |
| `最小库存` | `minStock` | int > 0 | `最小库存必须 > 0` |
| `最大库存` | `maxStock` | int > minStock | `最大库存必须大于最小库存` |

### 4.3 Buttons & Toolbar

| 用途 | 文案 | testid |
|---|---|---|
| 提交（表单） | `保存` / 提交中 `保存中...` | — |
| 列表新增 | `新增商品` | `products-create` |
| 列表批量删除 | `批量删除` | `products-batch-delete` |
| 行内编辑 | `编辑` | `row-<id>-edit` |
| 行内删除 | `删除` | `row-<id>-delete` |

### 4.4 testid catalog

见 `04-前端规范.md` §5（products 范围）。

### 4.5 服务端错误展示

| Error | 中文文案 |
|---|---|
| `CODE_EXISTS` | `商品编码已存在` |
| `CATEGORY_NOT_FOUND` | `所选分类不存在` |
| `SUPPLIER_NOT_FOUND` | `所选供应商不存在` |
| `PRODUCT_NOT_FOUND` | `商品不存在` |
| `PRODUCT_HAS_STOCK` | `库存量大于0的商品不能删除，请先清空库存` |

### 4.6 Submit behavior

- 客户端 Zod 失败 → 字段级 alert，**不**调 mutation
- `CODE_EXISTS` / `CATEGORY_NOT_FOUND` / `SUPPLIER_NOT_FOUND` → 顶部 page-level alert，URL 不变
- 成功 → toast `创建成功` / `更新成功`，跳 `/products`
- 删除 → 二次确认 `确认删除？` / `删除后不可恢复，是否继续？`；成功 toast `删除成功`，刷新列表
- 批量删除 → 二次确认 `确认批量删除？` / `共 N 项，删除后不可恢复，是否继续？`；toast 给出"全部成功"或"部分失败：N 项"

### 4.7 列表展示

列：`编码` / `名称` / `分类` / `当前库存` / `单位` / `进价` / `售价` / `供应商` / `操作（编辑、删除）`

工具栏：搜索框（搜索编码或名称）、分类筛选下拉（含"全部"）、库存状态筛选下拉（全部/低库存/超容量/正常）、新增按钮、批量删除按钮（仅当至少 1 行被勾选时启用）

分页：每页 10/20/30/50 可选，默认 20。

---

## 5. E2E flow

### 5.1 Happy path — 创建

1. `resetBackend({ categories:[{name:'类别A'}], suppliers:[{name:'供应商A'}] })`
2. `login(page)`
3. nav → `nav-products` → `/products`
4. `products-create` → `/products/new`
5. fill 全部字段（valid），select 分类 `类别A` 与供应商 `供应商A`
6. click `保存`
7. expect URL `/products`，text `E2E001` 可见，toast `创建成功`

### 5.2 服务端错误 — 重复编码

1. seed 已含 product code=`DUP001`
2. login → goto `/products/new`
3. fill code=`DUP001` 与其他字段
4. click `保存`
5. expect text `商品编码已存在` 可见，URL 仍 `/products/new`

### 5.3 客户端零调用

1. login → goto `/products/new`
2. counter = `countTrpcCalls(page, 'products.create')`
3. fill code=`AB`（太短）+ 其他随便
4. click `保存`
5. expect text `编码必须为3-20位字母数字或短横线`
6. counter == 0

### 5.4 删除 — 库存 > 0

1. seed product quantity=5
2. login → `/products` → click `row-<id>-delete` → click `modal-confirm`
3. expect text `库存量大于0的商品不能删除，请先清空库存`

### 5.5 删除 — quantity=0

1. seed product quantity=0
2. login → delete → toast `删除成功`，row 消失

### 5.6 批量删除（部分失败）

1. seed 3 个 product：A.qty=0, B.qty=0, C.qty=5
2. login → `/products` → 勾选三行 → `products-batch-delete` → `modal-confirm`
3. expect toast `删除成功`
4. expect toast `部分失败：1 项`
5. expect 列表中 A、B 消失，C 仍在

### 5.7 编辑 — 编码不可改

1. seed product
2. login → `row-<id>-edit` → 在 `/products/<id>/edit`
3. expect 编码字段 disabled
4. 改 `名称`、`售价` → `保存` → toast `更新成功` → 跳 `/products`

### 5.8 列表筛选

1. seed 3 个 product：低库存、超容量、正常各一
2. login → `/products`
3. select 库存状态=`低库存` → expect 仅低库存可见
4. fill `products-search` 搜索某编码 → expect 仅匹配的可见

---

## 6. Out of scope

- SKU 多规格
- 商品图片
- 商品调价历史
- 多仓库库存
