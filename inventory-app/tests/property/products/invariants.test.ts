import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fc from 'fast-check'
import type { PrismaClient } from '@prisma/client'
import { makeTestDb, resetAll, seedAdmin, seedCategory, seedSupplier } from '@tests/helpers/db'
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

const codeArb = fc.stringMatching(/^[A-Za-z0-9-]{3,20}$/)
// 用整数分（cent）派生 → 严格满足 ≤ 2 位小数；避开 IEEE-754 floats 精度
const moneyArb = fc
  .integer({ min: 1, max: 9_999_999 })
  .map((cents) => cents / 100)
  .filter((n) => Math.round(n * 100) === n * 100 && n > 0 && n <= 99999.99)
const nameArb = fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0)
const stockRangeArb = fc
  .tuple(fc.integer({ min: 1, max: 999_999 }), fc.integer({ min: 1, max: 1_000_000 }))
  .filter(([a, b]) => a < b)

describe('products invariants', () => {
  it('I2 round-trip: any valid create round-trips through byId unchanged', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          code: codeArb,
          name: nameArb,
          costPrice: moneyArb,
          sellPrice: moneyArb,
          quantity: fc.integer({ min: 0, max: 1_000_000 }),
          unit: fc.string({ minLength: 1, maxLength: 20 }),
          stockRange: stockRangeArb,
        }),
        async (raw) => {
          await resetAll(db)
          await seedAdmin(db)
          const c = await seedCategory(db)
          const s = await seedSupplier(db)
          const input = {
            code: raw.code,
            name: raw.name,
            categoryId: c.id,
            supplierId: s.id,
            costPrice: raw.costPrice,
            sellPrice: raw.sellPrice,
            quantity: raw.quantity,
            unit: raw.unit,
            minStock: raw.stockRange[0],
            maxStock: raw.stockRange[1],
          }
          const created = await caller.products.create(input as never)
          const fetched = await caller.products.byId({ id: created.id })
          expect(fetched.code).toBe(input.code)
          expect(fetched.name).toBe(input.name.trim())
          expect(fetched.costPrice).toBe(input.costPrice)
          expect(fetched.sellPrice).toBe(input.sellPrice)
          expect(fetched.quantity).toBe(input.quantity)
          expect(fetched.minStock).toBe(input.minStock)
          expect(fetched.maxStock).toBe(input.maxStock)
        },
      ),
      { numRuns: 30 },
    )
  })

  it('I1 uniqueness anti-property: 2nd create with same code fails', async () => {
    await fc.assert(
      fc.asyncProperty(codeArb, async (code) => {
        await resetAll(db)
        await seedAdmin(db)
        const c = await seedCategory(db)
        const s = await seedSupplier(db)
        const base = {
          code,
          name: 'X',
          categoryId: c.id,
          supplierId: s.id,
          costPrice: 1,
          sellPrice: 2,
          quantity: 0,
          unit: 'u',
          minStock: 1,
          maxStock: 2,
        }
        await caller.products.create(base as never)
        await expect(
          caller.products.create({ ...base, name: 'Y' } as never),
        ).rejects.toThrow(/CODE_EXISTS/)
      }),
      { numRuns: 20 },
    )
  })

  it('anti-property: violating constraint always rejected', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          fc.record({ kind: fc.constant('shortCode' as const), code: fc.string({ minLength: 0, maxLength: 2 }) }),
          fc.record({ kind: fc.constant('zeroPrice' as const), price: fc.constant(0) }),
          fc.record({ kind: fc.constant('negQty' as const), q: fc.integer({ min: -1000, max: -1 }) }),
        ),
        async (bad) => {
          await resetAll(db)
          await seedAdmin(db)
          const c = await seedCategory(db)
          const s = await seedSupplier(db)
          const base = {
            code: 'OK001',
            name: 'X',
            categoryId: c.id,
            supplierId: s.id,
            costPrice: 1,
            sellPrice: 2,
            quantity: 0,
            unit: 'u',
            minStock: 1,
            maxStock: 2,
          }
          const input =
            bad.kind === 'shortCode'
              ? { ...base, code: bad.code }
              : bad.kind === 'zeroPrice'
              ? { ...base, costPrice: bad.price }
              : { ...base, quantity: bad.q }
          await expect(caller.products.create(input as never)).rejects.toThrow()
        },
      ),
      { numRuns: 20 },
    )
  })
})
