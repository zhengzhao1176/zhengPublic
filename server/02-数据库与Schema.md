# 02 — 数据库与 Schema

> 唯一负责本文件的实现 agent：`schema-agent`。
> 其他 agent **只读** Prisma 客户端类型，不直接修改 schema.prisma。
>
> 数据库引擎：**SQLite（本地文件）**，开发与测试统一。位置由 `DATABASE_URL` 环境变量提供。

---

## 1. 环境变量

| 变量 | 开发默认 | 测试默认 | 生产默认 |
|---|---|---|---|
| `DATABASE_URL` | `file:./prisma/dev.db` | `file:./prisma/test-<pid>.db`（运行时生成） | `file:./prisma/prod.db` |
| `NODE_ENV` | `development` | `test` | `production` |
| `JWT_SECRET` | `dev-secret-do-not-use-in-prod` | `test-secret` | （由部署方设置） |
| `JWT_EXPIRES_IN` | `7d` | `7d` | `7d` |
| `PORT` | `3000` | `3001` | `3000` |

`.env.example` 必须给出**全部**变量及其开发默认值。

---

## 2. Prisma schema（精确）

写到 `inventory-app/prisma/schema.prisma`：

```prisma
// This file is the only authoritative source of the DB structure.
// Maintained by: schema-agent. Read-only for everyone else.

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

model User {
  id           Int      @id @default(autoincrement())
  username     String   @unique
  passwordHash String
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}

model Category {
  id          Int       @id @default(autoincrement())
  name        String    @unique
  description String?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  products    Product[]
}

model Supplier {
  id        Int             @id @default(autoincrement())
  name      String          @unique
  contact   String?
  address   String?
  createdAt DateTime        @default(now())
  updatedAt DateTime        @updatedAt
  products  Product[]
  purchases PurchaseOrder[]
}

model Product {
  id          Int             @id @default(autoincrement())
  code        String          @unique
  name        String
  categoryId  Int
  category    Category        @relation(fields: [categoryId], references: [id])
  description String?
  costPrice   Float
  sellPrice   Float
  quantity    Int
  unit        String
  supplierId  Int
  supplier    Supplier        @relation(fields: [supplierId], references: [id])
  minStock    Int
  maxStock    Int
  createdAt   DateTime        @default(now())
  updatedAt   DateTime        @updatedAt
  purchases   PurchaseOrder[]
  sales       SalesOrder[]

  @@index([code])
  @@index([categoryId])
  @@index([supplierId])
}

model PurchaseOrder {
  id           Int       @id @default(autoincrement())
  orderNo      String    @unique
  productId    Int
  product      Product   @relation(fields: [productId], references: [id])
  quantity     Int
  costPrice    Float
  totalAmount  Float
  supplierId   Int
  supplier     Supplier  @relation(fields: [supplierId], references: [id])
  purchaser    String
  remark       String?
  status       String    @default("DRAFT")  // DRAFT | CONFIRMED
  purchaseDate DateTime
  confirmedAt  DateTime?
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt

  @@index([orderNo])
  @@index([purchaseDate])
  @@index([status])
}

model SalesOrder {
  id          Int       @id @default(autoincrement())
  orderNo     String    @unique
  productId   Int
  product     Product   @relation(fields: [productId], references: [id])
  quantity    Int
  sellPrice   Float
  totalAmount Float
  customer    String
  shipper     String
  remark      String?
  status      String    @default("DRAFT")  // DRAFT | CONFIRMED
  salesDate   DateTime
  confirmedAt DateTime?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  @@index([orderNo])
  @@index([salesDate])
  @@index([status])
}

model StockLog {
  id        Int      @id @default(autoincrement())
  productId Int
  delta     Int      // 正数=进货，负数=出货
  reason    String   // PURCHASE_ORDER:<orderNo> 或 SALES_ORDER:<orderNo>
  createdAt DateTime @default(now())

  @@index([productId])
  @@index([createdAt])
}
```

---

## 3. schema 字段语义对照（与 BRD §3）

