import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fc from 'fast-check'
import type { PrismaClient } from '@prisma/client'
import {
  makeTestDb,
  resetAll,
  seedAdmin,
  seedCategory,
  seedSupplier,
  seedProduct,
} from '@tests/helpers/db'
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

// 整数分（cent）派生 → 严格满足 ≤ 2 位小数；规避 IEEE-754 float 精度问题
const moneyArb = fc
  .integer({ min: 1, max: 9_999_999 })
  .map((cents) => cents / 100)
  .filter((n) => Math.round(n * 100) === n * 100 && n > 0 && n <= 99999.99)

const positiveIntArb = fc.integer({ min: 1, max: 1_000 })
const customerArb = fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0)
const shipperArb = fc.string({ minLength: 1, maxLength: 30 }).filter((s) => s.trim().length > 0)

const round2 = (n: number) => Math.round(n * 100) / 100

async function setupBaseline(stock = 10_000) {
  await resetAll(db)
  await seedAdmin(db)
  const cat = await seedCategory(db, 'C1')
  const sup = await seedSupplier(db, 'S1')
  const product = await seedProduct(db, {
    code: `P-${Date.now()}-${Math.floor(Math.random() * 100_000)}`,
    name: 'X',
    categoryId: cat.id,
    supplierId: sup.id,
    quantity: stock,
    sellPrice: 20,
    costPrice: 10,
    minStock: 1,
    maxStock: 1_000_000,
  })
  return { cat, sup, product }
}

