import { initTRPC } from '@trpc/server'
import type { PrismaClient } from '@prisma/client'

export type Context = {
  db: PrismaClient
  user: { id: number } | null
}

const t = initTRPC.context<Context>().create()

export const router = t.router
export const publicProcedure = t.procedure
export const createCallerFactory = t.createCallerFactory
