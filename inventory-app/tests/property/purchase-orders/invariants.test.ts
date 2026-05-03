import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fc from 'fast-check'
import type { PrismaClient } from '@prisma/client'
import { makeTestDb, resetAll, seedAdmin, seedCategory, seedSupplier, seedProduct } from '@tests/helpers/db'
import { makeAuthedCaller, type AnyCaller } from '@tests/helpers/caller'

let db: PrismaClient
let caller: AnyCaller

beforeAll(() => {
  db = makeTestDb()
  caller = makeAuthedCaller(db as unknown as PrismaClient)
})

afterAll(async () => {
  await db.$disconnect()
})

// ---- Arbitraries ----

// 用整数分（cent）派生 → 严格满足 ≤ 2 位小数；避开 IEEE-754 精度
const moneyArb = fc
  .integer({ min: 1, max: 9_999_999 })
  .map((cents) => cents / 100)
  .filter((n) => Math.round(n * 100) === n * 100 && n > 0 && n <= 99999.99)

const qtyArb = fc.integer({ min: 1, max: 1000 })

// 进货员 trim().min(1).max(50)：用非空 ASCII string，避免 trim 后为空
const purchaserArb = fc
  .string({ minLength: 1, maxLength: 50 })
  .map((s) => s.replace(/[^\x21-\x7e]/g, 'a'))
  .filter((s) => s.trim().length >= 1 && s.trim().length <= 50)

async function seedFreshFixture(opts: {
  productQuantity: number
  productMaxStock: number
}) {
  await resetAll(db)
  await seedAdmin(db)
  const cat = await seedCategory(db, `C-${Date.now()}-${Math.random()}`)
  const sup = await seedSupplier(db, `S-${Date.now()}-${Math.random()}`)
  const product = await seedProduct(db, {
    categoryId: cat.id,
    supplierId: sup.id,
    quantity: opts.productQuantity,
    minStock: 1,
    maxStock: opts.productMaxStock,
  })
  return { cat, sup, product }
}

