import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import { makeTestDb, reset, seedCategory, seedSupplier } from '../helpers/db'
import { appRouter } from '@/server/routers/_app'
import { createCallerFactory } from '@/server/trpc'

let db: PrismaClient
let caller: ReturnType<ReturnType<typeof createCallerFactory<typeof appRouter>>>
let cat: { id: number }
let sup: { id: number }

const validInput = (overrides: Record<string, unknown> = {}) => ({
  code: 'P001',
  name: 'Widget',
  categoryId: cat.id,
  costPrice: 10.5,
  sellPrice: 20,
  quantity: 5,
  unit: 'pcs',
  supplierId: sup.id,
  minStock: 1,
  maxStock: 100,
  ...overrides,
})

beforeAll(() => {
  db = makeTestDb()
  caller = createCallerFactory(appRouter)({ db, user: null })
})

beforeEach(async () => {
  await reset(db)
  cat = await seedCategory(db)
  sup = await seedSupplier(db)
})

afterAll(async () => {
  await db.$disconnect()
})

describe('products.create — input validation', () => {
  it('rejects code shorter than 3 chars', async () => {
    await expect(caller.products.create(validInput({ code: 'AB' }))).rejects.toThrow()
  })

  it('rejects code longer than 20 chars', async () => {
    await expect(
      caller.products.create(validInput({ code: 'A'.repeat(21) })),
    ).rejects.toThrow()
  })

  it('rejects code with invalid characters', async () => {
    await expect(caller.products.create(validInput({ code: 'P 01' }))).rejects.toThrow()
    await expect(caller.products.create(validInput({ code: 'P@01' }))).rejects.toThrow()
  })

  it('rejects empty name', async () => {
    await expect(caller.products.create(validInput({ name: '' }))).rejects.toThrow()
    await expect(caller.products.create(validInput({ name: '   ' }))).rejects.toThrow()
  })

  it('rejects costPrice <= 0', async () => {
    await expect(caller.products.create(validInput({ costPrice: 0 }))).rejects.toThrow()
    await expect(caller.products.create(validInput({ costPrice: -1 }))).rejects.toThrow()
  })

  it('rejects sellPrice <= 0', async () => {
    await expect(caller.products.create(validInput({ sellPrice: 0 }))).rejects.toThrow()
    await expect(caller.products.create(validInput({ sellPrice: -1 }))).rejects.toThrow()
  })

  it('rejects negative quantity', async () => {
    await expect(caller.products.create(validInput({ quantity: -1 }))).rejects.toThrow()
  })

  it('rejects non-integer quantity', async () => {
    await expect(caller.products.create(validInput({ quantity: 1.5 }))).rejects.toThrow()
  })

  it('rejects costPrice with > 2 decimals', async () => {
    await expect(caller.products.create(validInput({ costPrice: 10.123 }))).rejects.toThrow()
  })

  it('rejects maxStock <= minStock', async () => {
    await expect(
      caller.products.create(validInput({ minStock: 10, maxStock: 10 })),
    ).rejects.toThrow()
    await expect(
      caller.products.create(validInput({ minStock: 10, maxStock: 5 })),
    ).rejects.toThrow()
  })

  it('rejects minStock <= 0', async () => {
    await expect(caller.products.create(validInput({ minStock: 0 }))).rejects.toThrow()
  })
})

describe('products.create — business rules', () => {
  it('creates a product with valid input', async () => {
    const result = await caller.products.create(validInput())
    expect(result.id).toBeGreaterThan(0)
    expect(result.code).toBe('P001')
    expect(result.costPrice).toBe(10.5)
  })

  it('throws CODE_EXISTS for duplicate code', async () => {
    await caller.products.create(validInput({ code: 'DUP001' }))
    await expect(
      caller.products.create(validInput({ code: 'DUP001', name: 'Other' })),
    ).rejects.toThrow(/CODE_EXISTS/)
  })

  it('throws CATEGORY_NOT_FOUND for unknown categoryId', async () => {
    await expect(
      caller.products.create(validInput({ categoryId: 99999 })),
    ).rejects.toThrow(/CATEGORY_NOT_FOUND/)
  })

  it('throws SUPPLIER_NOT_FOUND for unknown supplierId', async () => {
    await expect(
      caller.products.create(validInput({ supplierId: 99999 })),
    ).rejects.toThrow(/SUPPLIER_NOT_FOUND/)
  })

  it('checks category before supplier before code (precondition order)', async () => {
    // All three are wrong; the error must be CATEGORY_NOT_FOUND (first in order)
    await caller.products.create(validInput({ code: 'EXISTING' }))
    await expect(
      caller.products.create({
        ...validInput(),
        code: 'EXISTING',
        categoryId: 99999,
        supplierId: 99999,
      }),
    ).rejects.toThrow(/CATEGORY_NOT_FOUND/)
  })
})

describe('products.create — round trip (I2, I6, I7)', () => {
  it('persists exactly what was sent (I6 numeric preservation)', async () => {
    const input = validInput({ code: 'RT01', costPrice: 99.99, sellPrice: 0.01 })
    const created = await caller.products.create(input)
    const fetched = await caller.products.byId({ id: created.id })
    expect(fetched.costPrice).toBe(99.99)
    expect(fetched.sellPrice).toBe(0.01)
    expect(fetched.quantity).toBe(input.quantity)
    expect(fetched.minStock).toBe(input.minStock)
    expect(fetched.maxStock).toBe(input.maxStock)
  })

  it('trims name on persist (I7)', async () => {
    const created = await caller.products.create(validInput({ name: '  Trim Me  ' }))
    const fetched = await caller.products.byId({ id: created.id })
    expect(fetched.name).toBe('Trim Me')
  })

  it('byCode finds the product by its code', async () => {
    await caller.products.create(validInput({ code: 'BC01' }))
    const found = await caller.products.byCode({ code: 'BC01' })
    expect(found?.code).toBe('BC01')
  })

  it('byCode returns null for unknown code', async () => {
    const found = await caller.products.byCode({ code: 'NOPE' })
    expect(found).toBeNull()
  })
})
