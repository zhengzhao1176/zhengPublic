import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import bcrypt from 'bcryptjs'
import { router, publicProcedure } from '../trpc'
import { signToken, COOKIE_NAME, COOKIE_MAX_AGE } from '@/lib/auth'

export const authRouter = router({
  login: publicProcedure
    .input(
      z.object({
        username: z.string().trim().min(1),
        password: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const username = input.username.trim()
      const user = await ctx.db.user.findUnique({ where: { username } })
      if (!user) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'INVALID_CREDENTIALS' })
      }
      const ok = await bcrypt.compare(input.password, user.passwordHash)
      if (!ok) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'INVALID_CREDENTIALS' })
      }
      const token = signToken({ id: user.id, username: user.username })
      ctx.resCookies.push(
        `${COOKIE_NAME}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${COOKIE_MAX_AGE}`,
      )
      return { id: user.id, username: user.username }
    }),

  logout: publicProcedure.mutation(async ({ ctx }) => {
    ctx.resCookies.push(`${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`)
    return { ok: true as const }
  }),

  me: publicProcedure.query(({ ctx }) => {
    return ctx.user ? { id: ctx.user.id, username: ctx.user.username } : null
  }),
})
