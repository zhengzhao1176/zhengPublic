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

// =========================================
// products.list
// =========================================
describe('products.list — keyword & filters & pagination', () => {
  it('keyword 同时匹配 code 和 name（substring，大小写不敏感）', async () => {
    const cat = await seedCategory(db, 'C1')
    const sup = await seedSupplier(db, 'S1')
    await seedProduct(db, {
      code: 'ALPHA-1',
      name: 'Whatever',
      categoryId: cat.id,
      supplierId: sup.id,
    })
    await seedProduct(db, {
      code: 'OTHER-1',
      name: 'AlphaWidget',
      categoryId: cat.id,
      supplierId: sup.id,
    })
    await seedProduct(db, {
      code: 'NONE-1',
      name: 'Foobar',
      categoryId: cat.id,
      supplierId: sup.id,
    })

    const r = await caller.products.list({ keyword: 'alpha' })
    const codes = r.items.map((p) => p.code).sort()
    expect(codes).toEqual(['ALPHA-1', 'OTHER-1'])
    expect(r.total).toBe(2)
  })

  it('categoryId 过滤', async () => {
    const cat1 = await seedCategory(db, 'CatX')
    const cat2 = await seedCategory(db, 'CatY')
    const sup = await seedSupplier(db, 'SupZ')
    await seedProduct(db, { code: 'P-X1', categoryId: cat1.id, supplierId: sup.id })
    await seedProduct(db, { code: 'P-X2', categoryId: cat1.id, supplierId: sup.id })
    await seedProduct(db, { code: 'P-Y1', categoryId: cat2.id, supplierId: sup.id })

    const r = await caller.products.list({ categoryId: cat1.id })
    expect(r.total).toBe(2)
    expect(r.items.every((p) => p.categoryId === cat1.id)).toBe(true)
  })

  it('stockStatus=LOW 当 quantity ≤ minStock', async () => {
    const cat = await seedCategory(db, 'C-low')
    const sup = await seedSupplier(db, 'S-low')
    await seedProduct(db, {
      code: 'LOW-EQ',
      categoryId: cat.id,
      supplierId: sup.id,
      quantity: 5,
      minStock: 5,
      maxStock: 100,
    })
    await seedProduct(db, {
      code: 'LOW-LT',
      categoryId: cat.id,
      supplierId: sup.id,
      quantity: 2,
      minStock: 5,
      maxStock: 100,
    })
    await seedProduct(db, {
      code: 'NORMAL-1',
      categoryId: cat.id,
      supplierId: sup.id,
      quantity: 50,
      minStock: 5,
      maxStock: 100,
    })

    const r = await caller.products.list({ stockStatus: 'LOW' })
    const codes = r.items.map((p) => p.code).sort()
    expect(codes).toEqual(['LOW-EQ', 'LOW-LT'])
  })

  it('stockStatus=OVER 当 quantity ≥ maxStock', async () => {
    const cat = await seedCategory(db, 'C-over')
    const sup = await seedSupplier(db, 'S-over')
    await seedProduct(db, {
      code: 'OVER-EQ',
      categoryId: cat.id,
      supplierId: sup.id,
      quantity: 100,
      minStock: 5,
      maxStock: 100,
    })
    await seedProduct(db, {
      code: 'OVER-GT',
      categoryId: cat.id,
      supplierId: sup.id,
      quantity: 200,
      minStock: 5,
      maxStock: 100,
    })
    await seedProduct(db, {
      code: 'NORMAL-2',
      categoryId: cat.id,
      supplierId: sup.id,
      quantity: 50,
      minStock: 5,
      maxStock: 100,
    })

    const r = await caller.products.list({ stockStatus: 'OVER' })
    const codes = r.items.map((p) => p.code).sort()
    expect(codes).toEqual(['OVER-EQ', 'OVER-GT'])
  })

  it('stockStatus=NORMAL 排除 LOW/OVER', async () => {
    const cat = await seedCategory(db, 'C-normal')
    const sup = await seedSupplier(db, 'S-normal')
    await seedProduct(db, {
      code: 'NORM-A',
      categoryId: cat.id,
      supplierId: sup.id,
      quantity: 50,
      minStock: 5,
      maxStock: 100,
    })
    await seedProduct(db, {
      code: 'LOW-B',
      categoryId: cat.id,
      supplierId: sup.id,
      quantity: 5,
      minStock: 5,
      maxStock: 100,
    })
    await seedProduct(db, {
      code: 'OVER-C',
      categoryId: cat.id,
      supplierId: sup.id,
      quantity: 100,
      minStock: 5,
      maxStock: 100,
    })

    const r = await caller.products.list({ stockStatus: 'NORMAL' })
    const codes = r.items.map((p) => p.code)
    expect(codes).toEqual(['NORM-A'])
  })

  it('分页 page=2 pageSize=10 切片正确，total 是过滤后总数', async () => {
    const cat = await seedCategory(db, 'C-page')
    const sup = await seedSupplier(db, 'S-page')
    // 创建 25 个商品（id 升序，list 默认按 id 降序）
    for (let i = 1; i <= 25; i++) {
      await seedProduct(db, {
        code: `PG-${String(i).padStart(3, '0')}`,
        categoryId: cat.id,
        supplierId: sup.id,
        quantity: 50,
        minStock: 1,
        maxStock: 100,
      })
    }

    const r = await caller.products.list({ page: 2, pageSize: 10 })
    expect(r.page).toBe(2)
    expect(r.pageSize).toBe(10)
    expect(r.total).toBe(25)
    expect(r.items.length).toBe(10)

    // page=3 — 剩下 5 个
    const r3 = await caller.products.list({ page: 3, pageSize: 10 })
    expect(r3.items.length).toBe(5)
    expect(r3.total).toBe(25)
  })
})

