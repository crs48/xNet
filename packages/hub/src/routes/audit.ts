/**
 * @xnetjs/hub - Agent audit trail routes (exploration 0337).
 *
 * `GET /audit/authors/:did/changes?since=<lamport>&limit=<n>` pages an
 * author's signed change history — the raw substrate of the agent audit
 * console. Self-reads (the token's DID asking about itself) are always
 * allowed; reading another author requires the `audit/read` capability.
 */

import type { AuthContext } from '../auth/ucan'
import type { HubStorage } from '../storage/interface'
import type { Context, MiddlewareHandler } from 'hono'
import { Hono } from 'hono'

export type AuditRoutesOptions = {
  requireAuth: MiddlewareHandler
}

const parsePositiveInt = (value: string | undefined, fallback: number): number => {
  if (!value) return fallback
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}

export const createAuditRoutes = (storage: HubStorage, options: AuditRoutesOptions): Hono => {
  const app = new Hono()

  const listAuthorChanges = async (c: Context) => {
    const auth = c.get('auth') as AuthContext | undefined
    if (!auth) {
      return c.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, 401)
    }

    const did = c.req.param('did')
    if (!did.startsWith('did:')) {
      return c.json({ error: 'Invalid author DID', code: 'INVALID_INPUT' }, 400)
    }

    if (auth.did !== did && !auth.can('audit/read', did)) {
      return c.json({ error: 'audit/read capability required', code: 'FORBIDDEN' }, 403)
    }

    const since = parsePositiveInt(c.req.query('since'), 0)
    const limit = parsePositiveInt(c.req.query('limit'), 200)
    const changes = await storage.getNodeChangesByAuthor(did, since, limit)
    const nextCursor =
      changes.length > 0 ? changes[changes.length - 1].lamportTime : since

    return c.json({
      author: did,
      since,
      changes,
      // Page by passing this back as ?since=; equal to `since` when drained.
      nextCursor,
      hasMore: changes.length >= Math.min(Math.max(limit, 1), 1000)
    })
  }

  app.get('/authors/:did/changes', options.requireAuth, listAuthorChanges)

  return app
}
