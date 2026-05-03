# 03 — tRPC 契约（API）

> 唯一权威：本文档列出**全部**对外 procedure 的 input / output / error / 前置顺序。
>
> 唯一负责生成"骨架"的 agent：`trpc-contract-agent`（仅写 Zod input 与占位 throw，不写业务）。
> 各模块 backend-impl-agent 在骨架上**填充业务**。
>
> **Zod 校验失败统一由 tRPC 包成 `BAD_REQUEST`，agent 无需手抛**。
> **错误 message 必须使用 `00-技术约束.md` §6 的字面量。**

---

## 1. 路由树

```
appRouter
├── auth
│   ├── login          (mutation, public)
│   ├── logout         (mutation, public)
│   └── me             (query,    public)   // 未登录返回 null，不抛错
├── categories
│   ├── list           (query,    protected)
│   ├── byId           (query,    protected)
│   ├── create         (mutation, protected)
│   ├── update         (mutation, protected)
│   └── delete         (mutation, protected)
├── suppliers
│   ├── list           (query,    protected)
│   ├── byId           (query,    protected)
│   ├── create         (mutation, protected)
│   ├── update         (mutation, protected)
│   └── delete         (mutation, protected)
├── products
│   ├── list           (query,    protected)
│   ├── byId           (query,    protected)
│   ├── byCode         (query,    protected)
│   ├── create         (mutation, protected)
│   ├── update         (mutation, protected)
│   ├── delete         (mutation, protected)
│   └── batchDelete    (mutation, protected)
├── purchaseOrders
│   ├── list           (query,    protected)
│   ├── byId           (query,    protected)
│   ├── create         (mutation, protected)   // 生成单号，状态=DRAFT
│   ├── update         (mutation, protected)   // 仅 DRAFT 可改
│   ├── delete         (mutation, protected)   // 仅 DRAFT 可删
│   └── confirm        (mutation, protected)   // DRAFT→CONFIRMED；增加库存
├── salesOrders
│   ├── list           (query,    protected)
│   ├── byId           (query,    protected)
│   ├── create         (mutation, protected)
│   ├── update         (mutation, protected)
│   ├── delete         (mutation, protected)
│   └── confirm        (mutation, protected)   // DRAFT→CONFIRMED；减少库存
└── stats
    ├── overview       (query,    protected)   // 仪表板汇总
    ├── alerts         (query,    protected)   // 库存预警
    ├── trend          (query,    protected)   // 单品库存变化
    └── report         (query,    protected)   // 报表（JSON；前端转 Excel）
```

> **未登录用户**：所有 `protected` procedure 抛 `UNAUTHORIZED`；前端拦截后跳 `/login`。
> **`auth.me`** 始终是 `public`，已登录返回 `{ id, username }`，未登录返回 `null`，**不抛错**。

---

## 2. auth 模块

### 2.1 `auth.login` (mutation)

| 项 | 内容 |
|---|---|
| Input | `z.object({ username: z.string().trim().min(1), password: z.string().min(1) })` |
| 副作用 | 通过 `Set-Cookie: inv_token=<jwt>; HttpOnly; SameSite=Lax; Path=/`（有效 7 天） |
| Output | `{ id: number; username: string }` |
| Errors | `INVALID_CREDENTIALS`（用户名不存在 OR 密码错） |
| 前置顺序 | Zod → user 存在 → bcrypt 比对 → 颁发 JWT → 写 cookie |

> 实现要点：用户名 trim 后比对；密码哈希用 `bcrypt.compare`。任意失败均使用相同 `INVALID_CREDENTIALS`，不透露是哪一个错（防枚举）。

### 2.2 `auth.logout` (mutation)

| 项 | 内容 |
|---|---|
| Input | `z.void()` |
| 副作用 | 清 cookie：`Set-Cookie: inv_token=; Max-Age=0; Path=/` |
| Output | `{ ok: true }` |
| Errors | — |

### 2.3 `auth.me` (query)

| 项 | 内容 |
|---|---|
| Input | `z.void()` |
| Output | `{ id: number; username: string } \| null` |
| Errors | — |

---

## 3. categories 模块

### 3.1 `categories.list` (query)

| 项 | 内容 |
|---|---|
| Input | `z.object({ keyword: z.string().optional() })` |
| Output | `Category[]`（按 `id` 升序）；keyword 模糊匹配 `name`（大小写不敏感） |
| Errors | — |

### 3.2 `categories.byId` (query)

