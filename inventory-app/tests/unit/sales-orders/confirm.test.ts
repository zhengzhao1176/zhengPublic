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

describe('salesOrders.confirm', () => {
  it('decrements stock on confirm', async () => {
    const cat = await seedCategory(db, 'C1')
    const sup = await seedSupplier(db, 'S1')
    const product = await seedProduct(db, { categoryId: cat.id, supplierId: sup.id, quantity: 50 })
    const order = await caller.salesOrders.create({
      productId: product.id,
      quantity: 10,
      sellPrice: 20,
      customer: '王五',
      shipper: '李四',
      salesDate: new Date().toISOString(),
    })
    expect(/^CH\d{8}\d{4}$/.test(order.orderNo)).toBe(true)
    await caller.salesOrders.confirm({ id: order.id })
    const p = await caller.products.byId({ id: product.id })
    expect(p.quantity).toBe(40)
  })

  it('rejects when stock insufficient', async () => {
    const cat = await seedCategory(db, 'C1')
    const sup = await seedSupplier(db, 'S1')
    const product = await seedProduct(db, { categoryId: cat.id, supplierId: sup.id, quantity: 5 })
    const order = await caller.salesOrders.create({
      productId: product.id,
      quantity: 10,
      sellPrice: 20,
      customer: '王五',
      shipper: '李四',
      salesDate: new Date().toISOString(),
    })
    await expect(caller.salesOrders.confirm({ id: order.id })).rejects.toThrow(/INSUFFICIENT_STOCK/)
    const p = await caller.products.byId({ id: product.id })
    expect(p.quantity).toBe(5)
  })

  it('DRAFT phase does not lock stock — multiple drafts can exceed total, only confirms enforce', async () => {
    const cat = await seedCategory(db, 'C1')
    const sup = await seedSupplier(db, 'S1')
    const product = await seedProduct(db, { categoryId: cat.id, supplierId: sup.id, quantity: 10 })
    const a = await caller.salesOrders.create({
      productId: product.id, quantity: 10, sellPrice: 1, customer: 'X', shipper: 'Y',
      salesDate: new Date().toISOString(),
    })
    const b = await caller.salesOrders.create({
      productId: product.id, quantity: 10, sellPrice: 1, customer: 'X', shipper: 'Y',
      salesDate: new Date().toISOString(),
    })
    await caller.salesOrders.confirm({ id: a.id })
    await expect(caller.salesOrders.confirm({ id: b.id })).rejects.toThrow(/INSUFFICIENT_STOCK/)
  })
})
