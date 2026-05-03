import type { PrismaClient } from '@prisma/client'
import { appRouter } from '@/server/routers/_app'
import { createCallerFactory } from '@/server/trpc'
import type { Context } from '@/server/context'

const callerFactory = createCallerFactory(appRouter)
export type AnyCaller = ReturnType<typeof callerFactory>

export function makeContext(db: PrismaClient, user: Context['user'] = null): Context {
  return { db: db as unknown as Context['db'], user, resCookies: [] }
}

export function makeCaller(db: PrismaClient, user: Context['user'] = null): AnyCaller {
  return callerFactory(makeContext(db, user))
}

export function makeAuthedCaller(
  db: PrismaClient,
  userId = 1,
  username = 'admin',
): AnyCaller {
  return makeCaller(db, { id: userId, username })
}

export function makeAuthedCallerWithCtx(
  db: PrismaClient,
  userId = 1,
  username = 'admin',
): { caller: AnyCaller; ctx: Context } {
  const ctx = makeContext(db, { id: userId, username })
  const caller = callerFactory(ctx)
  return { caller, ctx }
}
