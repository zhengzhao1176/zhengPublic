import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import dayjs from 'dayjs'
import { router, protectedProcedure } from '../trpc'
import { round2 } from '@/lib/format'

export const statsRouter = router({
  overview: protectedProcedure.query(async ({ ctx }) => {
    const products = await ctx.db.product.findMany()
    const totalProducts = products.length
    const totalQuantity = products.reduce((s, p) => s + p.quantity, 0)
    const totalValue = round2(
      products.reduce((s, p) => s + p.quantity * p.costPrice, 0),
    )
    const alertCount = products.reduce(
      (s, p) => s + (p.quantity <= p.minStock || p.quantity >= p.maxStock ? 1 : 0),
      0,
    )

    const todayStart = dayjs().startOf('day').toDate()
    const weekStart = dayjs().startOf('week').toDate()
    const monthStart = dayjs().startOf('month').toDate()

    async function sum(
      delegate: 'purchaseOrder' | 'salesOrder',
      since: Date,
    ): Promise<number> {
      const m = ctx.db[delegate] as unknown as {
        aggregate: (args: unknown) => Promise<{ _sum: { quantity: number | null } }>
      }
      const r = await m.aggregate({
        where: { status: 'CONFIRMED', confirmedAt: { gte: since } },
        _sum: { quantity: true },
      })
      return r._sum.quantity ?? 0
    }

    const [todayPurchase, todaySales, weekPurchase, weekSales, monthPurchase, monthSales] =
      await Promise.all([
        sum('purchaseOrder', todayStart),
        sum('salesOrder', todayStart),
        sum('purchaseOrder', weekStart),
        sum('salesOrder', weekStart),
        sum('purchaseOrder', monthStart),
        sum('salesOrder', monthStart),
      ])

    return {
      totalProducts,
      totalQuantity,
      totalValue,
      alertCount,
      periodStats: {
        todayPurchase,
        todaySales,
        weekPurchase,
        weekSales,
        monthPurchase,
        monthSales,
      },
    }
  }),

  alerts: protectedProcedure
    .input(z.object({ type: z.enum(['ALL', 'LOW', 'OVER']).default('ALL') }))
    .query(async ({ ctx, input }) => {
      const all = await ctx.db.product.findMany({
        include: {
          category: { select: { id: true, name: true } },
          supplier: { select: { id: true, name: true } },
        },
        orderBy: { id: 'asc' },
      })
      return all.flatMap((p) => {
        const low = p.quantity <= p.minStock
        const over = p.quantity >= p.maxStock
        if (input.type === 'LOW' && !low) return []
        if (input.type === 'OVER' && !over) return []
        if (input.type === 'ALL' && !low && !over) return []
        const alertType: 'LOW' | 'OVER' = low ? 'LOW' : 'OVER'
        return [{ ...p, alertType }]
      })
    }),

  trend: protectedProcedure
    .input(
      z
        .object({
          productId: z.number().int().positive(),
          dateFrom: z.string().datetime(),
          dateTo: z.string().datetime(),
        })
        .refine((d) => new Date(d.dateFrom) <= new Date(d.dateTo), {
          path: ['dateTo'],
          message: 'dateTo must be >= dateFrom',
        }),
    )
    .query(async ({ ctx, input }) => {
      const product = await ctx.db.product.findUnique({ where: { id: input.productId } })
      if (!product) throw new TRPCError({ code: 'NOT_FOUND', message: 'PRODUCT_NOT_FOUND' })

      const dateTo = dayjs(input.dateTo).endOf('day')
      const dateFrom = dayjs(input.dateFrom).startOf('day')

      // 取所有日志 newest first；从当前 quantity 倒推每日末库存。
      const logs = await ctx.db.stockLog.findMany({
        where: { productId: product.id },
        orderBy: { createdAt: 'desc' },
      })

      const out: Array<{ date: string; quantity: number }> = []
      const days = Math.max(1, dateTo.startOf('day').diff(dateFrom.startOf('day'), 'day') + 1)
      for (let i = 0; i < days; i++) {
        const cursor = dateTo.subtract(i, 'day').endOf('day')
        let q = product.quantity
        for (const log of logs) {
          if (dayjs(log.createdAt).isAfter(cursor)) {
            q -= log.delta
          } else {
            break
          }
        }
        out.unshift({ date: cursor.format('YYYY-MM-DD'), quantity: q })
      }
      return out
    }),

  report: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.product.findMany({
      include: {
        category: { select: { name: true } },
        supplier: { select: { name: true } },
      },
      orderBy: { id: 'asc' },
    })
    return rows.map((p) => ({
      code: p.code,
      name: p.name,
      categoryName: p.category.name,
      quantity: p.quantity,
      unit: p.unit,
      costPrice: p.costPrice,
      stockValue: round2(p.quantity * p.costPrice),
      sellPrice: p.sellPrice,
      supplierName: p.supplier.name,
      minStock: p.minStock,
      maxStock: p.maxStock,
    }))
  }),
})
