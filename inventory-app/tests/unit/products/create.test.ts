import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import {
  makeTestDb,
  resetAll,
  seedAdmin,
  seedCategory,
  seedSupplier,
} from '@tests/helpers/db'
import { makeAuthedCaller, type AnyCaller } from '@tests/helpers/caller'

let db: PrismaClient
let caller: AnyCaller
let cat: { id: number }
let sup: { id: number }

const validInput = (overrides: Record<string, unknown> = {}) => ({
  code: 'P001',
  name: 'Widget',
  categoryId: cat.id,
  costPrice: 10.5,
  sellPrice: 20,
  quantity: 5,
  unit: '件',
  supplierId: sup.id,
  minStock: 1,
  maxStock: 100,
  ...overrides,
})

beforeAll(() => {
  db = makeTestDb()
  caller = makeAuthedCaller(db as unknown as PrismaClient)
})

beforeEach(async () => {
  await resetAll(db)
  await seedAdmin(db)
  cat = await seedCategory(db)
  sup = await seedSupplier(db)
})

afterAll(async () => {
  await db.$disconnect()
})

describe('products.create — input', () => {
  it('rejects code shorter than 3 chars', async () => {
    await expect(caller.products.create(validInput({ code: 'AB' }) as never)).rejects.toThrow()
  })
  it('rejects code with invalid chars', async () => {
    await expect(caller.products.create(validInput({ code: 'P 01' }) as never)).rejects.toThrow()
  })
  it('rejects empty name', async () => {
    await expect(caller.products.create(validInput({ name: '   ' }) as never)).rejects.toThrow()
  })
  it('rejects costPrice <= 0', async () => {
    await expect(caller.products.create(validInput({ costPrice: 0 }) as never)).rejects.toThrow()
  })
  it('rejects negative quantity', async () => {
    await expect(caller.products.create(validInput({ quantity: -1 }) as never)).rejects.toThrow()
  })
  it('rejects costPrice with > 2 decimals', async () => {
    await expect(caller.products.create(validInput({ costPrice: 10.123 }) as never)).rejects.toThrow()
  })
  it('rejects maxStock <= minStock', async () => {
    await expect(
      caller.products.create(validInput({ minStock: 10, maxStock: 10 }) as never),
    ).rejects.toThrow()
  })
})

describe('products.create — business rules', () => {
  it('creates a product on valid input', async () => {
    const r = await caller.products.create(validInput() as never)
    expect(r.id).toBeGreaterThan(0)
    expect(r.code).toBe('P001')
  })
  it('throws CODE_EXISTS for duplicate', async () => {
    await caller.products.create(validInput({ code: 'DUP' }) as never)
    await expect(
      caller.products.create(validInput({ code: 'DUP', name: 'X' }) as never),
    ).rejects.toThrow(/CODE_EXISTS/)
  })
  it('throws CATEGORY_NOT_FOUND', async () => {
    await expect(
      caller.products.create(validInput({ categoryId: 99999 }) as never),
    ).rejects.toThrow(/CATEGORY_NOT_FOUND/)
  })
  it('throws SUPPLIER_NOT_FOUND', async () => {
    await expect(
      caller.products.create(validInput({ supplierId: 99999 }) as never),
    ).rejects.toThrow(/SUPPLIER_NOT_FOUND/)
  })
  it('precondition order: category before supplier before code', async () => {
    await caller.products.create(validInput({ code: 'EXIST' }) as never)
    await expect(
      caller.products.create(
        validInput({ code: 'EXIST', categoryId: 99999, supplierId: 99999 }) as never,
      ),
    ).rejects.toThrow(/CATEGORY_NOT_FOUND/)
  })
})

describe('products — round trip', () => {
  it('persists exact numbers and trims name', async () => {
    const created = await caller.products.create(validInput({ name: '  Widget  ', costPrice: 99.99 }) as never)
    const fetched = await caller.products.byId({ id: created.id })
    expect(fetched.costPrice).toBe(99.99)
    expect(fetched.name).toBe('Widget')
  })
})

describe('products.delete', () => {
  it('throws PRODUCT_HAS_STOCK when quantity > 0', async () => {
    const c = await caller.products.create(validInput() as never)
    await expect(caller.products.delete({ id: c.id })).rejects.toThrow(/PRODUCT_HAS_STOCK/)
  })
  it('deletes when quantity = 0', async () => {
    const c = await caller.products.create(validInput({ quantity: 0 }) as never)
    await caller.products.delete({ id: c.id })
    await expect(caller.products.byId({ id: c.id })).rejects.toThrow(/PRODUCT_NOT_FOUND/)
  })
})
