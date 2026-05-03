# Products Module — Spec

This file is the **single source of truth** for the `products` module.
- The test agent reads ONLY this spec (and Zod schemas it points to). It does NOT read the implementation.
- The implementation MUST satisfy every assertion derivable from this spec.
- If spec and impl disagree, spec wins. Update spec first, then re-derive tests.

---

## 1. Data shape — `Product` row

| Field        | Type      | Constraint                                          |
|--------------|-----------|-----------------------------------------------------|
| id           | int       | auto-increment, > 0                                 |
| code         | string    | matches `^[A-Za-z0-9-]{3,20}$`, globally unique     |
| name         | string    | trimmed length 1..100                               |
| categoryId   | int       | references Category.id                              |
| description  | string?   | length ≤ 1000                                       |
| costPrice    | number    | finite, > 0, ≤ 2 decimal places                     |
| sellPrice    | number    | finite, > 0, ≤ 2 decimal places                     |
| quantity     | int       | ≥ 0                                                 |
| unit         | string    | length 1..20                                        |
| supplierId   | int       | references Supplier.id                              |
| minStock     | int       | > 0                                                 |
| maxStock     | int       | > minStock                                          |
| createdAt    | datetime  | set on create                                       |
| updatedAt    | datetime  | set on create, refreshed on update                  |

---

## 2. Procedures (tRPC)

### 2.1 `products.create` (mutation)
**Input**: Product row excluding `id`, `createdAt`, `updatedAt`. Same constraints.
**Output**: full Product row that was persisted. Numeric fields preserve input exactly.
**Error codes** (TRPCError):
- `BAD_REQUEST` — any input constraint violated (Zod handles)
- `CONFLICT` w/ message `CODE_EXISTS` — code already exists
- `NOT_FOUND` w/ message `CATEGORY_NOT_FOUND` — categoryId not in Category
- `NOT_FOUND` w/ message `SUPPLIER_NOT_FOUND` — supplierId not in Supplier

**Pre-condition order**: Zod → category exists → supplier exists → code unique → persist.

### 2.2 `products.byId` (query)
Input: `{ id: positive int }` → returns Product or throws `NOT_FOUND`.

### 2.3 `products.byCode` (query)
Input: `{ code: string }` → returns Product or `null`.

---

## 3. Invariants (must hold across any sequence of operations)

- **I1** Code uniqueness — at no time do two persisted Products share the same code.
- **I2** Round-trip fidelity — for any successful `create(X)`: `byId(returned.id)` returns
  a row equal to X (after Zod parsing) plus id/createdAt/updatedAt.
- **I3** Positive id — every persisted Product has id > 0.
- **I4** Stock non-negativity — every persisted Product has quantity ≥ 0.
- **I5** Stock range validity — every persisted Product has minStock < maxStock.
- **I6** Numeric preservation — `Number(persisted.costPrice) === input.costPrice`
  for any input within the constraints.
- **I7** Trim invariant — persisted name has no leading/trailing whitespace.

---

## 4. UI — Product create form

Page: `/products/new`. Component: `<ProductForm/>`.

**Props**: `categories: { id, name }[]`, `suppliers: { id, name }[]`, `onSubmit: (values) => Promise<void>`.

**Fields & labels** (Chinese): 编码, 名称, 分类, 进价, 售价, 初始库存, 单位, 供应商, 最小库存, 最大库存, 描述.

**Submit button**: text `保存`. While submitting, disabled and labeled `保存中...`.

**Validation messages** (exact text, shown next to field with `role="alert"`):
| Field   | Message                                |
|---------|----------------------------------------|
| 编码     | `编码必须为3-20位字母数字或短横线`         |
| 名称     | `名称不能为空`                           |
| 分类     | `请选择分类`                             |
| 进价     | `进价必须大于0`                          |
| 售价     | `售价必须大于0`                          |
| 初始库存  | `库存数量必须 >= 0`                      |
| 单位     | `请填写单位`                             |
| 供应商   | `请选择供应商`                           |
| 最小库存  | `最小库存必须 > 0`                       |
| 最大库存  | `最大库存必须大于最小库存`                |

**Submit behavior**:
- Calls `onSubmit(parsedValues)` ONLY when all fields valid.
- Does NOT call `onSubmit` if any field invalid.

---

## 5. E2E flow

1. User navigates to `/products/new`.
2. User fills all required fields with valid values.
3. User clicks `保存`.
4. **Success**: navigate to `/products`, the new product code is visible in the list.
5. **CODE_EXISTS error**: stay on `/products/new`, show server error in `role="alert"`.