| BRD 字段 | Prisma 字段 | 类型映射 | 备注 |
|---|---|---|---|
| `code` | `code` | String unique | 商品编码，3-20 |
| `category_id` | `categoryId` | Int | 外键 |
| `cost_price` | `costPrice` | Float | 进价，> 0 |
| `sell_price` | `sellPrice` | Float | 售价，> 0 |
| `quantity` | `quantity` | Int | ≥ 0 |
| `min_stock` | `minStock` | Int | > 0 |
| `max_stock` | `maxStock` | Int | > minStock |
| `order_no` | `orderNo` | String unique | 单号 |
| `purchase_date` / `sales_date` | `purchaseDate` / `salesDate` | DateTime | 业务日期，参与单号生成 |
| `status` | `status` | String | DRAFT / CONFIRMED |
| `created_at` / `updated_at` | `createdAt` / `updatedAt` | DateTime | Prisma 自动填 |

> 字段命名采用 camelCase；BRD 中 snake_case 仅作业务层语义参考。

---

## 4. seed 脚本（开发与测试都用）

写到 `inventory-app/prisma/seed.ts`：

```ts
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const db = new PrismaClient()

async function main() {
  // 1. admin
  const passwordHash = await bcrypt.hash('admin123', 10)
  await db.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: { username: 'admin', passwordHash },
  })

  // 2. 演示分类（仅 dev seed；test 不调用 main，由 /api/test/seed 控制）
  if (process.env.NODE_ENV !== 'test') {
    const cat = await db.category.upsert({
      where: { name: '电子产品' },
      update: {},
      create: { name: '电子产品', description: '默认演示分类' },
    })
    const sup = await db.supplier.upsert({
      where: { name: '默认供应商' },
      update: {},
      create: { name: '默认供应商' },
    })
    await db.product.upsert({
      where: { code: 'DEMO001' },
      update: {},
      create: {
        code: 'DEMO001',
        name: '示例商品',
        categoryId: cat.id,
        costPrice: 10,
        sellPrice: 20,
        quantity: 100,
        unit: '件',
        supplierId: sup.id,
        minStock: 10,
        maxStock: 1000,
      },
    })
  }
}

main().finally(() => db.$disconnect())
```

`package.json` 中：

```json
{
  "scripts": {
    "db:push": "prisma db push --skip-generate",
    "db:seed": "tsx prisma/seed.ts",
    "db:reset": "prisma migrate reset --force --skip-seed && pnpm db:seed"
  },
  "prisma": {
    "seed": "tsx prisma/seed.ts"
  }
}
```

---

## 5. 测试用 reset / seed API（仅 NODE_ENV=test 暴露）

`src/app/api/test/reset/route.ts`：

```ts
import { NextResponse } from 'next/server'
import { db } from '@/server/db'

export async function POST() {
  if (process.env.NODE_ENV !== 'test') {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })
  }
  // 顺序：从被引用的最末端开始
  await db.stockLog.deleteMany()
  await db.purchaseOrder.deleteMany()
  await db.salesOrder.deleteMany()
  await db.product.deleteMany()
  await db.supplier.deleteMany()
  await db.category.deleteMany()
  await db.user.deleteMany()
  // 重新写入 admin
  const bcrypt = await import('bcryptjs')
  const passwordHash = await bcrypt.hash('admin123', 10)
  await db.user.create({ data: { username: 'admin', passwordHash } })
  return NextResponse.json({ ok: true })
}
```

`src/app/api/test/seed/route.ts`：

