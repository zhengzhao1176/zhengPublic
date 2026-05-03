import { describe, it, beforeAll, beforeEach, afterAll, expect } from 'vitest'
import fc from 'fast-check'
import type { PrismaClient } from '@prisma/client'
import { makeTestDb, reset, seedCategory, seedSupplier } from '../helpers/db'
import { appRouter } from '@/server/routers/_app'
import { createCallerFactory } from '@/server/trpc'

let db: PrismaClient
let caller: ReturnType<ReturnType<typeof createCallerFactory<typeof appRouter>>>

beforeAll(() => {
  db = makeTestDb()
  caller = createCallerFactory(appRouter)({ db, user: null })
})

beforeEach(async () => {
  await reset(db)
})

afterAll(async () => {
  await db.$disconnect()
})

// ---------- Arbitraries derived from spec constraints ----------

const codeArb = fc.stringMatching(/^[A-Za-z0-9-]{3,20}$/)

const moneyArb = fc
  .float({
    min: Math.fround(0.01),
    max: 99999,
    noNaN: true,
    noDefaultInfinity: true,
  })
  .map((n) => Math.round(n * 100) / 100)
  .filter((n) => n > 0)

const nameArb = fc
  .string({ minLength: 1, maxLength: 100 })
  .filter((s) => s.trim().length > 0)

const stockRangeArb = fc
  .tuple(fc.integer({ min: 1, max: 999999 }), fc.integer({ min: 1, max: 1000000 }))
  .filter(([a, b]) => a < b)

const validInputArb = () =>
  fc.record({
    code: codeArb,
    name: nameArb,
    costPrice: moneyArb,
    sellPrice: moneyArb,
    quantity: fc.integer({ min: 0, max: 1000000 }),
    unit: fc.string({ minLength: 1, maxLength: 20 }),
    stockRange: stockRangeArb,
  })

// ---------- Property tests ----------

describe('products invariants (random inputs)', () => {
  it('I2: any valid input round-trips through create→byId unchanged', async () => {
    await fc.assert(
      fc.asyncProperty(validInputArb(), async (raw) => {
        await reset(db)
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
        const created = await caller.products.create(input)
        const fetched = await caller.products.byId({ id: created.id })
        expect(fetched.code).toBe(input.code)
        expect(fetched.name).toBe(input.name.trim())
        expect(fetched.costPrice).toBe(input.costPrice)
        expect(fetched.sellPrice).toBe(input.sellPrice)
        expect(fetched.quantity).toBe(input.quantity)
        expect(fetched.minStock).toBe(input.minStock)
        expect(fetched.maxStock).toBe(input.maxStock)
      }),
      { numRuns: 30 },
    )
  })

  it('I1: second create with same code always fails (uniqueness)', async () => {
    await fc.assert(
      fc.asyncProperty(codeArb, async (code) => {
        await reset(db)
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
        await caller.products.create(base)
        await expect(caller.products.create({ ...base, name: 'Y' })).rejects.toThrow(
          /CODE_EXISTS/,
        )
      }),
      { numRuns: 20 },
    )
  })

  it('I3 + I4 + I5: every persisted Product has id>0, quantity≥0, minStock<maxStock', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(validInputArb(), { minLength: 1, maxLength: 8 }),
        async (inputs) => {
          await reset(db)
          const c = await seedCategory(db)
          const s = await seedSupplier(db)
          const seen = new Set<string>()
          for (const raw of inputs) {
            if (seen.has(raw.code)) continue
            seen.add(raw.code)
            await caller.products.create({
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
            })
          }
          const all = await db.product.findMany()
          for (const p of all) {
            expect(p.id).toBeGreaterThan(0)
            expect(p.quantity).toBeGreaterThanOrEqual(0)
            expect(p.minStock).toBeLessThan(p.maxStock)
          }
        },
      ),
      { numRuns: 10 },
    )
  })

  it('any input violating a constraint is rejected (anti-property)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          fc.record({ kind: fc.constant('shortCode'), code: fc.string({ minLength: 0, maxLength: 2 }) }),
          fc.record({ kind: fc.constant('longCode'), code: fc.string({ minLength: 21, maxLength: 30 }) }),
          fc.record({ kind: fc.constant('zeroPrice'), price: fc.constant(0) }),
          fc.record({ kind: fc.constant('negQty'), q: fc.integer({ min: -1000, max: -1 }) }),
        ),
        async (bad) => {
          await reset(db)
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
            bad.kind === 'shortCode' || bad.kind === 'longCode'
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
