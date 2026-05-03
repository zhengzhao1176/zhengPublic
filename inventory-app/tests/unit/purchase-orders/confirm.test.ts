import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import { makeTestDb, resetAll, seedAdmin, seedCategory, seedSupplier, seedProduct } from '@tests/helpers/db'
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

describe('purchaseOrders.create + confirm', () => {
  it('creates DRAFT order, then confirm increments product.quantity', async () => {
    const cat = await seedCategory(db, 'C1')
    const sup = await seedSupplier(db, 'S1')
    const product = await seedProduct(db, { categoryId: cat.id, supplierId: sup.id, quantity: 0, maxStock: 1000 })
    const order = await caller.purchaseOrders.create({
      productId: product.id,
      quantity: 100,
      costPrice: 10,
      supplierId: sup.id,
      purchaser: '张三',
      purchaseDate: new Date().toISOString(),
    })
    expect(order.status).toBe('DRAFT')
    expect(order.totalAmount).toBe(1000)
    expect(/^RH\d{8}\d{4}$/.test(order.orderNo)).toBe(true)

    await caller.purchaseOrders.confirm({ id: order.id })
    const updated = await caller.purchaseOrders.byId({ id: order.id })
    expect(updated.status).toBe('CONFIRMED')
    expect(updated.confirmedAt).toBeTruthy()

    const p = await caller.products.byId({ id: product.id })
    expect(p.quantity).toBe(100)
  })

  it('confirm rejects when result exceeds maxStock', async () => {
    const cat = await seedCategory(db, 'C1')
    const sup = await seedSupplier(db, 'S1')
    const product = await seedProduct(db, { categoryId: cat.id, supplierId: sup.id, quantity: 950, maxStock: 1000 })
    const order = await caller.purchaseOrders.create({
      productId: product.id,
      quantity: 100,
      costPrice: 10,
      supplierId: sup.id,
      purchaser: '张三',
      purchaseDate: new Date().toISOString(),
    })
    await expect(caller.purchaseOrders.confirm({ id: order.id })).rejects.toThrow(/EXCEEDS_MAX_STOCK/)
    const p = await caller.products.byId({ id: product.id })
    expect(p.quantity).toBe(950)
  })

  it('repeat confirm throws ORDER_ALREADY_CONFIRMED', async () => {
    const cat = await seedCategory(db, 'C1')
    const sup = await seedSupplier(db, 'S1')
    const product = await seedProduct(db, { categoryId: cat.id, supplierId: sup.id, quantity: 0, maxStock: 1000 })
    const order = await caller.purchaseOrders.create({
      productId: product.id,
      quantity: 5,
      costPrice: 10,
      supplierId: sup.id,
      purchaser: '张三',
      purchaseDate: new Date().toISOString(),
    })
    await caller.purchaseOrders.confirm({ id: order.id })
    await expect(caller.purchaseOrders.confirm({ id: order.id })).rejects.toThrow(/ORDER_ALREADY_CONFIRMED/)
  })

  it('CONFIRMED order cannot be edited or deleted', async () => {
    const cat = await seedCategory(db, 'C1')
    const sup = await seedSupplier(db, 'S1')
    const product = await seedProduct(db, { categoryId: cat.id, supplierId: sup.id, quantity: 0, maxStock: 1000 })
    const order = await caller.purchaseOrders.create({
      productId: product.id,
      quantity: 5,
      costPrice: 10,
      supplierId: sup.id,
      purchaser: 'X',
      purchaseDate: new Date().toISOString(),
    })
    await caller.purchaseOrders.confirm({ id: order.id })
    await expect(caller.purchaseOrders.update({ id: order.id, quantity: 3 })).rejects.toThrow(/ORDER_NOT_DRAFT/)
    await expect(caller.purchaseOrders.delete({ id: order.id })).rejects.toThrow(/ORDER_NOT_DRAFT/)
  })

  it('order numbers are monotonic per day', async () => {
    const cat = await seedCategory(db, 'C1')
    const sup = await seedSupplier(db, 'S1')
    const product = await seedProduct(db, { categoryId: cat.id, supplierId: sup.id, quantity: 0, maxStock: 1000 })
    const sameDate = '2026-05-02T10:00:00.000Z'
    const a = await caller.purchaseOrders.create({
      productId: product.id, quantity: 1, costPrice: 1, supplierId: sup.id, purchaser: 'X',
      purchaseDate: sameDate,
    })
    const b = await caller.purchaseOrders.create({
      productId: product.id, quantity: 1, costPrice: 1, supplierId: sup.id, purchaser: 'X',
      purchaseDate: sameDate,
    })
    expect(a.orderNo.endsWith('0001')).toBe(true)
    expect(b.orderNo.endsWith('0002')).toBe(true)
  })
})