| 项 | 内容 |
|---|---|
| Input | `z.object({ id: z.number().int().positive() })` |
| Output | `Category` |
| Errors | `CATEGORY_NOT_FOUND` |

### 3.3 `categories.create` (mutation)

| 项 | 内容 |
|---|---|
| Input | `z.object({ name: z.string().trim().min(1).max(50), description: z.string().max(1000).optional() })` |
| Output | `Category`（新建行） |
| Errors | `CATEGORY_NAME_EXISTS` |
| 前置顺序 | Zod → name 唯一 → 持久化 |

### 3.4 `categories.update` (mutation)

| 项 | 内容 |
|---|---|
| Input | `z.object({ id, name?, description? })`，name 与 description 约束同 create |
| Output | `Category`（更新后） |
| Errors | `CATEGORY_NOT_FOUND` / `CATEGORY_NAME_EXISTS` |
| 前置顺序 | Zod → 行存在 → 名字未与他行重复 → 更新 |

### 3.5 `categories.delete` (mutation)

| 项 | 内容 |
|---|---|
| Input | `z.object({ id })` |
| Output | `{ ok: true }` |
| Errors | `CATEGORY_NOT_FOUND` / `CATEGORY_IN_USE` |
| 前置顺序 | Zod → 行存在 → `count(products WHERE categoryId=id) === 0` → 删除 |

---

## 4. suppliers 模块

### 4.1 `suppliers.list` (query)

| 项 | 内容 |
|---|---|
| Input | `z.object({ keyword: z.string().optional() })` |
| Output | `Supplier[]`（按 `id` 升序）；keyword 模糊匹配 `name` |
| Errors | — |

### 4.2 `suppliers.byId` (query)

| 项 | 内容 |
|---|---|
| Input | `z.object({ id: z.number().int().positive() })` |
| Output | `Supplier` |
| Errors | `SUPPLIER_NOT_FOUND` |

### 4.3 `suppliers.create` (mutation)

| 项 | 内容 |
|---|---|
| Input | `z.object({ name: z.string().trim().min(1).max(100), contact: z.string().max(50).optional(), address: z.string().max(255).optional() })` |
| Output | `Supplier` |
| Errors | `SUPPLIER_NAME_EXISTS` |
| 前置顺序 | Zod → name 唯一 → 持久化 |

### 4.4 `suppliers.update` (mutation)

| 项 | 内容 |
|---|---|
| Input | `z.object({ id, name?, contact?, address? })` |
| Output | `Supplier` |
| Errors | `SUPPLIER_NOT_FOUND` / `SUPPLIER_NAME_EXISTS` |
| 前置顺序 | Zod → 行存在 → name 未与他行重复 → 更新 |

### 4.5 `suppliers.delete` (mutation)

| 项 | 内容 |
|---|---|
| Input | `z.object({ id })` |
| Output | `{ ok: true }` |
| Errors | `SUPPLIER_NOT_FOUND` / `SUPPLIER_IN_USE` |
| 前置顺序 | Zod → 行存在 → `count(products) === 0 AND count(purchases) === 0` → 删除 |

---

## 5. products 模块

### 5.1 `products.list` (query)

| 项 | 内容 |
|---|---|
| Input | `z.object({ keyword: z.string().optional(), categoryId: z.number().int().positive().optional(), stockStatus: z.enum(['ALL','LOW','OVER','NORMAL']).default('ALL'), page: z.number().int().positive().default(1), pageSize: z.number().int().min(10).max(50).default(20) })` |
| Output | `{ items: Array<Product & { category: { id, name }; supplier: { id, name } }>, total: number, page: number, pageSize: number }` |
| Errors | — |
| 行为 | keyword 同时匹配 `code` 与 `name`（大小写不敏感）；`stockStatus` LOW = `quantity <= minStock`，OVER = `quantity >= maxStock`，NORMAL = 其余；按 `id` 降序 |

### 5.2 `products.byId` (query)

| 项 | 内容 |
|---|---|
| Input | `z.object({ id })` |
| Output | `Product & { category, supplier }` |
| Errors | `PRODUCT_NOT_FOUND` |

### 5.3 `products.byCode` (query)

| 项 | 内容 |
|---|---|
| Input | `z.object({ code: z.string() })` |
| Output | `Product & { category, supplier } \| null` |
| Errors | — |

### 5.4 `products.create` (mutation)

```ts
const productCreateInput = z
  .object({
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
  })
  .refine((d) => d.maxStock > d.minStock, {
    message: 'maxStock must be greater than minStock',
    path: ['maxStock'],
  })
```

