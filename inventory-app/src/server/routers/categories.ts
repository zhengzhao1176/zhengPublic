import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, protectedProcedure } from '../trpc'

export const categoriesRouter = router({
  list: protectedProcedure
    .input(z.object({ keyword: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const where = input.keyword
        ? { name: { contains: input.keyword } }
        : {}
      return ctx.db.category.findMany({ where, orderBy: { id: 'asc' } })
    }),

  byId: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const row = await ctx.db.category.findUnique({ where: { id: input.id } })
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'CATEGORY_NOT_FOUND' })
      return row
    }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().trim().min(1).max(50),
        description: z.string().max(1000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const name = input.name.trim()
      const dup = await ctx.db.category.findUnique({ where: { name } })
      if (dup) throw new TRPCError({ code: 'CONFLICT', message: 'CATEGORY_NAME_EXISTS' })
      return ctx.db.category.create({
        data: {
          name,
          ...(input.description !== undefined ? { description: input.description } : {}),
        },
      })
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        name: z.string().trim().min(1).max(50).optional(),
        description: z.string().max(1000).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.category.findUnique({ where: { id: input.id } })
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'CATEGORY_NOT_FOUND' })
      if (input.name !== undefined) {
        const newName = input.name.trim()
        if (newName !== row.name) {
          const conflict = await ctx.db.category.findUnique({ where: { name: newName } })
          if (conflict && conflict.id !== row.id) {
            throw new TRPCError({ code: 'CONFLICT', message: 'CATEGORY_NAME_EXISTS' })
          }
        }
      }
      return ctx.db.category.update({
        where: { id: input.id },
        data: {
          ...(input.name !== undefined ? { name: input.name.trim() } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
        },
      })
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.category.findUnique({ where: { id: input.id } })
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'CATEGORY_NOT_FOUND' })
      const used = await ctx.db.product.count({ where: { categoryId: input.id } })
      if (used > 0) throw new TRPCError({ code: 'CONFLICT', message: 'CATEGORY_IN_USE' })
      await ctx.db.category.delete({ where: { id: input.id } })
      return { ok: true as const }
    }),
})