```ts
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/server/db'

const schema = z.object({
  categories: z.array(z.object({
    name: z.string(),
    description: z.string().optional(),
  })).optional(),
  suppliers: z.array(z.object({
    name: z.string(),
    contact: z.string().optional(),
    address: z.string().optional(),
  })).optional(),
  products: z.array(z.object({
    code: z.string(),
    name: z.string(),
    categoryName: z.string(),
    costPrice: z.number(),
    sellPrice: z.number(),
    quantity: z.number().int(),
    unit: z.string(),
    supplierName: z.string(),
    minStock: z.number().int(),
    maxStock: z.number().int(),
    description: z.string().optional(),
  })).optional(),
})

export async function POST(req: Request) {
  if (process.env.NODE_ENV !== 'test') {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })
  }
  const body = schema.parse(await req.json())
  const cats = await Promise.all(
    (body.categories ?? []).map((c) =>
      db.category.create({ data: c }),
    ),
  )
  const sups = await Promise.all(
    (body.suppliers ?? []).map((s) => db.supplier.create({ data: s })),
  )
  const prods = await Promise.all(
    (body.products ?? []).map(async (p) => {
      const cat = cats.find((c) => c.name === p.categoryName)
      const sup = sups.find((s) => s.name === p.supplierName)
      if (!cat || !sup) throw new Error('seed reference missing')
      return db.product.create({
        data: {
          code: p.code,
          name: p.name,
          categoryId: cat.id,
          costPrice: p.costPrice,
          sellPrice: p.sellPrice,
          quantity: p.quantity,
          unit: p.unit,
          supplierId: sup.id,
          minStock: p.minStock,
          maxStock: p.maxStock,
          description: p.description,
        },
      })
    }),
  )
  return NextResponse.json({
    categories: cats.map((c) => ({ id: c.id, name: c.name })),
    suppliers: sups.map((s) => ({ id: s.id, name: s.name })),
    products: prods.map((p) => ({ id: p.id, code: p.code })),
  })
}
```

> **G11 守护**：两条 route 第一行均判断 `NODE_ENV !== 'test'` ⇒ 返回 404。**严禁**用 `if (NODE_ENV === 'production') return 404` 反向写法（开发态会暴露）。

---

## 6. tRPC base & context

`src/server/db.ts`：

```ts
import { PrismaClient } from '@prisma/client'
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }
export const db =
  globalForPrisma.prisma ??
  new PrismaClient({ log: ['error'] })
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
```

`src/server/context.ts`：

```ts
import type { NextRequest } from 'next/server'
import { db } from './db'
import { verifyToken } from '@/lib/auth'

export type Context = {
  db: typeof db
  user: { id: number; username: string } | null
}

export async function createContext(req: NextRequest): Promise<Context> {
  const token = req.cookies.get('inv_token')?.value
  let user: Context['user'] = null
  if (token) {
    try {
      const payload = verifyToken(token)
      user = { id: payload.id, username: payload.username }
    } catch {
      user = null
    }
  }
  return { db, user }
}
```

`src/server/trpc.ts`：

```ts
import { initTRPC, TRPCError } from '@trpc/server'
import type { Context } from './context'

const t = initTRPC.context<Context>().create()

export const router = t.router
export const publicProcedure = t.procedure
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'UNAUTHORIZED' })
  return next({ ctx })
})
export const createCallerFactory = t.createCallerFactory
```

---

## 7. 测试 DB 工厂（`tests/helpers/db.ts`）

