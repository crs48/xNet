/**
 * @xnet/hub - Shard registry routes.
 */

import type { AuthContext } from '../auth/ucan'
import type { ShardRegistry } from '../services/index-shards'
import type { ShardIngestRouter } from '../services/shard-ingest'
import type { ShardRebalancer } from '../services/shard-rebalancer'
import type { ShardQueryRouter } from '../services/shard-router'
import type { Context, MiddlewareHandler } from 'hono'
import { Hono } from 'hono'
import { isRecord, toStringArray } from '../utils/validation'

export type ShardRoutesOptions = {
  registry: ShardRegistry
  ingest: ShardIngestRouter
  router: ShardQueryRouter
  rebalancer?: ShardRebalancer
  requireAuth?: MiddlewareHandler
}

export const createShardRoutes = (options: ShardRoutesOptions): Hono => {
  const app = new Hono()
  const requireAuth = options.requireAuth

  app.get('/assignments', (c) => {
    const assignments = options.registry.getAssignments().map((assignment) => ({
      shardId: assignment.shardId,
      rangeStart: assignment.rangeStart,
      rangeEnd: assignment.rangeEnd,
      primaryUrl: assignment.primaryHub.url,
      primaryDid: assignment.primaryHub.hubDid,
      replicaUrl: assignment.replicaHub?.url ?? null,
      replicaDid: assignment.replicaHub?.hubDid ?? null,
      docCount: assignment.docCount,
      updatedAt: assignment.updatedAt
    }))
    return c.json(assignments)
  })

  const ingestHandler = async (c: Context) => {
    const auth = c.get('auth') as AuthContext | undefined
    if (!auth || !auth.can('index/write', '*')) {
      return c.json({ error: 'Unauthorized' }, 403)
    }

    const payload = await c.req.json()
    if (!isRecord(payload)) {
      return c.json({ error: 'Invalid payload' }, 400)
    }
    if (typeof payload.shardId !== 'number') {
      return c.json({ error: 'Missing shardId' }, 400)
    }
    const terms = toStringArray(payload.terms)
    if (!terms) {
      return c.json({ error: 'Missing terms' }, 400)
    }
    if (!isRecord(payload.termFreqs)) {
      return c.json({ error: 'Missing termFreqs' }, 400)
    }
    if (!isRecord(payload.doc)) {
      return c.json({ error: 'Missing doc' }, 400)
    }
    const doc = payload.doc as Record<string, unknown>
    if (typeof doc.cid !== 'string' || typeof doc.title !== 'string') {
      return c.json({ error: 'Invalid doc' }, 400)
    }
    const docLen = typeof payload.docLen === 'number' ? payload.docLen : terms.length

    await options.ingest.ingestShard({
      shardId: payload.shardId,
      doc: {
        cid: doc.cid,
        url: typeof doc.url === 'string' ? doc.url : undefined,
        title: doc.title,
        body: typeof doc.body === 'string' ? doc.body : undefined,
        schema: typeof doc.schema === 'string' ? doc.schema : undefined,
        author: typeof doc.author === 'string' ? doc.author : undefined,
        language: typeof doc.language === 'string' ? doc.language : undefined,
        indexedAt: typeof doc.indexedAt === 'number' ? doc.indexedAt : Date.now()
      },
      terms,
      termFreqs: Object.fromEntries(
        Object.entries(payload.termFreqs).filter((entry) => typeof entry[1] === 'number')
      ) as Record<string, number>,
      docLen
    })

    return c.json({ ingested: true })
  }

  if (requireAuth) {
    app.post('/ingest', requireAuth, ingestHandler)
  } else {
    app.post('/ingest', ingestHandler)
  }

  app.post('/query', async (c) => {
    const payload = await c.req.json()
    if (!isRecord(payload) || typeof payload.shardId !== 'number') {
      return c.json({ error: 'Invalid payload' }, 400)
    }
    const terms = toStringArray(payload.terms)
    if (!terms) {
      return c.json({ error: 'Missing terms' }, 400)
    }
    const limit = typeof payload.limit === 'number' ? payload.limit : 20
    const results = await options.router.queryShard(payload.shardId, terms, limit)
    return c.json({ results })
  })

  app.post('/search', async (c) => {
    const payload = await c.req.json()
    if (!isRecord(payload) || typeof payload.queryId !== 'string') {
      return c.json({ error: 'Invalid payload' }, 400)
    }
    const text = typeof payload.text === 'string' ? payload.text : ''
    const limit = typeof payload.limit === 'number' ? payload.limit : 20
    const response = await options.router.search({ queryId: payload.queryId, text, limit })
    return c.json(response)
  })

  const register = async (c: Context) => {
    if (!options.rebalancer) {
      return c.json({ error: 'Shard registry not enabled' }, 404)
    }
    const auth = c.get('auth') as AuthContext | undefined
    if (!auth || !auth.can('hub/admin', '*')) {
      return c.json({ error: 'Unauthorized' }, 403)
    }

    const payload = await c.req.json()
    if (!isRecord(payload)) {
      return c.json({ error: 'Invalid payload' }, 400)
    }
    if (typeof payload.hubDid !== 'string' || typeof payload.url !== 'string') {
      return c.json({ error: 'Missing hubDid or url' }, 400)
    }
    const capacity = typeof payload.capacity === 'number' ? payload.capacity : 1
    const assignments = await options.rebalancer.registerHost({
      hubDid: payload.hubDid,
      url: payload.url,
      capacity
    })
    return c.json({ registered: true, assignments })
  }

  if (requireAuth) {
    app.post('/register', requireAuth, register)
  } else {
    app.post('/register', register)
  }

  return app
}
