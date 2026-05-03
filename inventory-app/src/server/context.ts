import type { NextRequest } from 'next/server'
import { db } from './db'
import { verifyToken, COOKIE_NAME } from '@/lib/auth'

export type Context = {
  db: typeof db
  user: { id: number; username: string } | null
  // Cookies: a Set-Cookie list emitted by mutations (login/logout). The fetch
  // adapter's responseMeta hook flushes these to the HTTP response.
  resCookies: string[]
}

export async function createContext(req: NextRequest): Promise<Context> {
  const token = req.cookies.get(COOKIE_NAME)?.value
  let user: Context['user'] = null
  if (token) {
    try {
      const payload = verifyToken(token)
      user = { id: payload.id, username: payload.username }
    } catch {
      user = null
    }
  }
  return { db, user, resCookies: [] }
}

export type CreateContextOptions = { req: NextRequest }
