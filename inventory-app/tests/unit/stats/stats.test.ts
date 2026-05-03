import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
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

beforeEach(async () => {
  await resetAll(db)
  await seedAdmin(db)
})

afterAll(async () => {
  await db.$disconnect()
})

describe('stats.overview', () => {
  it('returns all zeros when no products exist', async () => {
    const r = await caller.stats.overview()
    expect(r.totalProducts).toBe(0)
    expect(r.totalQuantity).toBe(0)
    expect(r.totalValue).toBe(0)
    expect(r.alertCount).toBe(0)
    expect(r.periodStats).toBeTruthy()
    expect(r.periodStats.todayPurchase).toBe(0)
    expect(r.periodStats.todaySales).toBe(0)
    expect(r.periodStats.weekPurchase).toBe(0)
    expect(r.periodStats.weekSales).toBe(0)
    expect(r.periodStats.monthPurchase).toBe(0)
    expect(r.periodStats.monthSales).toBe(0)
  })

  it('aggregates totals across multiple products and counts low-stock alert', async () => {
    const cat = await seedCategory(db, 'C-overview')
    const sup = await seedSupplier(db, 'S-overview')
    // P1 normal: qty=100, cost=10
    await seedProduct(db, {
      code: 'OV-P1',
      name: 'P1',
      categoryId: cat.id,
      supplierId: sup.id,
      quantity: 100,
      costPrice: 10,
      minStock: 10,
      maxStock: 1000,
    })
    // P2 low-stock: qty=5, cost=2, minStock=10 → quantity ≤ minStock
    await seedProduct(db, {
      code: 'OV-P2',
      name: 'P2',
      categoryId: cat.id,
      supplierId: sup.id,
      quantity: 5,
      costPrice: 2,
      minStock: 10,
      maxStock: 1000,
    })
    // P3 normal: qty=50, cost=1
    await seedProduct(db, {
      code: 'OV-P3',
      name: 'P3',
      categoryId: cat.id,
      supplierId: sup.id,
      quantity: 50,
      costPrice: 1,
      minStock: 10,
      maxStock: 1000,
    })

    const r = await caller.stats.overview()
    expect(r.totalProducts).toBe(3)
    expect(r.totalQuantity).toBe(155) // 100 + 5 + 50
    expect(r.totalValue).toBe(1060) // 100*10 + 5*2 + 50*1 = 1000 + 10 + 50
    expect(r.alertCount).toBe(1) // only P2 (low stock)
  })
})

describe('stats.alerts', () => {
  async function seedTwoAlertCases() {
    const cat = await seedCategory(db, 'C-alerts')
    const sup = await seedSupplier(db, 'S-alerts')
    // low: qty=5 ≤ minStock=10
    const low = await seedProduct(db, {
      code: 'AL-LOW',
      name: 'Low One',
      categoryId: cat.id,
      supplierId: sup.id,
      quantity: 5,
      minStock: 10,
      maxStock: 1000,
    })
    // normal: qty=50, between minStock/maxStock
    const normal = await seedProduct(db, {
      code: 'AL-NRM',
      name: 'Normal One',
      categoryId: cat.id,
      supplierId: sup.id,
      quantity: 50,
      minStock: 10,
      maxStock: 1000,
    })
    return { cat, sup, low, normal }
  }

  it('LOW filter only returns low-stock products', async () => {
    const { low } = await seedTwoAlertCases()
    const r = await caller.stats.alerts({ type: 'LOW' })
    expect(r).toHaveLength(1)
    expect(r[0]!.id).toBe(low.id)
    expect(r[0]!.alertType).toBe('LOW')
  })

  it('OVER filter only returns over-capacity products (qty >= maxStock)', async () => {
    const cat = await seedCategory(db, 'C-over')
    const sup = await seedSupplier(db, 'S-over')
    const over = await seedProduct(db, {
      code: 'AL-OVR',
      name: 'Over One',
      categoryId: cat.id,
      supplierId: sup.id,
      quantity: 100,
      minStock: 1,
      maxStock: 100, // qty == maxStock → over
    })
    // a normal one
    await seedProduct(db, {
      code: 'AL-NR2',
      name: 'Normal Two',
      categoryId: cat.id,
      supplierId: sup.id,
      quantity: 50,
      minStock: 1,
      maxStock: 100,
    })

    const r = await caller.stats.alerts({ type: 'OVER' })
    expect(r).toHaveLength(1)
    expect(r[0]!.id).toBe(over.id)
    expect(r[0]!.alertType).toBe('OVER')
  })

  it('ALL filter returns LOW ∪ OVER (no duplicates), sorted by id ascending', async () => {
    const cat = await seedCategory(db, 'C-all')
    const sup = await seedSupplier(db, 'S-all')
    const low = await seedProduct(db, {
      code: 'AL-LO2',
      name: 'Low2',
      categoryId: cat.id,
      supplierId: sup.id,
      quantity: 0,
      minStock: 5,
      maxStock: 100,
    })
    const over = await seedProduct(db, {
      code: 'AL-OV2',
      name: 'Over2',
      categoryId: cat.id,
      supplierId: sup.id,
      quantity: 100,
      minStock: 1,
      maxStock: 100,
    })
    // normal
    await seedProduct(db, {
      code: 'AL-NR3',
      name: 'Normal3',
      categoryId: cat.id,
      supplierId: sup.id,
      quantity: 50,
      minStock: 1,
      maxStock: 100,
    })

    const all = await caller.stats.alerts({ type: 'ALL' })
    expect(all.map((p) => p.id).sort((a, b) => a - b)).toEqual(
      [low.id, over.id].sort((a, b) => a - b),
    )
    expect(all).toHaveLength(2)

    // also confirm types match
    const types = new Set(all.map((p) => p.alertType))
    expect(types.has('LOW')).toBe(true)
    expect(types.has('OVER')).toBe(true)
  })
})

