import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, publicProcedure } from '../trpc'

export const createInput = z
  .object({
    code: z.string().regex(/^[A-Za-z0-9-]{3,20}$/),
    name: z.string().trim().min(1).max(100),
    categoryId: z.number().int().positive(),
    description: z.string().max(1000).optional(),
    costPrice: z
      .number()
      .finite()
      .positive()
      .refine((n) => Math.round(n * 100) === n * 100, 'max 2 decimals'),
    sellPrice: z
      .number()
      .finite()
      .positive()
      .refine((n) => Math.round(n * 100) === n * 100, 'max 2 decimals'),
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

export type CreateInput = z.infer<typeof createInput>

export const productsRouter = router({
  create: publicProcedure.input(createInput).mutation(async ({ ctx, input }) => {
    const cat = await ctx.db.category.findUnique({ where: { id: input.categoryId } })
    if (!cat) throw new TRPCError({ code: 'NOT_FOUND', message: 'CATEGORY_NOT_FOUND' })

    const sup = await ctx.db.supplier.findUnique({ where: { id: input.supplierId } })
    if (!sup) throw new TRPCError({ code: 'NOT_FOUND', message: 'SUPPLIER_NOT_FOUND' })

    const dup = await ctx.db.product.findUnique({ where: { code: input.code } })
    if (dup) throw new TRPCError({ code: 'CONFLICT', message: 'CODE_EXISTS' })

    return ctx.db.product.create({ data: input })
  }),

  byId: publicProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(({ ctx, input }) =>
      ctx.db.product.findUniqueOrThrow({ where: { id: input.id } }),
    ),

  byCode: publicProcedure
    .input(z.object({ code: z.string() }))
    .query(({ ctx, input }) =>
      ctx.db.product.findUnique({ where: { code: input.code } }),
    ),
})
