import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import { makeTestDb, resetAll, seedAdmin, seedCategory, seedSupplier } from '@tests/helpers/db'
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

describe('categories CRUD', () => {
  it('creates with valid input', async () => {
    const c = await caller.categories.create({ name: '电子产品' })
    expect(c.id).toBeGreaterThan(0)
    expect(c.name).toBe('电子产品')
  })
  it('rejects empty name', async () => {
    await expect(caller.categories.create({ name: '   ' })).rejects.toThrow()
  })
  it('throws CATEGORY_NAME_EXISTS for duplicate', async () => {
    await caller.categories.create({ name: 'A' })
    await expect(caller.categories.create({ name: 'A' })).rejects.toThrow(/CATEGORY_NAME_EXISTS/)
  })
  it('lists with keyword filter', async () => {
    await caller.categories.create({ name: 'AAA' })
    await caller.categories.create({ name: 'BBB' })
    const r = await caller.categories.list({ keyword: 'AA' })
    expect(r.map((c) => c.name)).toEqual(['AAA'])
  })
  it('throws CATEGORY_NOT_FOUND on byId for missing', async () => {
    await expect(caller.categories.byId({ id: 999 })).rejects.toThrow(/CATEGORY_NOT_FOUND/)
  })
  it('updates name and trims it', async () => {
    const c = await caller.categories.create({ name: 'Old' })
    const u = await caller.categories.update({ id: c.id, name: '  New  ' })
    expect(u.name).toBe('New')
  })
  it('throws CATEGORY_NAME_EXISTS when updating to a conflicting name', async () => {
    const a = await caller.categories.create({ name: 'A' })
    await caller.categories.create({ name: 'B' })
    await expect(caller.categories.update({ id: a.id, name: 'B' })).rejects.toThrow(/CATEGORY_NAME_EXISTS/)
  })
  it('throws CATEGORY_IN_USE when there are products', async () => {
    const c = await seedCategory(db, 'X')
    const s = await seedSupplier(db, 'Y')
    await db.product.create({
      data: {
        code: 'P1',
        name: 'p',
        categoryId: c.id,
        costPrice: 1,
        sellPrice: 2,
        quantity: 0,
        unit: '件',
        supplierId: s.id,
        minStock: 1,
        maxStock: 10,
      },
    })
    await expect(caller.categories.delete({ id: c.id })).rejects.toThrow(/CATEGORY_IN_USE/)
  })
  it('deletes when unused', async () => {
    const c = await caller.categories.create({ name: 'Z' })
    await caller.categories.delete({ id: c.id })
    await expect(caller.categories.byId({ id: c.id })).rejects.toThrow(/CATEGORY_NOT_FOUND/)
  })
})
