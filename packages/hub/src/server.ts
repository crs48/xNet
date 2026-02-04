/**
 * @xnet/hub - Hono + WebSocket server implementation.
 */

import type { IncomingMessage } from 'http'
import type { RawData, WebSocket } from 'ws'
import type { AuthSession } from './auth/ucan'
import type { HubConfig, HubInstance } from './types'
import type { SerializedNodeChange } from './storage/interface'
import type { MiddlewareHandler } from 'hono'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { WebSocketServer } from 'ws'
import { randomUUID } from 'node:crypto'
import { DatabaseSchema, PageSchema, TaskSchema } from '@xnet/data'
import { hasHubCapability } from './auth/capabilities'
import { authenticateConnection, authenticateHttpRequest, removeSession, toAuthContext } from './auth/ucan'
import { Metrics, HUB_METRICS } from './middleware/metrics'
import { RateLimiter } from './middleware/rate-limit'
import { NodePool } from './pool/node-pool'
import { createBackupRoutes } from './routes/backup'
import { createFileRoutes } from './routes/files'
import { createSchemaRoutes } from './routes/schemas'
import { BackupService } from './services/backup'
import { FileService } from './services/files'
import { NodeRelayError, NodeRelayService } from './services/node-relay'
import { QueryService } from './services/query'
import { RelayService } from './services/relay'
import { SchemaRegistryService } from './services/schemas'
import { createSignalingService } from './services/signaling'
import { createStorage } from './storage'

const getMessageSize = (data: RawData): number => {
  if (typeof data === 'string') {
    return Buffer.byteLength(data)
  }
  if (Array.isArray(data)) {
    return data.reduce((total, chunk) => total + chunk.length, 0)
  }
  if (data instanceof ArrayBuffer) {
    return data.byteLength
  }
  return data.length
}

const dataToString = (data: RawData): string => {
  if (typeof data === 'string') return data
  if (Array.isArray(data)) return Buffer.concat(data).toString()
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString()
  return data.toString()
}

const safeParseJson = (payload: string): unknown | null => {
  try {
    return JSON.parse(payload) as unknown
  } catch {
    return null
  }
}

const parseTopics = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []

const isSubscribeMessage = (value: unknown): value is { type: 'subscribe'; topics?: unknown } => {
  if (!value || typeof value !== 'object') return false
  const candidate = value as { type?: unknown }
  return candidate.type === 'subscribe'
}

const isUnsubscribeMessage = (value: unknown): value is { type: 'unsubscribe'; topics?: unknown } => {
  if (!value || typeof value !== 'object') return false
  const candidate = value as { type?: unknown }
  return candidate.type === 'unsubscribe'
}