describe('purchase-orders invariants', () => {
  it('I1 OrderNo monotone — 同日 3 张 DRAFT 单序列号严格 +1', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          // 用 ms 偏移避免日期边界
          dayMs: fc.integer({ min: 0, max: 80_000_000 }),
          q1: qtyArb,
          q2: qtyArb,
          q3: qtyArb,
          c1: moneyArb,
          c2: moneyArb,
          c3: moneyArb,
        }),
        async (raw) => {
          const { sup, product } = await seedFreshFixture({
            productQuantity: 0,
            productMaxStock: 1_000_000,
          })
          // 在同一天的不同时刻
          const base = new Date('2026-05-02T00:00:00.000Z').getTime()
          const purchaseDate = new Date(base + raw.dayMs).toISOString()

          const a = await caller.purchaseOrders.create({
            productId: product.id,
            quantity: raw.q1,
            costPrice: raw.c1,
            supplierId: sup.id,
            purchaser: 'X',
            purchaseDate,
          })
          const b = await caller.purchaseOrders.create({
            productId: product.id,
            quantity: raw.q2,
            costPrice: raw.c2,
            supplierId: sup.id,
            purchaser: 'X',
            purchaseDate,
          })
          const c = await caller.purchaseOrders.create({
            productId: product.id,
            quantity: raw.q3,
            costPrice: raw.c3,
            supplierId: sup.id,
            purchaser: 'X',
            purchaseDate,
          })

          // 末 4 位为 0001/0002/0003 严格 +1
          const last4 = (s: string) => Number(s.slice(-4))
          expect(last4(a.orderNo)).toBe(1)
          expect(last4(b.orderNo)).toBe(2)
          expect(last4(c.orderNo)).toBe(3)
          // 且 8 位日期段一致
          const dateSeg = (s: string) => s.slice(2, 10)
          expect(dateSeg(a.orderNo)).toBe(dateSeg(b.orderNo))
          expect(dateSeg(b.orderNo)).toBe(dateSeg(c.orderNo))
        },
      ),
      { numRuns: 30 },
    )
  })

  it('I3 Status finality — confirm 后 update / delete 抛 ORDER_NOT_DRAFT', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          quantity: qtyArb,
          costPrice: moneyArb,
          purchaser: purchaserArb,
        }),
        async (raw) => {
          const { sup, product } = await seedFreshFixture({
            productQuantity: 0,
            productMaxStock: 1_000_000,
          })
          const order = await caller.purchaseOrders.create({
            productId: product.id,
            quantity: raw.quantity,
            costPrice: raw.costPrice,
            supplierId: sup.id,
            purchaser: raw.purchaser,
            purchaseDate: new Date().toISOString(),
          })
          await caller.purchaseOrders.confirm({ id: order.id })

          await expect(
            caller.purchaseOrders.update({ id: order.id, quantity: 7 }),
          ).rejects.toThrow(/ORDER_NOT_DRAFT/)
          await expect(
            caller.purchaseOrders.delete({ id: order.id }),
          ).rejects.toThrow(/ORDER_NOT_DRAFT/)
        },
      ),
      { numRuns: 30 },
    )
  })

  it('I4 Confirm side-effect — product.quantity += order.quantity 且 stockLog +1 条 delta=+order.quantity', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          quantity: qtyArb,
          costPrice: moneyArb,
          startQty: fc.integer({ min: 0, max: 100_000 }),
        }),
        async (raw) => {
          const { sup, product } = await seedFreshFixture({
            productQuantity: raw.startQty,
            productMaxStock: raw.startQty + raw.quantity + 1, // 留余量
          })
          const beforeLogCount = await db.stockLog.count()

          const order = await caller.purchaseOrders.create({
            productId: product.id,
            quantity: raw.quantity,
            costPrice: raw.costPrice,
            supplierId: sup.id,
            purchaser: 'X',
            purchaseDate: new Date().toISOString(),
          })
          await caller.purchaseOrders.confirm({ id: order.id })

          const updated = await db.product.findUniqueOrThrow({ where: { id: product.id } })
          expect(updated.quantity).toBe(raw.startQty + raw.quantity)

          const afterLogCount = await db.stockLog.count()
          expect(afterLogCount).toBe(beforeLogCount + 1)

          const log = await db.stockLog.findFirst({
            where: { productId: product.id },
            orderBy: { id: 'desc' },
          })
          expect(log).not.toBeNull()
          expect(log?.delta).toBe(raw.quantity)
        },
      ),
      { numRuns: 30 },
    )
  })

  it('I5 Confirm idempotency-block — 第 2 次 confirm 抛 ORDER_ALREADY_CONFIRMED 且 product.quantity 不变', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          quantity: qtyArb,
          costPrice: moneyArb,
        }),
        async (raw) => {
          const { sup, product } = await seedFreshFixture({
            productQuantity: 0,
            productMaxStock: 1_000_000,
          })
          const order = await caller.purchaseOrders.create({
            productId: product.id,
            quantity: raw.quantity,
            costPrice: raw.costPrice,
            supplierId: sup.id,
            purchaser: 'X',
            purchaseDate: new Date().toISOString(),
          })
          await caller.purchaseOrders.confirm({ id: order.id })
          const afterFirst = await db.product.findUniqueOrThrow({ where: { id: product.id } })

          await expect(
            caller.purchaseOrders.confirm({ id: order.id }),
          ).rejects.toThrow(/ORDER_ALREADY_CONFIRMED/)

          const afterSecond = await db.product.findUniqueOrThrow({ where: { id: product.id } })
          expect(afterSecond.quantity).toBe(afterFirst.quantity)
        },
      ),
      { numRuns: 30 },
    )
  })

  it('I7 TotalAmount equality — persisted.totalAmount === Math.round(quantity * costPrice * 100) / 100', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          quantity: qtyArb,
          costPrice: moneyArb,
        }),
        async (raw) => {
          const { sup, product } = await seedFreshFixture({
            productQuantity: 0,
            productMaxStock: 1_000_000,
          })
          const order = await caller.purchaseOrders.create({
            productId: product.id,
            quantity: raw.quantity,
            costPrice: raw.costPrice,
            supplierId: sup.id,
            purchaser: 'X',
            purchaseDate: new Date().toISOString(),
          })
          const expected = Math.round(raw.quantity * raw.costPrice * 100) / 100
          expect(order.totalAmount).toBe(expected)

          const fetched = await caller.purchaseOrders.byId({ id: order.id })
          expect(fetched.totalAmount).toBe(expected)
        },
      ),
      { numRuns: 30 },
    )
  })

  it('I9 Max-stock guard (anti-property) — quantity+order.quantity > maxStock 必抛 EXCEEDS_MAX_STOCK 且不变更', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          startQty: fc.integer({ min: 1, max: 10_000 }),
          orderQty: qtyArb,
          costPrice: moneyArb,
        }),
        async (raw) => {
          // 故意把 maxStock 设 < startQty + orderQty
          const maxStock = raw.startQty + Math.max(0, raw.orderQty - 1)
          // 保证 maxStock > minStock（minStock=1）且 maxStock >= startQty
          // 也保证 startQty + orderQty > maxStock
          if (maxStock < 2) return // 跳过不合法的 fixture
          const { sup, product } = await seedFreshFixture({
            productQuantity: raw.startQty,
            productMaxStock: maxStock,
          })
          const order = await caller.purchaseOrders.create({
            productId: product.id,
            quantity: raw.orderQty,
            costPrice: raw.costPrice,
            supplierId: sup.id,
            purchaser: 'X',
            purchaseDate: new Date().toISOString(),
          })
          await expect(
            caller.purchaseOrders.confirm({ id: order.id }),
          ).rejects.toThrow(/EXCEEDS_MAX_STOCK/)
          const after = await db.product.findUniqueOrThrow({ where: { id: product.id } })
          expect(after.quantity).toBe(raw.startQty)
        },
      ),
      { numRuns: 30 },
    )
  })
})
