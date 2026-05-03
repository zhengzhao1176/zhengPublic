import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import type { Prisma } from '@prisma/client'
import { router, protectedProcedure } from '../trpc'

const moneyField = z
  .number()
  .finite()
  .positive()
  .max(99999.99)
  .refine((n) => Math.round(n * 100) === n * 100, 'max 2 decimals')

export const productCreateInput = z
  .object({
    code: z.string().regex(/^[A-Za-z0-9-]{3,20}$/),
    name: z.string().trim().min(1).max(100),
    categoryId: z.number().int().positive(),
    description: z.string().max(1000).optional(),
    costPrice: moneyField,
    sellPrice: moneyField,
    quantity: z.number().int().nonnegative(),
    unit: z.string().min(1).max(20),
    supplierId: z.number().int().positive(),
    minStock: z.number().int().positive(),
    maxStock: z.number().int(),
  })
  .refine((d) => d.maxStock > d.minStock, {
    message: 'maxStock must be greater than minStock',
    path: ['maxStock'],
  })

export type ProductCreateInput = z.infer<typeof productCreateInput>

const productUpdateInput = z.object({
  id: z.number().int().positive(),
  name: z.string().trim().min(1).max(100).optional(),
  categoryId: z.number().int().positive().optional(),
  description: z.string().max(1000).nullable().optional(),
  costPrice: moneyField.optional(),
  sellPrice: moneyField.optional(),
  quantity: z.number().int().nonnegative().optional(),
  unit: z.string().min(1).max(20).optional(),
  supplierId: z.number().int().positive().optional(),
  minStock: z.number().int().positive().optional(),
  maxStock: z.number().int().optional(),
})

const productInclude = {
  category: { select: { id: true, name: true } },
  supplier: { select: { id: true, name: true } },
} satisfies Prisma.ProductInclude

