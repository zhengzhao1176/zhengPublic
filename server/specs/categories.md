# `categories` Module — Spec

## 0. Scope

商品分类的 CRUD。与商品（Product）一对多。删除前必须无商品引用。

依赖：`auth`（protected）
被依赖：`products`、`stats`

---

## 1. Data shape — `Category`

| Field | Type | Constraint |
|---|---|---|
| id | int | auto-increment, > 0 |
| name | string | unique (case-sensitive)，trimmed length 1..50 |
| description | string? | length ≤ 1000 |
| createdAt | datetime | set on create |
| updatedAt | datetime | set on create, refreshed on update |

---

## 2. Procedures (tRPC)

### 2.1 `categories.list` (query, protected)

- **Input** (Zod):
  ```ts
  z.object({ keyword: z.string().optional() })
  ```
- **Output**: `Category[]`
- **Errors**: `UNAUTHORIZED`
- **行为**: keyword 模糊匹配 `name`（大小写不敏感，substring）；按 `id` 升序。

### 2.2 `categories.byId` (query, protected)

- **Input**: `z.object({ id: z.number().int().positive() })`
- **Output**: `Category`
- **Errors**: `UNAUTHORIZED` / `CATEGORY_NOT_FOUND`

### 2.3 `categories.create` (mutation, protected)

- **Input**:
  ```ts
  z.object({
    name: z.string().trim().min(1).max(50),
    description: z.string().max(1000).optional(),
  })
  ```
- **Output**: `Category`
- **Errors**: `UNAUTHORIZED` / `CATEGORY_NAME_EXISTS`
- **Precondition order**: 1. Zod  2. trim 后的 name 全局唯一（否则 `CATEGORY_NAME_EXISTS`）  3. 持久化

### 2.4 `categories.update` (mutation, protected)

- **Input**:
  ```ts
  z.object({
    id: z.number().int().positive(),
    name: z.string().trim().min(1).max(50).optional(),
    description: z.string().max(1000).nullable().optional(), // null = 清空
  })
  ```
- **Output**: `Category`
- **Errors**: `UNAUTHORIZED` / `CATEGORY_NOT_FOUND` / `CATEGORY_NAME_EXISTS`
- **Precondition order**: 1. Zod  2. id 存在（否则 `CATEGORY_NOT_FOUND`）  3. 若 name 提供且与他行冲突（otherCategory.name === input.name 且 otherCategory.id ≠ id） → `CATEGORY_NAME_EXISTS`  4. 持久化

### 2.5 `categories.delete` (mutation, protected)

- **Input**: `z.object({ id: z.number().int().positive() })`
- **Output**: `{ ok: true }`
- **Errors**: `UNAUTHORIZED` / `CATEGORY_NOT_FOUND` / `CATEGORY_IN_USE`
- **Precondition order**: 1. Zod  2. id 存在  3. `count(products WHERE categoryId = id) === 0`（否则 `CATEGORY_IN_USE`）  4. 删除

---

## 3. Invariants

- **I1** Name uniqueness — 任意时刻 `count(c WHERE c.name === X) ≤ 1`，X 为 trim 后的字符串。
- **I2** Round-trip — `create({ name, description })` 后 `byId(returned.id).name === name.trim()`、`byId(...).description === description ?? null`。
- **I3** No orphan products — 当 `categoryId = X` 的 Product count > 0 时，`delete({id:X})` 必抛 `CATEGORY_IN_USE`，且 row 仍存在。
- **I4** Trim invariant — 持久化的 `name` 不含前导/尾随空白。
- **I5** Update doesn't break uniqueness — 任意 update 后仍满足 I1。

---

## 4. UI

### 4.1 Routes & Pages

| 路由 | 页面 |
|---|---|
| `/categories` | 列表页（搜索 + 表格 + 新增） |
| `/categories/new` | 新增表单 |
| `/categories/[id]/edit` | 编辑表单（id 路径参数） |

### 4.2 Form fields

| Label (中文 + aria-label) | Field name | Type | 约束 | 错误文案（字面量） |
|---|---|---|---|---|
| `分类名称` | `name` | text | trim().min(1).max(50) | `分类名称不能为空` / `分类名称长度不能超过50` |
| `描述` | `description` | textarea | max(1000), optional | `描述长度不能超过1000` |

### 4.3 Buttons

| 用途 | 文案 | 提交中文案 |
|---|---|---|
| 提交 | `保存` | `保存中...` |

### 4.4 testid catalog

| testid | 元素 |
|---|---|
| `categories-list` | Table |
| `categories-create` | 工具栏新增按钮 |
| `categories-search` | 工具栏搜索框 |
| `row-<id>` | 表格行 |
| `row-<id>-edit` | 行内编辑按钮 |
| `row-<id>-delete` | 行内删除按钮 |
| `modal-confirm` | 二次确认弹窗确认 |
| `modal-cancel` | 二次确认弹窗取消 |

### 4.5 服务端错误展示

| Error message | 中文 toast / page-level |
|---|---|
| `CATEGORY_NAME_EXISTS` | `分类名称已存在` |
| `CATEGORY_IN_USE` | `该分类下还有商品，不能删除` |
| `CATEGORY_NOT_FOUND` | `所选分类不存在` |

### 4.6 Submit behavior

- 客户端 Zod 失败 → 字段级 alert，**不**调 mutation
- 服务端 `CATEGORY_NAME_EXISTS` → 表单顶部 page-level alert，URL 不变
- 成功 → toast `创建成功` / `更新成功`，跳 `/categories`
- 删除 → 二次确认（`确认删除？` / `删除后不可恢复，是否继续？`），成功后 toast `删除成功`，列表自动刷新

### 4.7 列表展示

列：`分类名称` / `描述` / `创建时间` / `操作（编辑、删除）`

---

## 5. E2E flow

### 5.1 Happy path — 创建

1. `resetBackend()` → `login(page)`
2. click `nav-categories` → 在 `/categories`
3. click `categories-create` → 在 `/categories/new`
4. fill `分类名称=电子产品`, `描述=`
5. click `保存`
6. expect URL `/categories`
7. expect text `电子产品` 可见
8. expect text `创建成功` 可见（toast）

### 5.2 服务端错误 — 重名

1. seed `categories: [{ name: '电子产品' }]`
2. `login(page)` → goto `/categories/new`
3. fill `分类名称=电子产品`
4. click `保存`
5. expect text `分类名称已存在` 可见
6. URL 仍 `/categories/new`

### 5.3 客户端校验"零调用"

1. `login(page)` → goto `/categories/new`
2. counter = `countTrpcCalls(page, 'categories.create')`
3. 不填 → click `保存`
4. expect text `分类名称不能为空` 可见
5. wait 300ms; counter == 0

### 5.4 删除 — 有商品引用

1. seed `categories: [{ name: '电子产品' }], suppliers: [{ name: 'S1' }], products: [{ code: 'P1', name: 'X', categoryName: '电子产品', supplierName: 'S1', costPrice: 1, sellPrice: 2, quantity: 0, unit: '件', minStock: 1, maxStock: 10 }]`
2. `login(page)` → goto `/categories`
3. click `row-<id>-delete` (id 为电子产品 id)
4. click `modal-confirm`
5. expect text `该分类下还有商品，不能删除` 可见

### 5.5 删除 — 可删

1. seed 仅一个空分类
2. `login(page)` → goto `/categories`
3. click `row-<id>-delete` → click `modal-confirm`
4. expect text `删除成功`
5. expect 该 row 消失

---

## 6. Out of scope

- 分类树（多级）
- 分类的合并/拆分
- 历史记录
