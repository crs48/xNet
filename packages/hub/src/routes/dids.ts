/**
 * @xnet/hub - Peer discovery routes.
 */

import type { AuthContext } from '../auth/ucan'
import type { DiscoveryService } from '../services/discovery'
import type { Context, MiddlewareHandler } from 'hono'
import { Hono } from 'hono'
import { DiscoveryError } from '../services/discovery'
import { isRecord } from '../utils/validation'

export type DiscoveryRoutesOptions = {
  requireAuth?: MiddlewareHandler
}

export const createDiscoveryRoutes = (
  discovery: DiscoveryService,
  options: DiscoveryRoutesOptions = {}
): Hono => {
  const app = new Hono()
  const requireAuth = options.requireAuth

  const register = async (c: Context) => {
    const auth = c.get('auth') as AuthContext | undefined
    if (!auth) {
      return c.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, 401)
    }

    const body = await c.req.json()
    if (!isRecord(body)) {
      return c.json({ error: 'Invalid discovery payload', code: 'INVALID_INPUT' }, 400)
    }

    try {
      const record = await discovery.register(body as any, auth.did)
      return c.json(record)
    } catch (err) {
      if (err instanceof DiscoveryError) {
        switch (err.code) {
          case 'UNAUTHORIZED':
            return c.json({ error: err.message, code: err.code }, 403)
          case 'INVALID_INPUT':
            return c.json({ error: err.message, code: err.code }, 400)
        }
      }
      throw err
    }
  }

  if (requireAuth) {
    app.post('/register', requireAuth, register)
  } else {
    app.post('/register', register)
  }

  app.get('/:did{did:key:.+}', async (c) => {
    const did = c.req.param('did')
    const record = await discovery.resolve(did)

    if (!record) {
      return c.json({ error: 'Peer not found', code: 'NOT_FOUND' }, 404)
    }

    return c.json(record)
  })

  app.get('/', async (c) => {
    const rawLimit = Number(c.req.query('limit') ?? 50)
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 500) : 50
    const [peers, stats] = await Promise.all([discovery.listRecent(limit), discovery.getStats()])
    return c.json({ peers, stats })
  })

  return app
}