// =========================================
// products.update
// =========================================
describe('products.update', () => {
  it('成功更新 name 与 costPrice', async () => {
    const cat = await seedCategory(db, 'C-up')
    const sup = await seedSupplier(db, 'S-up')
    const p = await seedProduct(db, {
      code: 'UPD-1',
      name: 'Old',
      costPrice: 10,
      categoryId: cat.id,
      supplierId: sup.id,
    })

    const r = await caller.products.update({
      id: p.id,
      name: 'New',
      costPrice: 12.34,
    })
    expect(r.name).toBe('New')
    expect(r.costPrice).toBe(12.34)
    // code 没变
    expect(r.code).toBe('UPD-1')
  })

  it('不可更新 code（input 没有 code 字段；带 code 也会被 Zod/strip 拒绝）', async () => {
    const cat = await seedCategory(db, 'C-noCode')
    const sup = await seedSupplier(db, 'S-noCode')
    const p = await seedProduct(db, {
      code: 'KEEP-1',
      categoryId: cat.id,
      supplierId: sup.id,
    })

    // 即使尝试传 code，update 也不会改它（spec: input 没有 code 字段）
    await caller.products.update({
      id: p.id,
      // @ts-expect-error 故意传一个 schema 不存在的字段
      code: 'NEWCODE',
      name: 'AfterUpdate',
    })
    const fetched = await caller.products.byId({ id: p.id })
    expect(fetched.code).toBe('KEEP-1')
    expect(fetched.name).toBe('AfterUpdate')
  })

  it('改 categoryId 到不存在 → CATEGORY_NOT_FOUND', async () => {
    const cat = await seedCategory(db, 'C-cat')
    const sup = await seedSupplier(db, 'S-cat')
    const p = await seedProduct(db, {
      code: 'C-CHK',
      categoryId: cat.id,
      supplierId: sup.id,
    })

    await expect(
      caller.products.update({ id: p.id, categoryId: 999_999 }),
    ).rejects.toThrow(/CATEGORY_NOT_FOUND/)
  })

  it('改 supplierId 到不存在 → SUPPLIER_NOT_FOUND', async () => {
    const cat = await seedCategory(db, 'C-sup')
    const sup = await seedSupplier(db, 'S-sup')
    const p = await seedProduct(db, {
      code: 'S-CHK',
      categoryId: cat.id,
      supplierId: sup.id,
    })

    await expect(
      caller.products.update({ id: p.id, supplierId: 999_999 }),
    ).rejects.toThrow(/SUPPLIER_NOT_FOUND/)
  })

  it('id 不存在 → PRODUCT_NOT_FOUND', async () => {
    await expect(
      caller.products.update({ id: 999_999, name: 'X' }),
    ).rejects.toThrow(/PRODUCT_NOT_FOUND/)
  })

  it('只改 minStock 使其 ≥ 现 maxStock → BAD_REQUEST', async () => {
    const cat = await seedCategory(db, 'C-bad')
    const sup = await seedSupplier(db, 'S-bad')
    const p = await seedProduct(db, {
      code: 'BAD-RANGE',
      categoryId: cat.id,
      supplierId: sup.id,
      minStock: 10,
      maxStock: 20,
    })

    // 改 minStock 到 ≥ 现 maxStock(20)
    await expect(
      caller.products.update({ id: p.id, minStock: 25 }),
    ).rejects.toThrow(/BAD_REQUEST|maxStock must be greater than minStock/)
  })
})

