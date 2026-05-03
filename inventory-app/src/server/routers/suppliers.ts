import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, protectedProcedure } from '../trpc'

export const suppliersRouter = router({
  list: protectedProcedure
    .input(z.object({ keyword: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const where = input.keyword ? { name: { contains: input.keyword } } : {}
      return ctx.db.supplier.findMany({ where, orderBy: { id: 'asc' } })
    }),

  byId: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const row = await ctx.db.supplier.findUnique({ where: { id: input.id } })
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'SUPPLIER_NOT_FOUND' })
      return row
    }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().trim().min(1).max(100),
        contact: z.string().max(50).optional(),
        address: z.string().max(255).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const name = input.name.trim()
      const dup = await ctx.db.supplier.findUnique({ where: { name } })
      if (dup) throw new TRPCError({ code: 'CONFLICT', message: 'SUPPLIER_NAME_EXISTS' })
      return ctx.db.supplier.create({
        data: {
          name,
          ...(input.contact !== undefined ? { contact: input.contact } : {}),
          ...(input.address !== undefined ? { address: input.address } : {}),
        },
      })
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        name: z.string().trim().min(1).max(100).optional(),
        contact: z.string().max(50).nullable().optional(),
        address: z.string().max(255).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.supplier.findUnique({ where: { id: input.id } })
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'SUPPLIER_NOT_FOUND' })
      if (input.name !== undefined) {
        const newName = input.name.trim()
        if (newName !== row.name) {
          const conflict = await ctx.db.supplier.findUnique({ where: { name: newName } })
          if (conflict && conflict.id !== row.id) {
            throw new TRPCError({ code: 'CONFLICT', message: 'SUPPLIER_NAME_EXISTS' })
          }
        }
      }
      return ctx.db.supplier.update({
        where: { id: input.id },
        data: {
          ...(input.name !== undefined ? { name: input.name.trim() } : {}),
          ...(input.contact !== undefined ? { contact: input.contact } : {}),
          ...(input.address !== undefined ? { address: input.address } : {}),
        },
      })
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.supplier.findUnique({ where: { id: input.id } })
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'SUPPLIER_NOT_FOUND' })
      const usedByProduct = await ctx.db.product.count({ where: { supplierId: input.id } })
      const usedByPurchase = await ctx.db.purchaseOrder.count({
        where: { supplierId: input.id },
      })
      if (usedByProduct > 0 || usedByPurchase > 0) {
        throw new TRPCError({ code: 'CONFLICT', message: 'SUPPLIER_IN_USE' })
      }
      await ctx.db.supplier.delete({ where: { id: input.id } })
      return { ok: true as const }
    }),
})
