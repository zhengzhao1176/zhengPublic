import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import { makeTestDb, resetAll, seedAdmin } from '@tests/helpers/db'
import { makeCaller, makeAuthedCaller, makeContext } from '@tests/helpers/caller'
import { createCallerFactory } from '@/server/trpc'
import { appRouter } from '@/server/routers/_app'

let db: PrismaClient

beforeAll(() => {
  db = makeTestDb()
})

beforeEach(async () => {
  await resetAll(db)
  await seedAdmin(db)
})

afterAll(async () => {
  await db.$disconnect()
})

describe('auth.login', () => {
  it('rejects empty username', async () => {
    const caller = makeCaller(db as unknown as PrismaClient)
    await expect(caller.auth.login({ username: '', password: 'admin123' })).rejects.toThrow()
  })

  it('rejects empty password', async () => {
    const caller = makeCaller(db as unknown as PrismaClient)
    await expect(caller.auth.login({ username: 'admin', password: '' })).rejects.toThrow()
  })

  it('throws INVALID_CREDENTIALS for non-existent user', async () => {
    const caller = makeCaller(db as unknown as PrismaClient)
    await expect(
      caller.auth.login({ username: 'nobody', password: 'admin123' }),
    ).rejects.toThrow(/INVALID_CREDENTIALS/)
  })

  it('throws INVALID_CREDENTIALS for wrong password', async () => {
    const caller = makeCaller(db as unknown as PrismaClient)
    await expect(
      caller.auth.login({ username: 'admin', password: 'wrong' }),
    ).rejects.toThrow(/INVALID_CREDENTIALS/)
  })

  it('logs in admin with correct credentials and writes Set-Cookie', async () => {
    const ctx = makeContext(db as unknown as PrismaClient, null)
    const caller = createCallerFactory(appRouter)(ctx)
    const r = await caller.auth.login({ username: 'admin', password: 'admin123' })
    expect(r.username).toBe('admin')
    expect(ctx.resCookies.length).toBe(1)
    expect(ctx.resCookies[0]).toContain('inv_token=')
    expect(ctx.resCookies[0]).toContain('HttpOnly')
  })

  it('me returns null when not logged in, returns user when logged in', async () => {
    const guest = makeCaller(db as unknown as PrismaClient)
    expect(await guest.auth.me()).toBeNull()
    const authed = makeAuthedCaller(db as unknown as PrismaClient, 1, 'admin')
    expect(await authed.auth.me()).toEqual({ id: 1, username: 'admin' })
  })
})