```ts
import { PrismaClient } from '@prisma/client'
import { execSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export function makeTestDb(): PrismaClient {
  const dir = mkdtempSync(join(tmpdir(), 'inv-test-'))
  const url = `file:${dir}/test.db`
  process.env.DATABASE_URL = url
  execSync('pnpm prisma db push --skip-generate --force-reset', {
    env: process.env,
    stdio: 'pipe',
  })
  return new PrismaClient({ datasources: { db: { url } } })
}

export async function resetAll(db: PrismaClient) {
  await db.stockLog.deleteMany()
  await db.purchaseOrder.deleteMany()
  await db.salesOrder.deleteMany()
  await db.product.deleteMany()
  await db.supplier.deleteMany()
  await db.category.deleteMany()
  await db.user.deleteMany()
}

export async function seedAdmin(db: PrismaClient) {
  const bcrypt = await import('bcryptjs')
  const passwordHash = await bcrypt.hash('admin123', 10)
  return db.user.create({ data: { username: 'admin', passwordHash } })
}

export async function seedCategory(
  db: PrismaClient,
  name = `Cat-${Date.now()}-${Math.random()}`,
) {
  return db.category.create({ data: { name } })
}

export async function seedSupplier(
  db: PrismaClient,
  name = `Sup-${Date.now()}-${Math.random()}`,
) {
  return db.supplier.create({ data: { name } })
}

export async function seedProduct(
  db: PrismaClient,
  overrides: Partial<Parameters<PrismaClient['product']['create']>[0]['data']> = {},
) {
  const cat = await seedCategory(db)
  const sup = await seedSupplier(db)
  return db.product.create({
    data: {
      code: `P-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
      name: 'Widget',
      categoryId: cat.id,
      costPrice: 10,
      sellPrice: 20,
      quantity: 100,
      unit: '件',
      supplierId: sup.id,
      minStock: 10,
      maxStock: 1000,
      ...overrides,
    } as never,
  })
}
```

---

## 8. 单号生成（`src/lib/order-no.ts`）

```ts
import dayjs from 'dayjs'
import type { PrismaClient } from '@prisma/client'

export async function nextPurchaseOrderNo(
  db: PrismaClient,
  date: Date,
): Promise<string> {
  return generate(db, 'RH', date, 'purchaseOrder', 'purchaseDate')
}

export async function nextSalesOrderNo(
  db: PrismaClient,
  date: Date,
): Promise<string> {
  return generate(db, 'CH', date, 'salesOrder', 'salesDate')
}

async function generate(
  db: PrismaClient,
  prefix: 'RH' | 'CH',
  date: Date,
  table: 'purchaseOrder' | 'salesOrder',
  dateField: 'purchaseDate' | 'salesDate',
): Promise<string> {
  const dayStr = dayjs(date).format('YYYYMMDD')
  const start = dayjs(date).startOf('day').toDate()
  const end = dayjs(date).endOf('day').toDate()
  // @ts-expect-error: 动态访问 prisma 模型
  const count: number = await db[table].count({
    where: { [dateField]: { gte: start, lte: end } },
  })
  const seq = String(count + 1).padStart(4, '0')
  return `${prefix}${dayStr}${seq}`
}
```

> **不变量**：单号在同一日 prefix 下严格 +1。事务由调用方负责（`createPurchaseOrder` 必须把 `nextPurchaseOrderNo` 与 insert 包裹在同一个 `db.$transaction`）。

---

## 9. 迁移与初始化

| 操作 | 命令 |
|---|---|
| 首次创建 DB（dev） | `pnpm prisma db push --skip-generate && pnpm db:seed` |
| 重置 DB（dev） | `pnpm db:reset` |
| 升级 schema（dev） | 改 `schema.prisma` 后 `pnpm prisma db push --skip-generate` |
| 生成 client | 自动随 install 触发；手动：`pnpm prisma generate` |

> 本项目**不使用** Prisma Migrations 的版本化迁移文件（`prisma/migrations/`），统一用 `db push`。理由：SQLite 单库 + 无生产并发演进诉求，避免迁移目录污染。

---

## 10. schema-agent 验收清单

- [ ] `inventory-app/` 目录创建，根级配置文件齐全（package.json / tsconfig.json / next.config.ts / vitest.config.ts / stryker.conf.json / .nvmrc / .gitignore）
- [ ] `prisma/schema.prisma` 与本文 §2 字字一致
- [ ] `pnpm install && pnpm prisma db push && pnpm db:seed` 一次性成功
- [ ] `pnpm dev` 在 :3000 启动，访问 `/login` 可见登录页骨架（即便实现未完成）
- [ ] `NODE_ENV=test pnpm dev` 在 :3001 启动，POST `/api/test/reset` 与 `/api/test/seed` 返回 ok
- [ ] `tests/helpers/db.ts` 写入并能通过基础冒烟（用 vitest 跑一条 `expect(makeTestDb()).toBeDefined()`）
- [ ] 不写任何 router 业务逻辑（仅留给 trpc-contract-agent 与 backend-impl-agent）
