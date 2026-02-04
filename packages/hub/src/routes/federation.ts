/**
 * @xnet/hub - Federation routes.
 */

import type { Context, MiddlewareHandler } from 'hono'
import type { AuthContext } from '../auth/ucan'
import type { FederationPeer, FederationService } from '../services/federation'
import { Hono } from 'hono'

export type FederationRoutesOptions = {
  requireAuth?: MiddlewareHandler
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object')

const toStringArray = (value: unknown): string[] | null => {
  if (!Array.isArray(value)) return null
  const filtered = value.filter((item): item is string => typeof item === 'string')
  return filtered.length === value.length ? filtered : null
}

const parsePeerPayload = (payload: unknown): FederationPeer | null => {
  if (!isRecord(payload)) return null
  if (typeof payload.url !== 'string' || typeof payload.hubDid !== 'string') return null

  const schemas = 'schemas' in payload ? payload.schemas : '*'
  const parsedSchemas =
    schemas === '*' ? '*' : toStringArray(schemas) ?? null
  if (parsedSchemas === null) return null

  const trustLevel = payload.trustLevel === 'full' ? 'full' : 'metadata'
  const maxLatencyMs =
    typeof payload.maxLatencyMs === 'number' ? payload.maxLatencyMs : 2000
  const rateLimit = typeof payload.rateLimit === 'number' ? payload.rateLimit : 60

  return {
    url: payload.url,
    hubDid: payload.hubDid,
    schemas: parsedSchemas,
    trustLevel,
    maxLatencyMs,
    rateLimit,
    healthy: true,
    lastSuccessAt: null
  }
}

export const createFederationRoutes = (
  federation: FederationService,
  options: FederationRoutesOptions = {}
): Hono => {
  const app = new Hono()
  const requireAuth = options.requireAuth

  app.post('/query', async (c) => {
    if (!federation.config.enabled) {
      return c.json({ error: 'Federation disabled' }, 404)
    }
    try {
      const request = await c.req.json()
      const response = await federation.handleIncomingQuery(request)
      return c.json(response)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      if (message === 'Rate limited') {
        return c.json({ error: message }, 429)
      }
      if (message === 'Invalid federation UCAN') {
        return c.json({ error: message }, 403)
      }
      return c.json({ error: message }, 500)
    }
  })

  app.get('/status', (c) =>
    c.json({
      federation: federation.config.enabled,
      hubDid: federation.config.hubDid,
      exposedSchemas: federation.config.expose.schemas,
      peerCount: federation.config.peers.filter((peer) => peer.healthy).length,
      rateLimit: federation.config.expose.rateLimit
    })
  )

  const register = async (c: Context) => {
    if (!federation.config.enabled) {
      return c.json({ error: 'Federation disabled' }, 404)
    }

    const payload = await c.req.json()
    const peer = parsePeerPayload(payload)
    if (!peer) {
      return c.json({ error: 'Invalid peer payload' }, 400)
    }

    if (!federation.config.openRegistration) {
      const auth = c.get('auth') as AuthContext | undefined
      if (!auth || !auth.can('federation/register', '*')) {
        return c.json({ error: 'Unauthorized' }, 403)
      }
    }

    const auth = c.get('auth') as AuthContext | undefined
    const registered = await federation.registerPeer(peer, auth?.did ?? null)
    return c.json({ registered: true, peer: { url: registered.url, hubDid: registered.hubDid } })
  }

  const needsAuth = Boolean(requireAuth && !federation.config.openRegistration)
  if (needsAuth && requireAuth) {
    app.post('/register', requireAuth, register)
  } else {
    app.post('/register', register)
  }

  return app
}
