/**
 * @xnet/hub - Crawl coordinator routes.
 */

import type { Context, MiddlewareHandler } from 'hono'
import type { AuthContext } from '../auth/ucan'
import type { CrawlCoordinator } from '../services/crawl'
import { Hono } from 'hono'

export type CrawlRoutesOptions = {
  coordinator: CrawlCoordinator
  requireAuth?: MiddlewareHandler
  userAgent: string
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object')

const toStringArray = (value: unknown): string[] | null => {
  if (!Array.isArray(value)) return null
  const filtered = value.filter((item): item is string => typeof item === 'string')
  return filtered.length === value.length ? filtered : null
}

export const createCrawlRoutes = (options: CrawlRoutesOptions): Hono => {
  const app = new Hono()
  const requireAuth = options.requireAuth

  const register = async (c: Context) => {
    const payload = await c.req.json()
    if (!isRecord(payload)) {
      return c.json({ error: 'Invalid payload' }, 400)
    }
    if (typeof payload.did !== 'string') {
      return c.json({ error: 'Missing did' }, 400)
    }

    const auth = c.get('auth') as AuthContext | undefined
    if (auth && auth.did !== payload.did) {
      return c.json({ error: 'Unauthorized' }, 403)
    }

    const languages = toStringArray(payload.languages) ?? []
    const domains = toStringArray(payload.domains) ?? undefined
    const type =
      payload.type === 'desktop' || payload.type === 'server' || payload.type === 'browser'
        ? payload.type
        : 'browser'
    const capacity = typeof payload.capacity === 'number' ? payload.capacity : 5

    await options.coordinator.registerCrawler({
      did: payload.did,
      type,
      capacity,
      languages,
      domains,
      reputation: 50,
      totalCrawled: 0,
      registeredAt: Date.now()
    })

    return c.json({ registered: true })
  }

  if (requireAuth) {
    app.post('/register', requireAuth, register)
  } else {
    app.post('/register', register)
  }

  app.get('/next', async (c) => {
    const auth = c.get('auth') as AuthContext | undefined
    const crawlerDid = auth?.did ?? c.req.query('did')
    if (!crawlerDid) {
      return c.json({ error: 'Missing crawler DID' }, 400)
    }

    const limit = Number(c.req.query('limit') ?? 5)
    const tasks = await options.coordinator.getNextTasks(
      crawlerDid,
      Number.isFinite(limit) ? Math.max(limit, 1) : 5
    )
    return c.json({ tasks })
  })

  const resultsHandler = async (c: Context) => {
    const auth = c.get('auth') as AuthContext | undefined
    if (auth && !auth.can('crawl/write', '*')) {
      return c.json({ error: 'Unauthorized' }, 403)
    }

    const payload = await c.req.json()
    if (!Array.isArray(payload)) {
      return c.json({ error: 'Invalid results payload' }, 400)
    }
    const results = payload.filter((entry) => isRecord(entry))
    const summary = await options.coordinator.submitResults(
      results as Parameters<typeof options.coordinator.submitResults>[0]
    )
    return c.json(summary)
  }

  if (requireAuth) {
    app.post('/results', requireAuth, resultsHandler)
  } else {
    app.post('/results', resultsHandler)
  }

  const seedHandler = async (c: Context) => {
    const auth = c.get('auth') as AuthContext | undefined
    if (auth && !auth.can('hub/admin', '*')) {
      return c.json({ error: 'Unauthorized' }, 403)
    }
    const payload = await c.req.json()
    const urls = Array.isArray(payload) ? payload : payload?.urls
    const list = toStringArray(urls)
    if (!list) {
      return c.json({ error: 'Invalid URL list' }, 400)
    }
    await options.coordinator.seedUrls(list)
    return c.json({ seeded: list.length })
  }

  if (requireAuth) {
    app.post('/seed', requireAuth, seedHandler)
  } else {
    app.post('/seed', seedHandler)
  }

  app.get('/stats', async (c) => {
    const stats = await options.coordinator.getStats()
    return c.json(stats)
  })

  app.get('/agent', (c) => {
    return c.json({
      userAgent: options.userAgent,
      info: 'xNet distributed crawler'
    })
  })

  return app
}