describe('stats.trend', () => {
  it('throws PRODUCT_NOT_FOUND when productId does not exist', async () => {
    await expect(
      caller.stats.trend({
        productId: 99999,
        dateFrom: '2026-04-01T00:00:00.000Z',
        dateTo: '2026-04-03T00:00:00.000Z',
      }),
    ).rejects.toThrow(/PRODUCT_NOT_FOUND/)
  })

  it('returns flat curve = product.quantity for each day when no stockLog rows exist', async () => {
    const cat = await seedCategory(db, 'C-trend')
    const sup = await seedSupplier(db, 'S-trend')
    const product = await seedProduct(db, {
      code: 'TR-FLAT',
      name: 'TrendFlat',
      categoryId: cat.id,
      supplierId: sup.id,
      quantity: 42,
      minStock: 1,
      maxStock: 1000,
    })
    const dateFrom = '2026-04-01T00:00:00.000Z'
    const dateTo = '2026-04-03T00:00:00.000Z'
    const r = await caller.stats.trend({
      productId: product.id,
      dateFrom,
      dateTo,
    })
    expect(Array.isArray(r)).toBe(true)
    expect(r.length).toBeGreaterThan(0)
    for (const point of r) {
      expect(point.quantity).toBe(42)
      expect(typeof point.date).toBe('string')
      expect(point.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
    // dates strictly ascending and no duplicates (I5)
    for (let i = 1; i < r.length; i++) {
      expect(r[i]!.date > r[i - 1]!.date).toBe(true)
    }
  })

  it('rejects via Zod refine when dateFrom > dateTo (BAD_REQUEST)', async () => {
    const cat = await seedCategory(db, 'C-zod')
    const sup = await seedSupplier(db, 'S-zod')
    const product = await seedProduct(db, {
      code: 'TR-ZOD',
      name: 'TrendZod',
      categoryId: cat.id,
      supplierId: sup.id,
      quantity: 10,
      minStock: 1,
      maxStock: 1000,
    })
    // Zod refine 失败 → tRPC 抛 TRPCError code='BAD_REQUEST'。
    // tRPC 把 ZodError 序列化进 message，所以这里显式检查 .code。
    let caught: unknown
    try {
      await caller.stats.trend({
        productId: product.id,
        dateFrom: '2026-05-10T00:00:00.000Z',
        dateTo: '2026-05-01T00:00:00.000Z',
      })
    } catch (e) {
      caught = e
    }
    expect(caught).toBeTruthy()
    expect((caught as { code?: string }).code).toBe('BAD_REQUEST')
  })
})

describe('stats.report', () => {
  it('returns [] when there are no products', async () => {
    const r = await caller.stats.report()
    expect(r).toEqual([])
  })

  it('returns report rows with required fields and stockValue = round2(quantity * costPrice)', async () => {
    const cat = await seedCategory(db, '电子产品')
    const sup = await seedSupplier(db, '默认供应商')
    await seedProduct(db, {
      code: 'RP-001',
      name: 'ReportItem',
      categoryId: cat.id,
      supplierId: sup.id,
      quantity: 7,
      costPrice: 3.33, // 7 * 3.33 = 23.31
      sellPrice: 9.99,
      unit: '件',
      minStock: 2,
      maxStock: 200,
    })
    const r = await caller.stats.report()
    expect(r).toHaveLength(1)
    const row = r[0]!
    expect(row.code).toBe('RP-001')
    expect(row.name).toBe('ReportItem')
    expect(row.categoryName).toBe('电子产品')
    expect(row.quantity).toBe(7)
    expect(row.unit).toBe('件')
    expect(row.costPrice).toBe(3.33)
    expect(row.stockValue).toBe(Math.round(7 * 3.33 * 100) / 100)
    expect(row.sellPrice).toBe(9.99)
    expect(row.supplierName).toBe('默认供应商')
    expect(row.minStock).toBe(2)
    expect(row.maxStock).toBe(200)
  })
})