| 项 | 内容 |
|---|---|
| Output | `Product` |
| Errors | `CATEGORY_NOT_FOUND` / `SUPPLIER_NOT_FOUND` / `CODE_EXISTS` |
| 前置顺序 | **Zod → 分类存在 → 供应商存在 → 编码唯一 → 持久化** |

### 5.5 `products.update` (mutation)

| 项 | 内容 |
|---|---|
| Input | `productCreateInput.partial().required({ id: true })`（**`code` 不可改**，加 `.omit({ code: true })`）；其它字段同 create |
| Output | `Product` |
| Errors | `PRODUCT_NOT_FOUND` / `CATEGORY_NOT_FOUND` / `SUPPLIER_NOT_FOUND` |
| 前置顺序 | Zod → 行存在 → 若改 categoryId 则 cat 存在 → 若改 supplierId 则 sup 存在 → 持久化 |

> `quantity` 字段允许通过 update 直接改（用于人工校正库存），但**不允许低于 0**（Zod 已挡）。任何由进货/出货引发的变更走 `confirm`，不走 `update`。

### 5.6 `products.delete` (mutation)

| 项 | 内容 |
|---|---|
| Input | `z.object({ id })` |
| Output | `{ ok: true }` |
| Errors | `PRODUCT_NOT_FOUND` / `PRODUCT_HAS_STOCK` |
| 前置顺序 | Zod → 行存在 → `quantity === 0` → 删除 |

### 5.7 `products.batchDelete` (mutation)

| 项 | 内容 |
|---|---|
| Input | `z.object({ ids: z.array(z.number().int().positive()).min(1).max(100) })` |
| Output | `{ deletedIds: number[]; failed: Array<{ id: number; reason: 'PRODUCT_NOT_FOUND' \| 'PRODUCT_HAS_STOCK' }> }` |
| Errors | — |
| 行为 | 不抛 `TRPCError`，逐个尝试，结果分桶。前端按 `failed` 提示。 |

---

## 6. purchaseOrders 模块

### 6.1 `purchaseOrders.list` (query)

| 项 | 内容 |
|---|---|
| Input | `z.object({ orderNo?: string, supplierId?: number.int.positive, dateFrom?: ISO, dateTo?: ISO, status?: 'DRAFT'\|'CONFIRMED', page?: int (default 1), pageSize?: int 10..50 (default 20) })` |
| Output | `{ items: Array<PurchaseOrder & { product, supplier }>, total, page, pageSize }`，按 `purchaseDate` 降序 + `orderNo` 降序 |
| Errors | — |

### 6.2 `purchaseOrders.byId` (query)

| 项 | 内容 |
|---|---|
| Input | `z.object({ id })` |
| Output | `PurchaseOrder & { product, supplier }` |
| Errors | `ORDER_NOT_FOUND` |

### 6.3 `purchaseOrders.create` (mutation)

```ts
const purchaseCreateInput = z.object({
  productId: z.number().int().positive(),
  quantity: z.number().int().positive(),
  costPrice: z.number().finite().positive().max(99999.99)
    .refine((n) => Math.round(n * 100) === n * 100, 'max 2 decimals'),
  supplierId: z.number().int().positive(),
  purchaser: z.string().trim().min(1).max(50),
  remark: z.string().max(1000).optional(),
  purchaseDate: z.string().datetime(),  // ISO
})
```

| 项 | 内容 |
|---|---|
| Output | `PurchaseOrder` |
| Errors | `PRODUCT_NOT_FOUND` / `SUPPLIER_NOT_FOUND` |
| 前置顺序 | Zod → 商品存在 → 供应商存在 → 在事务中：生成单号 → 持久化（status=DRAFT） |
| 单号 | 由 `nextPurchaseOrderNo(db, purchaseDate)` 在事务中生成 |
| `totalAmount` | `quantity × costPrice`，由 router 计算（不信任前端） |

### 6.4 `purchaseOrders.update` (mutation)

| 项 | 内容 |
|---|---|
| Input | `purchaseCreateInput.partial().required({ id: true })` |
| Output | `PurchaseOrder` |
| Errors | `ORDER_NOT_FOUND` / `ORDER_NOT_DRAFT` / `PRODUCT_NOT_FOUND` / `SUPPLIER_NOT_FOUND` |
| 前置顺序 | Zod → 行存在 → `status === 'DRAFT'` → （若改 productId）商品存在 → （若改 supplierId）供应商存在 → 重算 totalAmount → 更新；**不重算 orderNo** |

