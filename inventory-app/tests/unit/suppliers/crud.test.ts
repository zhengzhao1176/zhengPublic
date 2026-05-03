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

describe('suppliers CRUD', () => {
  it('creates with valid input', async () => {
    const s = await caller.suppliers.create({ name: '联想' })
    expect(s.id).toBeGreaterThan(0)
    expect(s.name).toBe('联想')
  })

  it('rejects empty name', async () => {
    await expect(caller.suppliers.create({ name: '   ' })).rejects.toThrow()
  })

  it('throws SUPPLIER_NAME_EXISTS for duplicate name', async () => {
    await caller.suppliers.create({ name: '联想' })
    await expect(caller.suppliers.create({ name: '联想' })).rejects.toThrow(
      /SUPPLIER_NAME_EXISTS/,
    )
  })

  it('lists with keyword filter', async () => {
    await caller.suppliers.create({ name: '联想' })
    await caller.suppliers.create({ name: '小米' })
    const r = await caller.suppliers.list({ keyword: '联' })
    expect(r.map((s) => s.name)).toEqual(['联想'])
  })

  it('throws SUPPLIER_NOT_FOUND on byId for missing', async () => {
    await expect(caller.suppliers.byId({ id: 999999 })).rejects.toThrow(
      /SUPPLIER_NOT_FOUND/,
    )
  })

  it('updates name and trims it', async () => {
    const s = await caller.suppliers.create({ name: 'Old' })
    const u = await caller.suppliers.update({ id: s.id, name: '  New  ' })
    expect(u.name).toBe('New')
  })

  it('throws SUPPLIER_NAME_EXISTS when updating to a conflicting name', async () => {
    const a = await caller.suppliers.create({ name: 'A' })
    await caller.suppliers.create({ name: 'B' })
    await expect(
      caller.suppliers.update({ id: a.id, name: 'B' }),
    ).rejects.toThrow(/SUPPLIER_NAME_EXISTS/)
  })

  it('throws SUPPLIER_IN_USE when there are products', async () => {
    const c = await seedCategory(db, 'CAT')
    const s = await seedSupplier(db, 'S1')
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
    await expect(caller.suppliers.delete({ id: s.id })).rejects.toThrow(
      /SUPPLIER_IN_USE/,
    )
  })

  it('throws SUPPLIER_IN_USE when there are purchase orders', async () => {
    const c = await seedCategory(db, 'CAT2')
    const s = await seedSupplier(db, 'S2')
    const p = await db.product.create({
      data: {
        code: 'P2',
        name: 'p2',
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
    await db.purchaseOrder.create({
      data: {
        orderNo: 'RH202605020001',
        productId: p.id,
        quantity: 1,
        costPrice: 1,
        totalAmount: 1,
        supplierId: s.id,
        purchaser: 'admin',
        purchaseDate: new Date(),
      },
    })
    // Detach product reference so only the purchase order remains as the
    // referencing entity. We do this by deleting the product after relinking
    // to a different supplier — simpler: create a separate supplier for the
    // product, leaving s2 referenced only by the purchase order.
    const otherSup = await seedSupplier(db, 'S2-other')
    await db.product.update({
      where: { id: p.id },
      data: { supplierId: otherSup.id },
    })
    await expect(caller.suppliers.delete({ id: s.id })).rejects.toThrow(
      /SUPPLIER_IN_USE/,
    )
  })

  it('deletes when unused', async () => {
    const s = await caller.suppliers.create({ name: 'Z' })
    await caller.suppliers.delete({ id: s.id })
    await expect(caller.suppliers.byId({ id: s.id })).rejects.toThrow(
      /SUPPLIER_NOT_FOUND/,
    )
  })
})
