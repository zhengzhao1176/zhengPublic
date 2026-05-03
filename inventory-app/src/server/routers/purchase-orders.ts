import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import type { Prisma } from '@prisma/client'
import { router, protectedProcedure } from '../trpc'
import { nextPurchaseOrderNo } from '@/lib/order-no'
import { round2 } from '@/lib/format'

const moneyField = z
  .number()
  .finite()
  .positive()
  .max(99999.99)
  .refine((n) => Math.round(n * 100) === n * 100, 'max 2 decimals')

const purchaseCreateInput = z.object({
  productId: z.number().int().positive(),
  quantity: z.number().int().positive(),
  costPrice: moneyField,
  supplierId: z.number().int().positive(),
  purchaser: z.string().trim().min(1).max(50),
  remark: z.string().max(1000).optional(),
  purchaseDate: z.string().datetime(),
})

const purchaseUpdateInput = z.object({
  id: z.number().int().positive(),
  productId: z.number().int().positive().optional(),
  quantity: z.number().int().positive().optional(),
  costPrice: moneyField.optional(),
  supplierId: z.number().int().positive().optional(),
  purchaser: z.string().trim().min(1).max(50).optional(),
  remark: z.string().max(1000).nullable().optional(),
  purchaseDate: z.string().datetime().optional(),
})

const include = {
  product: { select: { id: true, code: true, name: true, unit: true, maxStock: true, quantity: true } },
  supplier: { select: { id: true, name: true } },
} satisfies Prisma.PurchaseOrderInclude

export const purchaseOrdersRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        orderNo: z.string().optional(),
        supplierId: z.number().int().positive().optional(),
        dateFrom: z.string().datetime().optional(),
        dateTo: z.string().datetime().optional(),
        status: z.enum(['DRAFT', 'CONFIRMED']).optional(),
        page: z.number().int().positive().default(1),
        pageSize: z.number().int().min(10).max(50).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const filters: Prisma.PurchaseOrderWhereInput[] = []
      if (input.orderNo) filters.push({ orderNo: { contains: input.orderNo } })
      if (input.supplierId) filters.push({ supplierId: input.supplierId })
      if (input.status) filters.push({ status: input.status })
      if (input.dateFrom || input.dateTo) {
        const range: Prisma.DateTimeFilter = {}
        if (input.dateFrom) range.gte = new Date(input.dateFrom)
        if (input.dateTo) range.lte = new Date(input.dateTo)
        filters.push({ purchaseDate: range })
      }
      const where: Prisma.PurchaseOrderWhereInput = filters.length ? { AND: filters } : {}
      const total = await ctx.db.purchaseOrder.count({ where })
      const items = await ctx.db.purchaseOrder.findMany({
        where,
        include,
        orderBy: [{ purchaseDate: 'desc' }, { orderNo: 'desc' }],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      })
      return { items, total, page: input.page, pageSize: input.pageSize }
    }),

  byId: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const row = await ctx.db.purchaseOrder.findUnique({
        where: { id: input.id },
        include,
      })
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'ORDER_NOT_FOUND' })
      return row
    }),

  create: protectedProcedure
    .input(purchaseCreateInput)
    .mutation(async ({ ctx, input }) => {
      const product = await ctx.db.product.findUnique({ where: { id: input.productId } })
      if (!product) throw new TRPCError({ code: 'NOT_FOUND', message: 'PRODUCT_NOT_FOUND' })
      const sup = await ctx.db.supplier.findUnique({ where: { id: input.supplierId } })
      if (!sup) throw new TRPCError({ code: 'NOT_FOUND', message: 'SUPPLIER_NOT_FOUND' })
      const purchaseDate = new Date(input.purchaseDate)
      const total = round2(input.quantity * input.costPrice)
      return ctx.db.$transaction(async (tx) => {
        const orderNo = await nextPurchaseOrderNo(tx, purchaseDate)
        return tx.purchaseOrder.create({
          data: {
            orderNo,
            productId: input.productId,
            quantity: input.quantity,
            costPrice: input.costPrice,
            totalAmount: total,
            supplierId: input.supplierId,
            purchaser: input.purchaser,
            ...(input.remark !== undefined ? { remark: input.remark } : {}),
            purchaseDate,
          },
        })
      })
    }),

  update: protectedProcedure
    .input(purchaseUpdateInput)
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.purchaseOrder.findUnique({ where: { id: input.id } })
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'ORDER_NOT_FOUND' })
      if (row.status !== 'DRAFT')
        throw new TRPCError({ code: 'CONFLICT', message: 'ORDER_NOT_DRAFT' })
      if (input.productId !== undefined && input.productId !== row.productId) {
        const p = await ctx.db.product.findUnique({ where: { id: input.productId } })
        if (!p) throw new TRPCError({ code: 'NOT_FOUND', message: 'PRODUCT_NOT_FOUND' })
      }
      if (input.supplierId !== undefined && input.supplierId !== row.supplierId) {
        const s = await ctx.db.supplier.findUnique({ where: { id: input.supplierId } })
        if (!s) throw new TRPCError({ code: 'NOT_FOUND', message: 'SUPPLIER_NOT_FOUND' })
      }
      const finalQty = input.quantity ?? row.quantity
      const finalPrice = input.costPrice ?? row.costPrice
      const totalAmount = round2(finalQty * finalPrice)
      const data: Prisma.PurchaseOrderUpdateInput = { totalAmount }
      if (input.productId !== undefined)
        data.product = { connect: { id: input.productId } }
      if (input.supplierId !== undefined)
        data.supplier = { connect: { id: input.supplierId } }
      if (input.quantity !== undefined) data.quantity = input.quantity
      if (input.costPrice !== undefined) data.costPrice = input.costPrice
      if (input.purchaser !== undefined) data.purchaser = input.purchaser
      if (input.remark !== undefined) data.remark = input.remark
      if (input.purchaseDate !== undefined)
        data.purchaseDate = new Date(input.purchaseDate)
      return ctx.db.purchaseOrder.update({ where: { id: input.id }, data })
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.purchaseOrder.findUnique({ where: { id: input.id } })
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'ORDER_NOT_FOUND' })
      if (row.status !== 'DRAFT')
        throw new TRPCError({ code: 'CONFLICT', message: 'ORDER_NOT_DRAFT' })
      await ctx.db.purchaseOrder.delete({ where: { id: input.id } })
      return { ok: true as const }
    }),

  confirm: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.purchaseOrder.findUnique({ where: { id: input.id } })
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'ORDER_NOT_FOUND' })
      if (row.status !== 'DRAFT')
        throw new TRPCError({ code: 'CONFLICT', message: 'ORDER_ALREADY_CONFIRMED' })
      const product = await ctx.db.product.findUnique({ where: { id: row.productId } })
      if (!product) throw new TRPCError({ code: 'NOT_FOUND', message: 'PRODUCT_NOT_FOUND' })
      if (product.quantity + row.quantity > product.maxStock) {
        throw new TRPCError({ code: 'CONFLICT', message: 'EXCEEDS_MAX_STOCK' })
      }
      return ctx.db.$transaction(async (tx) => {
        await tx.product.update({
          where: { id: product.id },
          data: { quantity: { increment: row.quantity } },
        })
        await tx.stockLog.create({
          data: {
            productId: product.id,
            delta: row.quantity,
            reason: `PURCHASE_ORDER:${row.orderNo}`,
          },
        })
        return tx.purchaseOrder.update({
          where: { id: row.id },
          data: { status: 'CONFIRMED', confirmedAt: new Date() },
        })
      })
    }),
})