### 6.5 `purchaseOrders.delete` (mutation)

| 项 | 内容 |
|---|---|
| Input | `z.object({ id })` |
| Output | `{ ok: true }` |
| Errors | `ORDER_NOT_FOUND` / `ORDER_NOT_DRAFT` |
| 前置顺序 | Zod → 行存在 → `status === 'DRAFT'` → 删除 |

### 6.6 `purchaseOrders.confirm` (mutation)

| 项 | 内容 |
|---|---|
| Input | `z.object({ id })` |
| Output | `PurchaseOrder`（confirmed） |
| Errors | `ORDER_NOT_FOUND` / `ORDER_ALREADY_CONFIRMED` / `EXCEEDS_MAX_STOCK` |
| 前置顺序 | Zod → 行存在 → `status === 'DRAFT'`（否则 `ORDER_ALREADY_CONFIRMED`） → `product.quantity + order.quantity ≤ product.maxStock`（否则 `EXCEEDS_MAX_STOCK`）→ 在事务中：`product.quantity += order.quantity`、写 StockLog（`reason="PURCHASE_ORDER:<orderNo>"`、`delta=+quantity`）、`order.status='CONFIRMED'`、`order.confirmedAt=now()` |

---

## 7. salesOrders 模块

### 7.1 `salesOrders.list` (query)

同 `purchaseOrders.list`，过滤字段把 `supplierId` 换成 `customer`（字符串模糊匹配）。

### 7.2 `salesOrders.byId` (query)

同 §6.2，错误为 `ORDER_NOT_FOUND`。

### 7.3 `salesOrders.create` (mutation)

```ts
const salesCreateInput = z.object({
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

| 项 | 内容 |
|---|---|
| Output | `SalesOrder`（status=DRAFT） |
| Errors | `PRODUCT_NOT_FOUND` |
| 前置顺序 | Zod → 商品存在 → 在事务中：生成单号 → 持久化 |
| **注意** | **创建（DRAFT）阶段不校验库存**；库存检查与扣减都在 `confirm`。 |

### 7.4 `salesOrders.update` (mutation)

同 `purchaseOrders.update`，错误集去掉 `SUPPLIER_NOT_FOUND`。

### 7.5 `salesOrders.delete` (mutation)

同 `purchaseOrders.delete`。

### 7.6 `salesOrders.confirm` (mutation)

| 项 | 内容 |
|---|---|
| Input | `z.object({ id })` |
| Output | `SalesOrder`（confirmed） |
| Errors | `ORDER_NOT_FOUND` / `ORDER_ALREADY_CONFIRMED` / `INSUFFICIENT_STOCK` |
| 前置顺序 | Zod → 行存在 → `status === 'DRAFT'` → `product.quantity ≥ order.quantity` → 事务：减库存、写 StockLog（`delta=-quantity`、`reason="SALES_ORDER:<orderNo>"`）、置 status |

---

## 8. stats 模块

### 8.1 `stats.overview` (query)

| 项 | 内容 |
|---|---|
| Input | `z.void()` |
| Output | `{ totalProducts: number; totalQuantity: number; totalValue: number; alertCount: number; periodStats: { todayPurchase: number; todaySales: number; weekPurchase: number; weekSales: number; monthPurchase: number; monthSales: number } }` |
| Errors | — |
| 计算 | `totalValue = Σ(quantity × costPrice)`；`alertCount = count(quantity ≤ minStock OR quantity ≥ maxStock)`；周期为 `confirmedAt` 落入对应区间的 confirmed 单据求 `Σ(quantity)` |

### 8.2 `stats.alerts` (query)

| 项 | 内容 |
|---|---|
| Input | `z.object({ type: z.enum(['ALL','LOW','OVER']).default('ALL') })` |
| Output | `Array<Product & { alertType: 'LOW' \| 'OVER'; category, supplier }>` |
| Errors | — |
| 行为 | LOW = `quantity ≤ minStock`，OVER = `quantity ≥ maxStock`，ALL = 两者并集（同时低库存与超限不会发生，因 G5 已禁） |

### 8.3 `stats.trend` (query)

| 项 | 内容 |
|---|---|
| Input | `z.object({ productId, dateFrom: ISO, dateTo: ISO })` |
| Output | `Array<{ date: 'YYYY-MM-DD'; quantity: number }>`（按 date 升序，每天一行；无变动的日期插值前一日） |
| Errors | `PRODUCT_NOT_FOUND` |
| 计算 | 由 `StockLog` 累加得到每日末库存（基于 `dateFrom` 之前的累计） |

### 8.4 `stats.report` (query)

| 项 | 内容 |
|---|---|
| Input | `z.void()` |
| Output | `Array<{ code, name, categoryName, quantity, costPrice, stockValue, unit, supplierName }>`（按 `id` 升序） |
| Errors | — |
| 用途 | 前端拉到后用 `xlsx` 转 Excel 下载（详见 `04-前端规范.md` §7） |

---

## 9. trpc-contract-agent 骨架模板

骨架例（products 模块 — 不含业务实现）：

```ts
// src/server/routers/products.ts
import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, protectedProcedure } from '../trpc'

