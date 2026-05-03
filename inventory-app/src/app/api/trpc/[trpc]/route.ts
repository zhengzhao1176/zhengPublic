import { fetchRequestHandler } from '@trpc/server/adapters/fetch'
import { appRouter } from '@/server/routers/_app'
import { createContext } from '@/server/context'
import type { NextRequest } from 'next/server'

const handler = async (req: NextRequest) =>
  fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: () => createContext(req),
    responseMeta(opts) {
      const cookies = (opts.ctx as { resCookies?: string[] } | undefined)?.resCookies ?? []
      if (cookies.length === 0) return {}
      const headers = new Headers()
      for (const c of cookies) headers.append('set-cookie', c)
      return { headers }
    },
    onError({ error, path }) {
      if (process.env.NODE_ENV === 'development') {
        // eslint-disable-next-line no-console
        console.error(`tRPC error on ${path ?? '<unknown>'}:`, error.message)
      }
    },
  })

export { handler as GET, handler as POST }
