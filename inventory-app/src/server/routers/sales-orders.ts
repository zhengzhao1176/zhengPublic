import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import type { Prisma } from '@prisma/client'
import { router, protectedProcedure } from '../trpc'
import { nextSalesOrderNo } from '@/lib/order-no'
import { round2 } from '@/lib/format'

const moneyField = z
  .number()
  .finite()
  .positive()
  .max(99999.99)
  .refine((n) => Math.round(n * 100) === n * 100, 'max 2 decimals')

const salesCreateInput = z.object({
  productId: z.number().int().positive(),
  quantity: z.number().int().positive(),
  sellPrice: moneyField,
  customer: z.string().trim().min(1).max(100),
  shipper: z.string().trim().min(1).max(50),
  remark: z.string().max(1000).optional(),
  salesDate: z.string().datetime(),
})

const salesUpdateInput = z.object({
  id: z.number().int().positive(),
  productId: z.number().int().positive().optional(),
  quantity: z.number().int().positive().optional(),
  sellPrice: moneyField.optional(),
  customer: z.string().trim().min(1).max(100).optional(),
  shipper: z.string().trim().min(1).max(50).optional(),
  remark: z.string().max(1000).nullable().optional(),
  salesDate: z.string().datetime().optional(),
})

const include = {
  product: { select: { id: true, code: true, name: true, unit: true, quantity: true } },
} satisfies Prisma.SalesOrderInclude

export const salesOrdersRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        orderNo: z.string().optional(),
        customer: z.string().optional(),
        dateFrom: z.string().datetime().optional(),
        dateTo: z.string().datetime().optional(),
        status: z.enum(['DRAFT', 'CONFIRMED']).optional(),
        page: z.number().int().positive().default(1),
        pageSize: z.number().int().min(10).max(50).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const filters: Prisma.SalesOrderWhereInput[] = []
      if (input.orderNo) filters.push({ orderNo: { contains: input.orderNo } })
      if (input.customer) filters.push({ customer: { contains: input.customer } })
      if (input.status) filters.push({ status: input.status })
      if (input.dateFrom || input.dateTo) {
        const range: Prisma.DateTimeFilter = {}
        if (input.dateFrom) range.gte = new Date(input.dateFrom)
        if (input.dateTo) range.lte = new Date(input.dateTo)
        filters.push({ salesDate: range })
      }
      const where: Prisma.SalesOrderWhereInput = filters.length ? { AND: filters } : {}
      const total = await ctx.db.salesOrder.count({ where })
      const items = await ctx.db.salesOrder.findMany({
        where,
        include,
        orderBy: [{ salesDate: 'desc' }, { orderNo: 'desc' }],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      })
      return { items, total, page: input.page, pageSize: input.pageSize }
    }),

  byId: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const row = await ctx.db.salesOrder.findUnique({ where: { id: input.id }, include })
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'ORDER_NOT_FOUND' })
      return row
    }),

  create: protectedProcedure
    .input(salesCreateInput)
    .mutation(async ({ ctx, input }) => {
      const product = await ctx.db.product.findUnique({ where: { id: input.productId } })
      if (!product) throw new TRPCError({ code: 'NOT_FOUND', message: 'PRODUCT_NOT_FOUND' })
      const salesDate = new Date(input.salesDate)
      const total = round2(input.quantity * input.sellPrice)
      return ctx.db.$transaction(async (tx) => {
        const orderNo = await nextSalesOrderNo(tx, salesDate)
        return tx.salesOrder.create({
          data: {
            orderNo,
            productId: input.productId,
            quantity: input.quantity,
            sellPrice: input.sellPrice,
            totalAmount: total,
            customer: input.customer,
            shipper: input.shipper,
            ...(input.remark !== undefined ? { remark: input.remark } : {}),
            salesDate,
          },
        })
      })
    }),

  update: protectedProcedure
    .input(salesUpdateInput)
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.salesOrder.findUnique({ where: { id: input.id } })
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'ORDER_NOT_FOUND' })
      if (row.status !== 'DRAFT')
        throw new TRPCError({ code: 'CONFLICT', message: 'ORDER_NOT_DRAFT' })
      if (input.productId !== undefined && input.productId !== row.productId) {
        const p = await ctx.db.product.findUnique({ where: { id: input.productId } })
        if (!p) throw new TRPCError({ code: 'NOT_FOUND', message: 'PRODUCT_NOT_FOUND' })
      }
      const finalQty = input.quantity ?? row.quantity
      const finalPrice = input.sellPrice ?? row.sellPrice
      const totalAmount = round2(finalQty * finalPrice)
      const data: Prisma.SalesOrderUpdateInput = { totalAmount }
      if (input.productId !== undefined)
        data.product = { connect: { id: input.productId } }
      if (input.quantity !== undefined) data.quantity = input.quantity
      if (input.sellPrice !== undefined) data.sellPrice = input.sellPrice
      if (input.customer !== undefined) data.customer = input.customer
      if (input.shipper !== undefined) data.shipper = input.shipper
      if (input.remark !== undefined) data.remark = input.remark
      if (input.salesDate !== undefined) data.salesDate = new Date(input.salesDate)
      return ctx.db.salesOrder.update({ where: { id: input.id }, data })
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.salesOrder.findUnique({ where: { id: input.id } })
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'ORDER_NOT_FOUND' })
      if (row.status !== 'DRAFT')
        throw new TRPCError({ code: 'CONFLICT', message: 'ORDER_NOT_DRAFT' })
      await ctx.db.salesOrder.delete({ where: { id: input.id } })
      return { ok: true as const }
    }),

  confirm: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.salesOrder.findUnique({ where: { id: input.id } })
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'ORDER_NOT_FOUND' })
      if (row.status !== 'DRAFT')
        throw new TRPCError({ code: 'CONFLICT', message: 'ORDER_ALREADY_CONFIRMED' })
      const product = await ctx.db.product.findUnique({ where: { id: row.productId } })
      if (!product) throw new TRPCError({ code: 'NOT_FOUND', message: 'PRODUCT_NOT_FOUND' })
      if (product.quantity < row.quantity) {
        throw new TRPCError({ code: 'CONFLICT', message: 'INSUFFICIENT_STOCK' })
      }
      return ctx.db.$transaction(async (tx) => {
        await tx.product.update({
          where: { id: product.id },
          data: { quantity: { decrement: row.quantity } },
        })
        await tx.stockLog.create({
          data: {
            productId: product.id,
            delta: -row.quantity,
            reason: `SALES_ORDER:${row.orderNo}`,
          },
        })
        return tx.salesOrder.update({
          where: { id: row.id },
          data: { status: 'CONFIRMED', confirmedAt: new Date() },
        })
      })
    }),
})
