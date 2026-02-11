/**
 * @xnet/hub - Hono + WebSocket server implementation.
 */

import type { AuthSession } from './auth/ucan'
import type { SerializedNodeChange } from './storage/interface'
import type { HubConfig, HubInstance } from './types'
import type { MiddlewareHandler } from 'hono'
import type { IncomingMessage } from 'http'
import type { RawData, WebSocket } from 'ws'
import { randomUUID } from 'node:crypto'
import { serve } from '@hono/node-server'
import { DatabaseSchema, PageSchema, TaskSchema } from '@xnet/data'
import { Hono } from 'hono'
import { WebSocketServer } from 'ws'
import { hasHubCapability } from './auth/capabilities'
import { createHubAuthError } from './auth/errors'
import {
  authenticateConnection,
  authenticateHttpRequest,
  removeSession,
  toAuthContext
} from './auth/ucan'
import { Metrics, HUB_METRICS } from './middleware/metrics'
import { RateLimiter } from './middleware/rate-limit'
import { NodePool } from './pool/node-pool'
import { createBackupRoutes } from './routes/backup'
import { createCrawlRoutes } from './routes/crawl'
import { createDiscoveryRoutes } from './routes/dids'
import { createFederationRoutes } from './routes/federation'
import { createFileRoutes } from './routes/files'
import { createKeyRegistryRoutes } from './routes/keys'
import { createSchemaRoutes } from './routes/schemas'
import { createShardRoutes } from './routes/shards'
import { AwarenessService } from './services/awareness'
import { BackupService } from './services/backup'
import { CrawlCoordinator } from './services/crawl'
import { RobotsChecker } from './services/crawl-robots'
import { DiscoveryService } from './services/discovery'
import { FederationService, type FederationConfig } from './services/federation'
import { FederationHealthChecker } from './services/federation-health'
import { FileService } from './services/files'
import { ShardRegistry } from './services/index-shards'
import { KeyRegistryService } from './services/key-registry'
import { NodeRelayError, NodeRelayService } from './services/node-relay'
import { QueryService } from './services/query'
import { RelayService } from './services/relay'
import { SchemaRegistryService } from './services/schemas'
import { ShardIngestRouter } from './services/shard-ingest'
import { ShardRebalancer } from './services/shard-rebalancer'
import { ShardQueryRouter } from './services/shard-router'
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