describe('sales-orders invariants', () => {
  it('I1 OrderNo monotone — same-day 3 creates → tail 4 digits +1', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          customer: customerArb,
          shipper: shipperArb,
          // 用一个合法 ISO datetime 串
          isoDay: fc
            .integer({ min: 0, max: 364 })
            .map((d) => {
              const base = new Date('2026-01-01T00:00:00.000Z')
              base.setUTCDate(base.getUTCDate() + d)
              return base.toISOString()
            }),
        }),
        async ({ customer, shipper, isoDay }) => {
          const { product } = await setupBaseline()
          const a = await caller.salesOrders.create({
            productId: product.id,
            quantity: 1,
            sellPrice: 1,
            customer,
            shipper,
            salesDate: isoDay,
          })
          const b = await caller.salesOrders.create({
            productId: product.id,
            quantity: 1,
            sellPrice: 1,
            customer,
            shipper,
            salesDate: isoDay,
          })
          const c = await caller.salesOrders.create({
            productId: product.id,
            quantity: 1,
            sellPrice: 1,
            customer,
            shipper,
            salesDate: isoDay,
          })
          const tailA = Number(a.orderNo.slice(-4))
          const tailB = Number(b.orderNo.slice(-4))
          const tailC = Number(c.orderNo.slice(-4))
          expect(tailB).toBe(tailA + 1)
          expect(tailC).toBe(tailB + 1)
        },
      ),
      { numRuns: 30 },
    )
  })

  it('I2 OrderNo format — `^CH\\d{8}\\d{4}$` and date prefix matches salesDate (UTC)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          year: fc.integer({ min: 2020, max: 2099 }),
          month: fc.integer({ min: 1, max: 12 }),
          day: fc.integer({ min: 1, max: 28 }),
        }),
        async ({ year, month, day }) => {
          const { product } = await setupBaseline()
          const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T10:00:00.000Z`
          const o = await caller.salesOrders.create({
            productId: product.id,
            quantity: 1,
            sellPrice: 1,
            customer: '客户A',
            shipper: '出货员A',
            salesDate: dateStr,
          })
          expect(/^CH\d{8}\d{4}$/.test(o.orderNo)).toBe(true)
          // 日期段（中间 8 位）应与 salesDate 的 UTC YYYYMMDD 一致
          const expected = `${year}${String(month).padStart(2, '0')}${String(day).padStart(2, '0')}`
          expect(o.orderNo.slice(2, 10)).toBe(expected)
        },
      ),
      { numRuns: 30 },
    )
  })

  it('I3 Status finality — confirm 后 update / delete 抛 ORDER_NOT_DRAFT', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          quantity: fc.integer({ min: 1, max: 50 }),
          sellPrice: moneyArb,
        }),
        async ({ quantity, sellPrice }) => {
          const { product } = await setupBaseline(1_000)
          const o = await caller.salesOrders.create({
            productId: product.id,
            quantity,
            sellPrice,
            customer: '王五',
            shipper: '李四',
            salesDate: new Date().toISOString(),
          })
          await caller.salesOrders.confirm({ id: o.id })
          await expect(
            caller.salesOrders.update({ id: o.id, quantity: 1 }),
          ).rejects.toThrow(/ORDER_NOT_DRAFT/)
          await expect(
            caller.salesOrders.delete({ id: o.id }),
          ).rejects.toThrow(/ORDER_NOT_DRAFT/)
        },
      ),
      { numRuns: 30 },
    )
  })

  it('I4 Confirm side-effect — product.quantity 减少 order.quantity，stockLog 多 1 条 delta=-quantity', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          stock: fc.integer({ min: 100, max: 10_000 }),
          quantity: fc.integer({ min: 1, max: 50 }),
        }),
        async ({ stock, quantity }) => {
          const { product } = await setupBaseline(stock)
          const stockLogsBefore = await db.stockLog.count({ where: { productId: product.id } })
          const o = await caller.salesOrders.create({
            productId: product.id,
            quantity,
            sellPrice: 20,
            customer: '王五',
            shipper: '李四',
            salesDate: new Date().toISOString(),
          })
          await caller.salesOrders.confirm({ id: o.id })
          const refreshed = await caller.products.byId({ id: product.id })
          expect(refreshed.quantity).toBe(stock - quantity)

          const stockLogsAfter = await db.stockLog.findMany({ where: { productId: product.id } })
          expect(stockLogsAfter.length).toBe(stockLogsBefore + 1)
          // 最近一条 log 的 delta 应等于 -quantity
          const latest = stockLogsAfter[stockLogsAfter.length - 1]!
          expect(latest.delta).toBe(-quantity)
        },
      ),
      { numRuns: 30 },
    )
  })

  it('I5 Confirm idempotency-block — 重复 confirm 抛 ORDER_ALREADY_CONFIRMED，库存不再变', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          stock: fc.integer({ min: 50, max: 500 }),
          quantity: fc.integer({ min: 1, max: 30 }),
        }),
        async ({ stock, quantity }) => {
          const { product } = await setupBaseline(stock)
          const o = await caller.salesOrders.create({
            productId: product.id,
            quantity,
            sellPrice: 1,
            customer: 'X',
            shipper: 'Y',
            salesDate: new Date().toISOString(),
          })
          await caller.salesOrders.confirm({ id: o.id })
          const after1 = await caller.products.byId({ id: product.id })
          expect(after1.quantity).toBe(stock - quantity)
          await expect(
            caller.salesOrders.confirm({ id: o.id }),
          ).rejects.toThrow(/ORDER_ALREADY_CONFIRMED/)
          const after2 = await caller.products.byId({ id: product.id })
          expect(after2.quantity).toBe(stock - quantity)
        },
      ),
      { numRuns: 30 },
    )
  })

  it('I7 Stock non-negativity — confirm 后 quantity ≥ 0 (anti-property: quantity > stock 必抛 INSUFFICIENT_STOCK)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          stock: fc.integer({ min: 1, max: 100 }),
          // delta：order.quantity = stock + delta（delta ≥ 1 → over-stock）
          over: fc.integer({ min: 1, max: 100 }),
        }),
        async ({ stock, over }) => {
          const { product } = await setupBaseline(stock)
          const orderQty = stock + over
          const o = await caller.salesOrders.create({
            productId: product.id,
            quantity: orderQty,
            sellPrice: 1,
            customer: 'X',
            shipper: 'Y',
            salesDate: new Date().toISOString(),
          })
          await expect(
            caller.salesOrders.confirm({ id: o.id }),
          ).rejects.toThrow(/INSUFFICIENT_STOCK/)
          const p = await caller.products.byId({ id: product.id })
          expect(p.quantity).toBe(stock)
          expect(p.quantity).toBeGreaterThanOrEqual(0)
        },
      ),
      { numRuns: 30 },
    )
  })

  it('I8 TotalAmount equality — totalAmount === round2(quantity * sellPrice)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          quantity: positiveIntArb,
          sellPrice: moneyArb,
        }),
        async ({ quantity, sellPrice }) => {
          const { product } = await setupBaseline()
          const o = await caller.salesOrders.create({
            productId: product.id,
            quantity,
            sellPrice,
            customer: '王五',
            shipper: '李四',
            salesDate: new Date().toISOString(),
          })
          expect(o.totalAmount).toBe(round2(quantity * sellPrice))
        },
      ),
      { numRuns: 30 },
    )
  })

  it('I9 DRAFT 阶段不锁库存 — 2 张 quantity = 全部库存 DRAFT 单不抛错；首张 confirm 成功，第二张 confirm 抛 INSUFFICIENT_STOCK', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          stock: fc.integer({ min: 1, max: 50 }),
        }),
        async ({ stock }) => {
          const { product } = await setupBaseline(stock)
          // DRAFT 阶段不锁库存：连续创建 2 张 quantity 都 = 全部库存
          const a = await caller.salesOrders.create({
            productId: product.id,
            quantity: stock,
            sellPrice: 1,
            customer: 'X',
            shipper: 'Y',
            salesDate: new Date().toISOString(),
          })
          const b = await caller.salesOrders.create({
            productId: product.id,
            quantity: stock,
            sellPrice: 1,
            customer: 'X',
            shipper: 'Y',
            salesDate: new Date().toISOString(),
          })
          // 都成功创建（DRAFT），无错
          expect(a.status).toBe('DRAFT')
          expect(b.status).toBe('DRAFT')
          // confirm 第 1 张成功
          await caller.salesOrders.confirm({ id: a.id })
          const after1 = await caller.products.byId({ id: product.id })
          expect(after1.quantity).toBe(0)
          // confirm 第 2 张抛 INSUFFICIENT_STOCK
          await expect(
            caller.salesOrders.confirm({ id: b.id }),
          ).rejects.toThrow(/INSUFFICIENT_STOCK/)
          const after2 = await caller.products.byId({ id: product.id })
          expect(after2.quantity).toBe(0)
        },
      ),
      { numRuns: 10 },
    )
  })
})
