# `suppliers` Module — Spec

## 0. Scope

供应商的 CRUD。与商品（Product）一对多，与进货单（PurchaseOrder）一对多。删除前必须无商品/订单引用。

依赖：`auth`
被依赖：`products`、`purchase-orders`

---

## 1. Data shape — `Supplier`

| Field | Type | Constraint |
|---|---|---|
| id | int | auto-increment, > 0 |
| name | string | unique，trimmed length 1..100 |
| contact | string? | length ≤ 50 |
| address | string? | length ≤ 255 |
| createdAt | datetime | set on create |
| updatedAt | datetime | set on create, refreshed on update |

---

## 2. Procedures (tRPC)

### 2.1 `suppliers.list` (query, protected)

- **Input**: `z.object({ keyword: z.string().optional() })`
- **Output**: `Supplier[]`
- **行为**: keyword 模糊匹配 `name`（大小写不敏感）；按 `id` 升序。

### 2.2 `suppliers.byId` (query, protected)

- **Input**: `z.object({ id: z.number().int().positive() })`
- **Output**: `Supplier`
- **Errors**: `UNAUTHORIZED` / `SUPPLIER_NOT_FOUND`

### 2.3 `suppliers.create` (mutation, protected)

- **Input**:
  ```ts
  z.object({
    name: z.string().trim().min(1).max(100),
    contact: z.string().max(50).optional(),
    address: z.string().max(255).optional(),
  })
  ```
- **Output**: `Supplier`
- **Errors**: `UNAUTHORIZED` / `SUPPLIER_NAME_EXISTS`
- **Precondition order**: 1. Zod  2. name 唯一  3. 持久化

### 2.4 `suppliers.update` (mutation, protected)

- **Input**:
  ```ts
  z.object({
    id: z.number().int().positive(),
    name: z.string().trim().min(1).max(100).optional(),
    contact: z.string().max(50).nullable().optional(),
    address: z.string().max(255).nullable().optional(),
  })
  ```
- **Output**: `Supplier`
- **Errors**: `UNAUTHORIZED` / `SUPPLIER_NOT_FOUND` / `SUPPLIER_NAME_EXISTS`
- **Precondition order**: 1. Zod  2. id 存在  3. （若改 name）name 与他行不冲突  4. 持久化

### 2.5 `suppliers.delete` (mutation, protected)

- **Input**: `z.object({ id: z.number().int().positive() })`
- **Output**: `{ ok: true }`
- **Errors**: `UNAUTHORIZED` / `SUPPLIER_NOT_FOUND` / `SUPPLIER_IN_USE`
- **Precondition order**: 1. Zod  2. id 存在  3. `count(products WHERE supplierId=id) === 0` AND `count(purchaseOrders WHERE supplierId=id) === 0`（否则 `SUPPLIER_IN_USE`）  4. 删除

---

## 3. Invariants

- **I1** Name uniqueness — 任意时刻每个 trim 后的 name 至多对应一行。
- **I2** Round-trip — `create({ name, contact, address })` 后 `byId(returned.id)` 等于 `{ name: trim(name), contact ?? null, address ?? null, ... }`。
- **I3** No orphan refs — 当 supplier 被 product 或 purchase order 引用时，`delete` 必抛 `SUPPLIER_IN_USE`。
- **I4** Trim invariant — 持久化 name 无前后空白。

---

## 4. UI

### 4.1 Routes

| 路由 | 页面 |
|---|---|
| `/suppliers` | 列表 |
| `/suppliers/new` | 新增 |
| `/suppliers/[id]/edit` | 编辑 |

### 4.2 Form fields

| Label | Field | 约束 | 错误文案 |
|---|---|---|---|
| `供应商名称` | `name` | trim().min(1).max(100) | `供应商名称不能为空` / `供应商名称长度不能超过100` |
| `联系电话` | `contact` | max(50), optional | — |
| `地址` | `address` | max(255), optional | — |

### 4.3 Buttons

| 用途 | 文案 | 提交中 |
|---|---|---|
| 提交 | `保存` | `保存中...` |

### 4.4 testid catalog

| testid | 元素 |
|---|---|
| `suppliers-list` | Table |
| `suppliers-create` | 新增按钮 |
| `suppliers-search` | 搜索框 |
| `row-<id>` | 行 |
| `row-<id>-edit` / `row-<id>-delete` | 行内按钮 |
| `modal-confirm` / `modal-cancel` | 弹窗 |

### 4.5 服务端错误展示

| Error | 中文文案 |
|---|---|
| `SUPPLIER_NAME_EXISTS` | `供应商名称已存在` |
| `SUPPLIER_IN_USE` | `该供应商被商品或订单引用，不能删除` |
| `SUPPLIER_NOT_FOUND` | `所选供应商不存在` |

### 4.6 Submit behavior

同 categories（client zod 阻塞、server error 顶部 alert、success toast + 跳列表）

### 4.7 列表展示

列：`供应商名称` / `联系电话` / `地址` / `创建时间` / `操作`

---

## 5. E2E flow

### 5.1 Happy path

1. `resetBackend()` → `login(page)`
2. click `nav-suppliers` → goto `/suppliers/new` via `suppliers-create`
3. fill `供应商名称=联想`, `联系电话=10086`, `地址=北京市`
4. click `保存`
5. expect URL `/suppliers`，text `联想` 可见，toast `创建成功`

### 5.2 服务端错误 — 重名

1. seed `suppliers: [{ name: '联想' }]`
2. `login(page)` → goto `/suppliers/new`
3. fill `供应商名称=联想` → click `保存`
4. expect text `供应商名称已存在` 可见

### 5.3 客户端零调用

1. `login(page)` → goto `/suppliers/new`
2. counter = `countTrpcCalls(page, 'suppliers.create')`
3. 不填 → click `保存`
4. expect text `供应商名称不能为空` 可见
5. counter == 0

### 5.4 删除 — 有商品引用

1. seed `suppliers: [{ name: 'S1' }], categories: [{ name: 'C1' }], products: [{ code: 'P1', name: 'X', categoryName:'C1', supplierName:'S1', costPrice:1, sellPrice:2, quantity:0, unit:'件', minStock:1, maxStock:10 }]`
2. login → goto `/suppliers`
3. click row delete → modal confirm
4. expect text `该供应商被商品或订单引用，不能删除`

### 5.5 删除 — 可删

1. seed `suppliers: [{ name: 'S1' }]`
2. login → delete → expect `删除成功`

---

## 6. Out of scope

- 供应商评级、合同管理
- 多联系人、银行账户
