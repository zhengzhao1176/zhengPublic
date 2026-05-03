import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/server/db'

const schema = z.object({
  categories: z
    .array(z.object({ name: z.string(), description: z.string().optional() }))
    .optional(),
  suppliers: z
    .array(
      z.object({
        name: z.string(),
        contact: z.string().optional(),
        address: z.string().optional(),
      }),
    )
    .optional(),
  products: z
    .array(
      z.object({
        code: z.string(),
        name: z.string(),
        categoryName: z.string(),
        costPrice: z.number(),
        sellPrice: z.number(),
        quantity: z.number().int(),
        unit: z.string(),
        supplierName: z.string(),
        minStock: z.number().int(),
        maxStock: z.number().int(),
        description: z.string().optional(),
      }),
    )
    .optional(),
})

export async function POST(req: Request) {
  if (process.env.NODE_ENV === 'production' || process.env.INV_TEST_API !== '1') {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })
  }
  const body = schema.parse(await req.json())

  const cats = await Promise.all(
    (body.categories ?? []).map((c) =>
      db.category.create({
        data: { name: c.name, ...(c.description !== undefined ? { description: c.description } : {}) },
      }),
    ),
  )
  const sups = await Promise.all(
    (body.suppliers ?? []).map((s) =>
      db.supplier.create({
        data: {
          name: s.name,
          ...(s.contact !== undefined ? { contact: s.contact } : {}),
          ...(s.address !== undefined ? { address: s.address } : {}),
        },
      }),
    ),
  )
  const prods = await Promise.all(
    (body.products ?? []).map(async (p) => {
      const cat = cats.find((c) => c.name === p.categoryName)
      const sup = sups.find((s) => s.name === p.supplierName)
      if (!cat || !sup) throw new Error('seed reference missing')
      return db.product.create({
        data: {
          code: p.code,
          name: p.name,
          categoryId: cat.id,
          costPrice: p.costPrice,
          sellPrice: p.sellPrice,
          quantity: p.quantity,
          unit: p.unit,
          supplierId: sup.id,
          minStock: p.minStock,
          maxStock: p.maxStock,
          ...(p.description !== undefined ? { description: p.description } : {}),
        },
      })
    }),
  )
  return NextResponse.json({
    categories: cats.map((c) => ({ id: c.id, name: c.name })),
    suppliers: sups.map((s) => ({ id: s.id, name: s.name })),
    products: prods.map((p) => ({ id: p.id, code: p.code })),
  })
}