export const productCreateInput = z
  .object({
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
  })
  .refine((d) => d.maxStock > d.minStock, {
    message: 'maxStock must be greater than minStock',
    path: ['maxStock'],
  })

export const productsRouter = router({
  list: protectedProcedure
    .input(z.object({
      keyword: z.string().optional(),
      categoryId: z.number().int().positive().optional(),
      stockStatus: z.enum(['ALL','LOW','OVER','NORMAL']).default('ALL'),
      page: z.number().int().positive().default(1),
      pageSize: z.number().int().min(10).max(50).default(20),
    }))
    .query(async () => {
      throw new TRPCError({ code: 'NOT_IMPLEMENTED', message: 'TODO: products.list' })
    }),

  byId: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async () => {
      throw new TRPCError({ code: 'NOT_IMPLEMENTED', message: 'TODO: products.byId' })
    }),

  // ... 其它 procedure 同样占位 ...

  create: protectedProcedure
    .input(productCreateInput)
    .mutation(async () => {
      throw new TRPCError({ code: 'NOT_IMPLEMENTED', message: 'TODO: products.create' })
    }),
})
```

`_app.ts` 骨架：

```ts
// src/server/routers/_app.ts
import { router } from '../trpc'
import { authRouter } from './auth'
import { categoriesRouter } from './categories'
import { suppliersRouter } from './suppliers'
import { productsRouter } from './products'
import { purchaseOrdersRouter } from './purchase-orders'
import { salesOrdersRouter } from './sales-orders'
import { statsRouter } from './stats'

export const appRouter = router({
  auth: authRouter,
  categories: categoriesRouter,
  suppliers: suppliersRouter,
  products: productsRouter,
  purchaseOrders: purchaseOrdersRouter,
  salesOrders: salesOrdersRouter,
  stats: statsRouter,
})

export type AppRouter = typeof appRouter
```

> **注意**：路由名使用 camelCase（`purchaseOrders`、`salesOrders`），路由文件名用 kebab-case（`purchase-orders.ts`、`sales-orders.ts`）。

`/api/trpc/[trpc]/route.ts` 骨架：

```ts
import { fetchRequestHandler } from '@trpc/server/adapters/fetch'
import { appRouter } from '@/server/routers/_app'
import { createContext } from '@/server/context'
import type { NextRequest } from 'next/server'

const handler = (req: NextRequest) =>
  fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: () => createContext(req),
  })

export { handler as GET, handler as POST }
```

---

## 10. 客户端绑定

`src/lib/trpc-client.ts`：

```ts
'use client'
import { createTRPCReact } from '@trpc/react-query'
import { httpBatchLink } from '@trpc/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import type { AppRouter } from '@/server/routers/_app'

export const trpc = createTRPCReact<AppRouter>()

export function TRPCProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient())
  const [client] = useState(() =>
    trpc.createClient({
      links: [httpBatchLink({ url: '/api/trpc' })],
    }),
  )
  return (
    <trpc.Provider client={client} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  )
}
```

> 客户端仅 import `type { AppRouter }`（type-only），不会把后端代码捆进 bundle。

---

## 11. trpc-contract-agent 验收清单

- [ ] `_app.ts` 列出全部 7 个 router
- [ ] 每个 procedure 的 input Zod 与本文 §2..§8 字字一致
- [ ] 每个 procedure 都用 `throw new TRPCError({ code: 'NOT_IMPLEMENTED', message: 'TODO: <name>' })` 占位
- [ ] `tsc --noEmit` 通过
- [ ] 业务实现一行不写（留给 backend-impl-agent）
- [ ] `pnpm test:contract`（一个轻冒烟，验证 input parser 拒绝错误形状）通过