// =========================================
// products.batchDelete
// =========================================
describe('products.batchDelete', () => {
  it('3 个 quantity=0 全部成功；1 个 quantity=5 失败；1 个 id 不存在失败', async () => {
    const cat = await seedCategory(db, 'C-bd')
    const sup = await seedSupplier(db, 'S-bd')
    const a = await seedProduct(db, {
      code: 'BD-A',
      categoryId: cat.id,
      supplierId: sup.id,
      quantity: 0,
    })
    const b = await seedProduct(db, {
      code: 'BD-B',
      categoryId: cat.id,
      supplierId: sup.id,
      quantity: 0,
    })
    const c = await seedProduct(db, {
      code: 'BD-C',
      categoryId: cat.id,
      supplierId: sup.id,
      quantity: 0,
    })
    const hasStock = await seedProduct(db, {
      code: 'BD-D',
      categoryId: cat.id,
      supplierId: sup.id,
      quantity: 5,
    })
    const ghostId = 999_999

    const r = await caller.products.batchDelete({
      ids: [a.id, b.id, c.id, hasStock.id, ghostId],
    })

    expect(r.deletedIds.sort()).toEqual([a.id, b.id, c.id].sort())
    expect(r.failed.length).toBe(2)

    const failedById = new Map(r.failed.map((f) => [f.id, f.reason]))
    expect(failedById.get(hasStock.id)).toBe('PRODUCT_HAS_STOCK')
    expect(failedById.get(ghostId)).toBe('PRODUCT_NOT_FOUND')

    // I9 — deletedIds 真的不存在，failed 仍存在
    for (const id of r.deletedIds) {
      await expect(caller.products.byId({ id })).rejects.toThrow(
        /PRODUCT_NOT_FOUND/,
      )
    }
    const stillThere = await caller.products.byId({ id: hasStock.id })
    expect(stillThere.id).toBe(hasStock.id)
  })

  it('空 ids 数组 → Zod 拒绝', async () => {
    await expect(caller.products.batchDelete({ ids: [] })).rejects.toThrow()
  })

  it('100 项以上 → Zod 拒绝', async () => {
    const ids = Array.from({ length: 101 }, (_, i) => i + 1)
    await expect(caller.products.batchDelete({ ids })).rejects.toThrow()
  })
})

// =========================================
// products.byCode
// =========================================
describe('products.byCode', () => {
  it('返回 null 当不存在', async () => {
    const r = await caller.products.byCode({ code: 'NOPE-001' })
    expect(r).toBeNull()
  })

  it('返回行当存在', async () => {
    const cat = await seedCategory(db, 'C-bc')
    const sup = await seedSupplier(db, 'S-bc')
    await seedProduct(db, {
      code: 'BC-001',
      categoryId: cat.id,
      supplierId: sup.id,
    })

    const r = await caller.products.byCode({ code: 'BC-001' })
    expect(r).not.toBeNull()
    expect(r?.code).toBe('BC-001')
  })
})