const isPublishMessage = (
  value: unknown
): value is { type: 'publish'; topic?: unknown; data?: unknown } => {
  if (!value || typeof value !== 'object') return false
  const candidate = value as { type?: unknown }
  return candidate.type === 'publish'
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object')

const isQueryRequest = (value: unknown): value is { type: 'query-request'; id: string; query: string } => {
  if (!isRecord(value)) return false
  return value.type === 'query-request' && typeof value.id === 'string' && typeof value.query === 'string'
}

const isIndexUpdate = (
  value: unknown
): value is { type: 'index-update'; docId: string; meta: { schemaIri: string; title: string } } => {
  if (!isRecord(value)) return false
  if (value.type !== 'index-update') return false
  if (typeof value.docId !== 'string') return false
  if (!isRecord(value.meta)) return false
  return typeof value.meta.schemaIri === 'string' && typeof value.meta.title === 'string'
}

const isIndexRemove = (value: unknown): value is { type: 'index-remove'; docId: string } => {
  if (!isRecord(value)) return false
  return value.type === 'index-remove' && typeof value.docId === 'string'
}

const isNodeSyncRequest = (
  value: unknown
): value is { type: 'node-sync-request'; room: string; sinceLamport: number } => {
  if (!isRecord(value)) return false
  return (
    value.type === 'node-sync-request' &&
    typeof value.room === 'string' &&
    typeof value.sinceLamport === 'number'
  )
}

const isNodeChangePayload = (
  value: unknown
): value is { type: 'node-change'; room: string; change: SerializedNodeChange } => {
  if (!isRecord(value)) return false
  if (value.type !== 'node-change' || typeof value.room !== 'string') return false
  if (!isRecord(value.change)) return false
  const change = value.change as Record<string, unknown>
  return typeof change.hash === 'string' && typeof change.signatureB64 === 'string'
}

const topicToResource = (topic: string): string =>
  topic.startsWith('xnet-doc-') ? topic.slice('xnet-doc-'.length) : topic

const checkRoomAuth = (session: AuthSession, topics: string[]): boolean =>
  topics.every((topic) => {
    const resource = topicToResource(topic)
    return (
      hasHubCapability(session.capabilities, 'hub/relay', resource) ||
      hasHubCapability(session.capabilities, 'hub/signal', resource)
    )
  })

export const createServer = (config: HubConfig): HubInstance => {
  const app = new Hono()
  const signaling = createSignalingService()
  const storage = createStorage(config.storage, config.dataDir)
  const pool = new NodePool(storage)
  const relay = new RelayService(pool, { requireSignedUpdates: config.auth })
  const backup = new BackupService(storage, {
    maxQuotaBytes: config.defaultQuota,
    maxBlobSize: config.maxBlobSize
  })
  const files = new FileService(storage)
  const query = new QueryService(storage)
  const nodeRelay = new NodeRelayService(storage)
  const schemas = new SchemaRegistryService(storage)
  const metrics = new Metrics()
  const rateLimiter = new RateLimiter({
    perConnectionRate: config.rateLimit?.perConnectionRate ?? 100,
    maxConnections: config.rateLimit?.maxConnections ?? config.maxConnections,
    maxMessageSize: config.rateLimit?.maxMessageSize ?? config.maxMessageSize,
    windowMs: config.rateLimit?.windowMs ?? 1000
  })

  const startTime = Date.now()
  const socketTopics = new Map<WebSocket, Set<string>>()
  const socketPeers = new Map<WebSocket, Set<string>>()

  app.get('/health', (c) => {
    const poolStats = pool.getStats()
    const rlStats = rateLimiter.getStats()
    return c.json({
      status: 'ok',
      uptime: Math.floor((Date.now() - startTime) / 1000),
      timestamp: Date.now(),
      rooms: signaling.getRoomCount(),
      docs: poolStats,
      connections: { active: rlStats.totalConnections, max: rlStats.maxConnections },
      memory: {
        rss: process.memoryUsage().rss,
        heapUsed: process.memoryUsage().heapUsed
      },
      version: '0.0.1'
    })
  })

  app.get('/metrics', () => {
    const poolStats = pool.getStats()
    const rlStats = rateLimiter.getStats()
    metrics.gauge(HUB_METRICS.SYNC_DOCS_HOT, poolStats.hot)
    metrics.gauge(HUB_METRICS.SYNC_DOCS_WARM, poolStats.warm)
    metrics.gauge(HUB_METRICS.WS_CONNECTIONS_ACTIVE, rlStats.totalConnections)
    return new Response(metrics.render(), {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    })
  })

  const requireAuth: MiddlewareHandler = async (c, next) => {
    const authHeader = c.req.header('authorization') ?? c.req.header('Authorization')
    const auth = authenticateHttpRequest(authHeader, config)
    if (!auth) {
      return c.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, 401)
    }
    c.set('auth', auth)
    await next()
  }

  app.use('/backup/*', requireAuth)
  app.use('/backup', requireAuth)
  app.route('/backup', createBackupRoutes(backup))

  app.use('/files/*', requireAuth)
  app.use('/files', requireAuth)
  app.route('/files', createFileRoutes(files))

  app.route('/schemas', createSchemaRoutes(schemas, { requireAuth }))

  let httpServer: ReturnType<typeof serve> | null = null
  let wss: WebSocketServer | null = null

  const start = async (): Promise<void> => {
    if (httpServer) return
    await schemas.seedBuiltInSchemas([
      {
        definition: PageSchema.schema,
        description: 'Built-in rich text page schema',
        authorDid: 'did:key:xnet'
      },
      {
        definition: TaskSchema.schema,
        description: 'Built-in task schema',
        authorDid: 'did:key:xnet'
      },
      {
        definition: DatabaseSchema.schema,
        description: 'Built-in database container schema',
        authorDid: 'did:key:xnet'
      }
    ])
    httpServer = serve({ fetch: app.fetch, port: config.port })

    await new Promise<void>((resolve) => {
      if (httpServer?.listening) {
        resolve()
        return
      }
      httpServer?.once('listening', () => resolve())
    })

    wss = new WebSocketServer({ server: httpServer })

    wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
      void (async () => {
        if (!rateLimiter.canAcceptConnection()) {
          ws.close(1013, 'Server at capacity')
          metrics.increment(HUB_METRICS.RATE_LIMIT_REJECTIONS)
          return
        }

        const session = await authenticateConnection(ws, req, config)
        if (!session) return
        const authContext = toAuthContext(session)

        const connId = randomUUID()
        rateLimiter.addConnection(connId)
        metrics.increment(HUB_METRICS.WS_CONNECTIONS_TOTAL)
        let closed = false

        const finalize = (): void => {
          if (closed) return
          closed = true
          rateLimiter.removeConnection(connId)
          removeSession(ws)
          const topics = socketTopics.get(ws)
          if (topics) {
            for (const topic of topics) {
              relay.handleRoomLeave(topic)
            }
          }
          socketTopics.delete(ws)
          const peers = socketPeers.get(ws)
          if (peers) {
            for (const peerId of peers) {
              relay.handlePeerDisconnect(peerId)
            }
          }
          socketPeers.delete(ws)
          signaling.handleDisconnect(ws)
        }

        ws.on('message', (data: RawData) => {
          void (async () => {
            const check = rateLimiter.checkMessage(connId, getMessageSize(data))
            if (!check.allowed) {
              metrics.increment(HUB_METRICS.RATE_LIMIT_REJECTIONS)
              metrics.increment(HUB_METRICS.WS_MESSAGES_REJECTED)
              if (check.reason?.includes('will be closed')) {
                ws.close(1008, 'Rate limit exceeded')
                return
              }
              ws.send(JSON.stringify({ type: 'error', message: check.reason }))
              return
            }

            const payload = safeParseJson(dataToString(data))
            if (!payload) return
            metrics.increment(HUB_METRICS.WS_MESSAGES_RECEIVED)

            if (isQueryRequest(payload)) {
              if (!authContext.can('query/read', '*')) {
                ws.send(
                  JSON.stringify({ type: 'query-error', id: payload.id, error: 'Unauthorized' })
                )
                return
              }
              const response = await query.handleQuery(payload)
              metrics.increment(HUB_METRICS.QUERY_REQUESTS_TOTAL)
              metrics.observe(HUB_METRICS.QUERY_DURATION_MS, response.took)
              ws.send(JSON.stringify(response))
              metrics.increment(HUB_METRICS.WS_MESSAGES_SENT)
              return
            }

            if (isIndexUpdate(payload)) {
              if (!authContext.can('index/write', payload.docId)) {
                ws.send(
                  JSON.stringify({
                    type: 'index-error',
                    docId: payload.docId,
                    error: 'Unauthorized'
                  })
                )
                return
              }
              const ack = await query.handleIndexUpdate(payload.docId, authContext.did, payload)
              ws.send(JSON.stringify(ack))
              metrics.increment(HUB_METRICS.WS_MESSAGES_SENT)
              return
            }

            if (isIndexRemove(payload)) {
              if (!authContext.can('index/write', payload.docId)) {
                ws.send(
                  JSON.stringify({
                    type: 'index-error',
                    docId: payload.docId,
                    error: 'Unauthorized'
                  })
                )
                return
              }
              await query.removeFromIndex(payload.docId)
              ws.send(JSON.stringify({ type: 'index-ack', docId: payload.docId, indexed: false }))
              metrics.increment(HUB_METRICS.WS_MESSAGES_SENT)
              return
            }

            if (isNodeSyncRequest(payload)) {
              try {
                const response = await nodeRelay.handleSyncRequest(payload, authContext)
                ws.send(JSON.stringify(response))
                metrics.increment(HUB_METRICS.WS_MESSAGES_SENT)
              } catch (err) {
                if (err instanceof NodeRelayError) {
                  ws.send(JSON.stringify({ type: 'node-error', code: err.code, error: err.message }))
                  metrics.increment(HUB_METRICS.WS_MESSAGES_SENT)
                  return
                }
                throw err
              }
              return
            }

            if (isPublishMessage(payload) && isNodeSyncRequest(payload.data)) {
              try {
                const response = await nodeRelay.handleSyncRequest(payload.data, authContext)
                ws.send(JSON.stringify(response))
                metrics.increment(HUB_METRICS.WS_MESSAGES_SENT)
              } catch (err) {
                if (err instanceof NodeRelayError) {
                  ws.send(JSON.stringify({ type: 'node-error', code: err.code, error: err.message }))
                  metrics.increment(HUB_METRICS.WS_MESSAGES_SENT)
                  return
                }
                throw err
              }
              return
            }

            if (config.auth && isSubscribeMessage(payload)) {
              const topics = parseTopics(payload.topics)
              if (!checkRoomAuth(session, topics)) {
                ws.close(4403, 'Insufficient capabilities for room')
                return
              }
            }

            if (isPublishMessage(payload) && isNodeChangePayload(payload.data)) {
              try {
                const isNew = await nodeRelay.handleNodeChange(payload.data, authContext)
                if (!isNew) return
              } catch (err) {
                if (err instanceof NodeRelayError) {
                  ws.send(JSON.stringify({ type: 'node-error', code: err.code, error: err.message }))
                  metrics.increment(HUB_METRICS.WS_MESSAGES_SENT)
                  return
                }
                throw err
              }
            }

            signaling.handleMessage(ws, payload)

            if (isSubscribeMessage(payload)) {
              const topics = parseTopics(payload.topics)
              if (topics.length > 0) {
                const existing = socketTopics.get(ws) ?? new Set<string>()
                for (const topic of topics) {
                  if (!existing.has(topic)) {
                    existing.add(topic)
                    void relay.handleRoomJoin(topic, signaling.publishFromHub)
                  }
                }
                socketTopics.set(ws, existing)
              }
            }

            if (isUnsubscribeMessage(payload)) {
              const topics = parseTopics(payload.topics)
              const existing = socketTopics.get(ws)
              if (existing && topics.length > 0) {
                for (const topic of topics) {
                  if (existing.delete(topic)) {
                    relay.handleRoomLeave(topic)
                  }
                }
                if (existing.size === 0) {
                  socketTopics.delete(ws)
                }
              }
            }

            if (isPublishMessage(payload) && typeof payload.topic === 'string') {
              const peerId = (() => {
                if (!payload.data || typeof payload.data !== 'object') return null
                const data = payload.data as { from?: unknown }
                return typeof data.from === 'string' ? data.from : null
              })()
              if (peerId) {
                const peers = socketPeers.get(ws) ?? new Set<string>()
                peers.add(peerId)
                socketPeers.set(ws, peers)
              }

              void relay.handleSyncMessage(payload.topic, payload.data, signaling.publishFromHub)
            }
          })()
        })

        ws.on('close', finalize)
        ws.on('error', finalize)
      })()
    })
  }

  const stop = async (): Promise<void> => {
    if (wss) {
      for (const client of wss.clients) {
        client.close(1001, 'Server shutting down')
      }
      await new Promise<void>((resolve) => wss?.close(() => resolve()))
      wss = null
    }

    if (httpServer) {
      await new Promise<void>((resolve) => httpServer?.close(() => resolve()))
      httpServer = null
    }

    await pool.persistAll()
    pool.destroy()
    await storage.close()

    signaling.destroy()
    connectionCount = 0
  }

  return {
    port: config.port,
    config,
    start,
    stop
  }
}