const isUnsubscribeMessage = (
  value: unknown
): value is { type: 'unsubscribe'; topics?: unknown } => {
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
  Boolean(value && typeof value === 'object' && !Array.isArray(value))

const isQueryRequest = (
  value: unknown
): value is { type: 'query-request'; id: string; query: string; federate?: boolean } => {
  if (!isRecord(value)) return false
  return (
    value.type === 'query-request' &&
    typeof value.id === 'string' &&
    typeof value.query === 'string'
  )
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

const isAwarenessMessage = (
  value: unknown
): value is { type: 'awareness'; update?: string; state?: unknown } => {
  if (!isRecord(value)) return false
  if (value.type !== 'awareness') return false
  const candidate = value as { update?: unknown; state?: unknown }
  return (
    (typeof candidate.update === 'string' && candidate.update.length > 0) ||
    typeof candidate.state !== 'undefined'
  )
}

const isClientHandshake = (
  value: unknown
): value is {
  type: 'client-handshake'
  did: string
  protocolVersion: number
  minProtocolVersion: number
  features: string[]
  packageVersion: string
} => {
  if (!isRecord(value)) return false
  if (value.type !== 'client-handshake') return false
  return (
    typeof value.did === 'string' &&
    typeof value.protocolVersion === 'number' &&
    typeof value.minProtocolVersion === 'number' &&
    Array.isArray(value.features) &&
    typeof value.packageVersion === 'string'
  )
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

export const createServer = async (config: HubConfig): Promise<HubInstance> => {
  const app = new Hono()
  const signaling = createSignalingService()
  const storage = await createStorage(config.storage, config.dataDir)
  const pool = new NodePool(storage)
  const relay = new RelayService(pool, { requireSignedUpdates: config.auth })
  const backup = new BackupService(storage, {
    maxQuotaBytes: config.defaultQuota,
    maxBlobSize: config.maxBlobSize
  })
  const files = new FileService(storage)
  const keyRegistry = new KeyRegistryService()
  const query = new QueryService(storage)
  const federationDefaults = {
    enabled: false,
    hubDid: 'did:key:hub',
    peers: [] as const,
    expose: { schemas: '*', requireAuth: false, rateLimit: 60, maxResults: 50 },
    peerTimeoutMs: 2000,
    totalTimeoutMs: 5000,
    openRegistration: false
  }
  const federationConfig = config.federation
    ? {
        ...federationDefaults,
        ...config.federation,
        peers: config.federation.peers ?? federationDefaults.peers,
        expose: {
          ...federationDefaults.expose,
          ...config.federation.expose
        }
      }
    : federationDefaults
  const federation = new FederationService(federationConfig as FederationConfig, storage, query)
  const federationHealth = new FederationHealthChecker(federationConfig as FederationConfig)
  const shardDefaults = {
    enabled: false,
    totalShards: 64,
    hostedShards: [] as number[],
    replicationFactor: 2,
    registryUrl: config.publicUrl ?? '',
    maxDocsPerShard: 1_000_000,
    hubDid: federationConfig.hubDid,
    hubUrl: config.publicUrl ?? `http://localhost:${config.port}`,
    isRegistry: false,
    refreshIntervalMs: 5 * 60_000
  }
  const shardConfig = config.shards
    ? {
        ...shardDefaults,
        ...config.shards,
        hostedShards: config.shards.hostedShards ?? shardDefaults.hostedShards
      }
    : shardDefaults
  const shardRegistry = new ShardRegistry(shardConfig, storage)
  const shardIngest = new ShardIngestRouter(shardRegistry, storage, shardConfig)
  const shardRouter = new ShardQueryRouter(shardRegistry, storage, shardConfig)
  const shardRebalancer = shardConfig.isRegistry
    ? new ShardRebalancer(shardConfig, storage, shardRegistry)
    : null
  const crawlDefaults = {
    enabled: false,
    maxBatchSize: 10,
    taskDeadlineMs: 5 * 60 * 1000,
    domainCooldownMs: 2000,
    maxQueueSize: 10_000,
    blocklist: [] as string[],
    userAgent: 'xNetCrawler/1.0 (+https://xnet.io/crawler)',
    seedUrls: [] as string[],
    deadlineCheckIntervalMs: 30_000
  }
  const crawlConfig = config.crawl
    ? {
        ...crawlDefaults,
        ...config.crawl,
        blocklist: config.crawl.blocklist ?? crawlDefaults.blocklist,
        seedUrls: config.crawl.seedUrls ?? crawlDefaults.seedUrls
      }
    : crawlDefaults
  const robots = crawlConfig.enabled
    ? new RobotsChecker({ userAgent: crawlConfig.userAgent, cacheTtlMs: 24 * 60 * 60 * 1000 })
    : null
  const crawlCoordinator = new CrawlCoordinator(
    storage,
    shardIngest,
    crawlConfig,
    robots ?? undefined
  )
  const nodeRelay = new NodeRelayService(storage)
  const awareness = new AwarenessService(storage, {
    ttlMs: config.awarenessTtlMs ?? 24 * 60 * 60 * 1000,
    cleanupIntervalMs: config.awarenessCleanupIntervalMs ?? 60 * 60 * 1000,
    maxUsersPerRoom: config.awarenessMaxUsers ?? 100
  })
  const discovery = new DiscoveryService(storage, {
    staleTtlMs: config.discoveryStaleTtlMs ?? 7 * 24 * 60 * 60 * 1000,
    cleanupIntervalMs: config.discoveryCleanupIntervalMs ?? 6 * 60 * 60 * 1000,
    maxPeers: config.discoveryMaxPeers ?? 10000
  })
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
      platform: config.runtime?.platform ?? 'unknown',
      region: config.runtime?.region,
      machineId: config.runtime?.machineId,
      version: '0.0.1'
    })
  })

  // Shields.io endpoint badge format for README status badges
  // See: https://shields.io/badges/endpoint-badge
  app.get('/health/badge', (c) => {
    const uptime = Math.floor((Date.now() - startTime) / 1000)
    const hours = Math.floor(uptime / 3600)
    const minutes = Math.floor((uptime % 3600) / 60)
    const uptimeStr = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`

    return c.json({
      schemaVersion: 1,
      label: 'demo hub',
      message: `online · ${uptimeStr}`,
      color: 'brightgreen'
    })
  })

  app.get('/ready', async (c) => {
    try {
      // Verify storage is writable by performing a lightweight operation
      await storage.getDocState('__readiness_check__')
      return c.json({ status: 'ready' })
    } catch (err) {
      return c.json(
        { status: 'not ready', error: err instanceof Error ? err.message : String(err) },
        503
      )
    }
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
    const auth = authenticateHttpRequest(authHeader ?? null, config)
    if (!auth) {
      return c.json(
        createHubAuthError({
          code: 'UNAUTHORIZED',
          message: 'Missing or invalid UCAN token',
          action: 'hub/connect'
        }),
        401
      )
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
  app.route('/keys', createKeyRegistryRoutes(keyRegistry))
  app.route('/dids', createDiscoveryRoutes(discovery, { requireAuth }))
  app.route('/federation', createFederationRoutes(federation, { requireAuth }))
  if (shardConfig.enabled) {
    app.route(
      '/shards',
      createShardRoutes({
        registry: shardRegistry,
        ingest: shardIngest,
        router: shardRouter,
        rebalancer: shardRebalancer ?? undefined,
        requireAuth
      })
    )
  }
  if (crawlConfig.enabled) {
    app.route(
      '/crawl',
      createCrawlRoutes({
        coordinator: crawlCoordinator,
        requireAuth,
        userAgent: crawlConfig.userAgent
      })
    )
  }

  let httpServer: ReturnType<typeof serve> | null = null
  let wss: WebSocketServer | null = null

  const start = async (): Promise<void> => {
    if (httpServer) return
    awareness.start()
    discovery.start()
    if (federationConfig.enabled) {
      await federation.loadPeers()
      federationHealth.start()
    }
    if (shardConfig.enabled) {
      await shardRegistry.init()
      if (shardConfig.isRegistry && shardRebalancer && shardConfig.hubDid && shardConfig.hubUrl) {
        await shardRebalancer.registerHost({
          hubDid: shardConfig.hubDid,
          url: shardConfig.hubUrl,
          capacity: shardConfig.maxDocsPerShard
        })
      }
    }
    if (crawlConfig.enabled) {
      crawlCoordinator.start()
      if (crawlConfig.seedUrls && crawlConfig.seedUrls.length > 0) {
        await crawlCoordinator.seedUrls(crawlConfig.seedUrls)
      }
    }
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

    wss = new WebSocketServer({ server: httpServer as import('http').Server })

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

        if (session.did !== 'did:key:anonymous') {
          const publicUrl = config.publicUrl ?? `ws://localhost:${config.port}`
          const websocketUrl = publicUrl.replace('https://', 'wss://').replace('http://', 'ws://')
          void discovery
            .register(
              {
                did: session.did,
                publicKeyB64: '',
                endpoints: [{ type: 'websocket', address: websocketUrl, priority: 0 }],
                hubUrl: config.publicUrl ?? websocketUrl,
                capabilities: session.capabilities.map((cap) => cap.can)
              },
              session.did
            )
            .catch(() => {})
        }

        const connId = randomUUID()
        rateLimiter.addConnection(connId)
        metrics.increment(HUB_METRICS.WS_CONNECTIONS_TOTAL)
        let closed = false

        // Send handshake message with hub info (including demo mode and protocol version)
        const handshake: {
          type: 'handshake'
          version: string
          protocolVersion: number
          minProtocolVersion: number
          features: string[]
          hubDid?: string
          isDemo: boolean
          demoLimits?: {
            quotaBytes: number
            maxDocs: number
            maxBlobBytes: number
            evictionTtlMs: number
          }
        } = {
          type: 'handshake',
          version: '0.0.1',
          // Protocol versioning for forward/backward compatibility
          protocolVersion: 1, // Current sync protocol version
          minProtocolVersion: 1, // Minimum supported protocol version
          features: [
            'node-changes', // NodeChange sync
            'yjs-updates', // Yjs CRDT sync
            'signed-yjs-envelopes', // Signed Yjs updates
            'batch-changes' // Transaction batching
          ],
          hubDid: config.hubDid,
          isDemo: !!config.demo
        }
        if (config.demo && config.demoOverrides) {
          handshake.demoLimits = {
            quotaBytes: config.demoOverrides.quota,
            maxDocs: config.demoOverrides.maxDocs,
            maxBlobBytes: config.demoOverrides.maxBlob,
            evictionTtlMs: config.demoOverrides.evictionTtl
          }
        }
        if (ws.readyState === 1) {
          ws.send(JSON.stringify(handshake))
        }

        const finalize = (): void => {
          if (closed) return
          closed = true
          rateLimiter.removeConnection(connId)
          removeSession(ws)
          const topics = socketTopics.get(ws)
          if (topics) {
            for (const topic of topics) {
              relay.handleRoomLeave(topic)
              void awareness.handleDisconnect(topic, session.did)
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
            if (session.did !== 'did:key:anonymous') {
              void discovery.heartbeat(session.did)
            }
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

            // Handle client handshake (version negotiation)
            if (isClientHandshake(payload)) {
              const hubProtocolVersion = 1
              const hubMinProtocolVersion = 1

              // Check version compatibility
              const clientMax = payload.protocolVersion
              const clientMin = payload.minProtocolVersion

              // Find compatible version range
              const agreedVersion = Math.min(hubProtocolVersion, clientMax)
              const minRequired = Math.max(hubMinProtocolVersion, clientMin)

              if (agreedVersion < minRequired) {
                // Versions are incompatible
                const suggestion =
                  clientMax < hubMinProtocolVersion
                    ? 'upgrade-client'
                    : hubProtocolVersion < clientMin
                      ? 'upgrade-hub'
                      : 'incompatible'

                ws.send(
                  JSON.stringify({
                    type: 'version-mismatch',
                    hubVersion: hubProtocolVersion,
                    clientVersion: clientMax,
                    suggestion,
                    message:
                      suggestion === 'upgrade-client'
                        ? `Client protocol v${clientMax} is too old. Please upgrade to at least v${hubMinProtocolVersion}.`
                        : suggestion === 'upgrade-hub'
                          ? `Hub protocol v${hubProtocolVersion} is too old for client v${clientMin}.`
                          : 'Protocol versions are incompatible.'
                  })
                )
                metrics.increment(HUB_METRICS.WS_MESSAGES_SENT)
                // Don't close the connection - just warn
              } else if (clientMax < hubProtocolVersion) {
                // Client is using older version - log for metrics
                console.log(
                  `Client ${payload.did} using older protocol v${clientMax} (hub is v${hubProtocolVersion})`
                )
              }
              return
            }

            if (isQueryRequest(payload)) {
              if (!authContext.can('query/read', '*')) {
                const authError = createHubAuthError({
                  code: 'FORBIDDEN',
                  message: 'Capability does not allow querying',
                  action: 'hub/query'
                })
                ws.send(
                  JSON.stringify({
                    type: 'query-error',
                    id: payload.id,
                    error: authError.message,
                    code: authError.code,
                    action: authError.action
                  })
                )
                return
              }
              const response =
                payload.federate && federationConfig.enabled
                  ? await federation.search(payload)
                  : await query.handleQuery(payload)
              metrics.increment(HUB_METRICS.QUERY_REQUESTS_TOTAL)
              metrics.observe(HUB_METRICS.QUERY_DURATION_MS, response.took)
              ws.send(JSON.stringify(response))
              metrics.increment(HUB_METRICS.WS_MESSAGES_SENT)
              return
            }

            if (isIndexUpdate(payload)) {
              if (!authContext.can('index/write', payload.docId)) {
                const authError = createHubAuthError({
                  code: 'FORBIDDEN',
                  message: 'Capability does not allow index update',
                  action: 'hub/relay',
                  resource: payload.docId
                })
                ws.send(
                  JSON.stringify({
                    type: 'index-error',
                    docId: payload.docId,
                    error: authError.message,
                    code: authError.code,
                    action: authError.action
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
                const authError = createHubAuthError({
                  code: 'FORBIDDEN',
                  message: 'Capability does not allow index removal',
                  action: 'hub/relay',
                  resource: payload.docId
                })
                ws.send(
                  JSON.stringify({
                    type: 'index-error',
                    docId: payload.docId,
                    error: authError.message,
                    code: authError.code,
                    action: authError.action
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
                  ws.send(
                    JSON.stringify({ type: 'node-error', code: err.code, error: err.message })
                  )
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
                  ws.send(
                    JSON.stringify({ type: 'node-error', code: err.code, error: err.message })
                  )
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
                  ws.send(
                    JSON.stringify({ type: 'node-error', code: err.code, error: err.message })
                  )
                  metrics.increment(HUB_METRICS.WS_MESSAGES_SENT)
                  return
                }
                throw err
              }
            }

            if (
              isPublishMessage(payload) &&
              typeof payload.topic === 'string' &&
              isAwarenessMessage(payload.data)
            ) {
              await awareness.handleAwarenessMessage(payload.topic, authContext.did, payload.data)
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
                    const snapshot = await awareness.getSnapshot(topic)
                    if (snapshot.length > 0 && ws.readyState === 1) {
                      ws.send(
                        JSON.stringify({
                          type: 'publish',
                          topic,
                          data: {
                            type: 'awareness-snapshot',
                            from: 'hub-relay',
                            users: snapshot.map((entry) => ({
                              did: entry.userDid,
                              state: entry.state,
                              lastSeen: entry.lastSeen,
                              isStale: Date.now() - entry.lastSeen > 5 * 60 * 1000
                            }))
                          }
                        })
                      )
                    }
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
                    await awareness.handleDisconnect(topic, authContext.did)
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

    awareness.stop()
    discovery.stop()
    federationHealth.stop()
    shardRegistry.stop()
    crawlCoordinator.stop()
    signaling.destroy()
  }

  return {
    port: config.port,
    config,
    start,
    stop
  }
}