export const productsRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        keyword: z.string().optional(),
        categoryId: z.number().int().positive().optional(),
        stockStatus: z.enum(['ALL', 'LOW', 'OVER', 'NORMAL']).default('ALL'),
        page: z.number().int().positive().default(1),
        pageSize: z.number().int().min(10).max(50).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const filters: Prisma.ProductWhereInput[] = []
      if (input.keyword) {
        filters.push({
          OR: [
            { code: { contains: input.keyword } },
            { name: { contains: input.keyword } },
          ],
        })
      }
      if (input.categoryId) {
        filters.push({ categoryId: input.categoryId })
      }
      const where: Prisma.ProductWhereInput = filters.length ? { AND: filters } : {}

      // Stock status: filtering on relation to fields requires raw post-filter
      // because Prisma SQLite can't compare two columns in WHERE.
      const all = await ctx.db.product.findMany({
        where,
        include: productInclude,
        orderBy: { id: 'desc' },
      })
      const filtered = all.filter((p) => {
        if (input.stockStatus === 'ALL') return true
        const low = p.quantity <= p.minStock
        const over = p.quantity >= p.maxStock
        if (input.stockStatus === 'LOW') return low
        if (input.stockStatus === 'OVER') return over
        return !low && !over
      })
      const start = (input.page - 1) * input.pageSize
      const items = filtered.slice(start, start + input.pageSize)
      return { items, total: filtered.length, page: input.page, pageSize: input.pageSize }
    }),

  byId: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const row = await ctx.db.product.findUnique({
        where: { id: input.id },
        include: productInclude,
      })
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'PRODUCT_NOT_FOUND' })
      return row
    }),

  byCode: protectedProcedure
    .input(z.object({ code: z.string() }))
    .query(({ ctx, input }) =>
      ctx.db.product.findUnique({
        where: { code: input.code },
        include: productInclude,
      }),
    ),

  create: protectedProcedure
    .input(productCreateInput)
    .mutation(async ({ ctx, input }) => {
      const cat = await ctx.db.category.findUnique({ where: { id: input.categoryId } })
      if (!cat) throw new TRPCError({ code: 'NOT_FOUND', message: 'CATEGORY_NOT_FOUND' })
      const sup = await ctx.db.supplier.findUnique({ where: { id: input.supplierId } })
      if (!sup) throw new TRPCError({ code: 'NOT_FOUND', message: 'SUPPLIER_NOT_FOUND' })
      const dup = await ctx.db.product.findUnique({ where: { code: input.code } })
      if (dup) throw new TRPCError({ code: 'CONFLICT', message: 'CODE_EXISTS' })
      return ctx.db.product.create({
        data: {
          code: input.code,
          name: input.name,
          categoryId: input.categoryId,
          costPrice: input.costPrice,
          sellPrice: input.sellPrice,
          quantity: input.quantity,
          unit: input.unit,
          supplierId: input.supplierId,
          minStock: input.minStock,
          maxStock: input.maxStock,
          ...(input.description !== undefined ? { description: input.description } : {}),
        },
      })
    }),

  update: protectedProcedure
    .input(productUpdateInput)
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.product.findUnique({ where: { id: input.id } })
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'PRODUCT_NOT_FOUND' })
      if (input.categoryId !== undefined && input.categoryId !== row.categoryId) {
        const cat = await ctx.db.category.findUnique({ where: { id: input.categoryId } })
        if (!cat)
          throw new TRPCError({ code: 'NOT_FOUND', message: 'CATEGORY_NOT_FOUND' })
      }
      if (input.supplierId !== undefined && input.supplierId !== row.supplierId) {
        const sup = await ctx.db.supplier.findUnique({ where: { id: input.supplierId } })
        if (!sup)
          throw new TRPCError({ code: 'NOT_FOUND', message: 'SUPPLIER_NOT_FOUND' })
      }
      const finalMin = input.minStock ?? row.minStock
      const finalMax = input.maxStock ?? row.maxStock
      if (finalMax <= finalMin) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'maxStock must be greater than minStock',
        })
      }
      const data: Prisma.ProductUpdateInput = {}
      if (input.name !== undefined) data.name = input.name
      if (input.categoryId !== undefined)
        data.category = { connect: { id: input.categoryId } }
      if (input.supplierId !== undefined)
        data.supplier = { connect: { id: input.supplierId } }
      if (input.description !== undefined) data.description = input.description
      if (input.costPrice !== undefined) data.costPrice = input.costPrice
      if (input.sellPrice !== undefined) data.sellPrice = input.sellPrice
      if (input.quantity !== undefined) data.quantity = input.quantity
      if (input.unit !== undefined) data.unit = input.unit
      if (input.minStock !== undefined) data.minStock = input.minStock
      if (input.maxStock !== undefined) data.maxStock = input.maxStock
      return ctx.db.product.update({ where: { id: input.id }, data })
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.product.findUnique({ where: { id: input.id } })
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'PRODUCT_NOT_FOUND' })
      if (row.quantity > 0)
        throw new TRPCError({ code: 'CONFLICT', message: 'PRODUCT_HAS_STOCK' })
      await ctx.db.product.delete({ where: { id: input.id } })
      return { ok: true as const }
    }),

  batchDelete: protectedProcedure
    .input(z.object({ ids: z.array(z.number().int().positive()).min(1).max(100) }))
    .mutation(async ({ ctx, input }) => {
      const deletedIds: number[] = []
      const failed: Array<{ id: number; reason: 'PRODUCT_NOT_FOUND' | 'PRODUCT_HAS_STOCK' }> = []
      for (const id of input.ids) {
        const row = await ctx.db.product.findUnique({ where: { id } })
        if (!row) {
          failed.push({ id, reason: 'PRODUCT_NOT_FOUND' })
          continue
        }
        if (row.quantity > 0) {
          failed.push({ id, reason: 'PRODUCT_HAS_STOCK' })
          continue
        }
        await ctx.db.product.delete({ where: { id } })
        deletedIds.push(id)
      }
      return { deletedIds, failed }
    }),
})
