/**
 * @xnetjs/hub - Hono + WebSocket server implementation.
 */

import type { AuthSession } from './auth/ucan'
import type { HubConfig, HubInstance } from './types'
import type { MiddlewareHandler } from 'hono'
import type { IncomingMessage } from 'http'
import type { RawData, WebSocket } from 'ws'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { serve } from '@hono/node-server'
import { DatabaseSchema, PageSchema, TaskSchema, profileNodeId as profileNodeIdForDid } from '@xnetjs/data'
import { generateIdentity, ucanTokenId, verifyUCAN } from '@xnetjs/identity'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { WebSocketServer } from 'ws'
import { createHubAuthError } from './auth/errors'
import {
  authenticateConnection,
  authenticateHttpRequest,
  removeSession,
  toAuthContext
} from './auth/ucan'
import { RevocationService } from './auth/revocation'
import { measureDataUsage, type DataUsage } from './data-usage'
import { aiForwarderFeature } from './features/ai-forwarder'
import { diagnosticsSharingFeature } from './features/diagnostics-sharing'
import { billingFeature, tasksFeature, unfurlFeature } from './features/first-party'
import { formInboxFeature } from './features/form-inbox'
import { mountFeatures } from './features/registry'
import { pagerdutyFeature, sentryFeature, stripeFeature } from './features/webhook-integrations'
import { createLogger } from './logger'
import { Metrics, HUB_METRICS } from './middleware/metrics'
import { RateLimiter } from './middleware/rate-limit'
import { NodePool } from './pool/node-pool'
import { createAuditRoutes } from './routes/audit'
import { createBackupRoutes } from './routes/backup'
import { createCrawlRoutes } from './routes/crawl'
import { createDiscoveryRoutes } from './routes/dids'
import { createFederationRoutes } from './routes/federation'
import { createFileRoutes } from './routes/files'
import { mountOidcProvider } from './features/oidc-provider'
import { createAtprotoRoutes } from './routes/atproto'
import { createKeyRegistryRoutes } from './routes/keys'
import { createRecoveryAnchorRoutes } from './routes/recovery-anchor'
import { AtprotoBindingVerifier } from './services/atproto-binding'
import { AtprotoRecoveryAnchor } from './services/atproto-recovery-anchor'
import { EscrowStore } from './services/escrow-store'
import { createPublicRoutes } from './routes/public'
import { createSchemaRoutes } from './routes/schemas'
import { createShardRoutes } from './routes/shards'
import { createShareInterstitialRoutes, DEFAULT_APP_URL } from './routes/share-interstitial'
import { createShareLinkRoutes } from './routes/share-links'
import { createTelemetryRoutes } from './routes/telemetry'
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
import { DiskWatchdog } from './services/disk-watchdog'
import { NodeRelayService } from './services/node-relay'
import { QueryService } from './services/query'
import { RelayService } from './services/relay'
import { SchemaRegistryService } from './services/schemas'
import { ShardIngestRouter } from './services/shard-ingest'
import { ShardRebalancer } from './services/shard-rebalancer'
import { ShardQueryRouter } from './services/shard-router'
import { ShareAccessService } from './services/share-access'
import { createSignalingService } from './services/signaling'
import { TaskIdentifierService } from './services/task-identifiers'
import { createStorage } from './storage'
import { LitestreamSyncTracker, readLitestreamMetrics, isBackupFresh } from './storage/litestream'
import { setupHubTelemetry } from './telemetry/bridge'
import { authorizeRoomAction, denyAndCloseSocket } from './ws/authorize'
import { buildWsError } from './ws/errors'
import { isRecord } from './ws/guards'
import { createWsMessageRouter } from './ws/register'

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

type ShareHandleDocType = 'page' | 'database' | 'canvas'

type ShareHandleRecord = {
  handle: string
  endpoint: string
  endpointClaim: string
  token: string
  resource: string
  docType: ShareHandleDocType
  exp: number
  jti: string
  nonce: string
  used: boolean
  issuedAt: number
}

type RevokedReplayRecord = {
  jti: string
  expiresAt: number
}

const isShareDocType = (value: unknown): value is ShareHandleDocType =>
  value === 'page' || value === 'database' || value === 'canvas'

const isSecureWsEndpoint = (endpoint: string): boolean => {
  try {
    const parsed = new URL(endpoint)
    if (parsed.protocol === 'wss:') {
      return true
    }
    if (parsed.protocol !== 'ws:') {
      return false
    }
    return parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1'
  } catch {
    return false
  }
}

const endpointClaimFor = (endpoint: string, resource: string, exp: number): string =>
  createHash('sha256').update(`${endpoint}|${resource}|${exp}`).digest('base64url')

export const createServer = async (config: HubConfig): Promise<HubInstance> => {
  const app = new Hono()
  const log = createLogger({ level: config.logLevel, base: { service: 'xnet-hub' } })
  // Browser clients live on other origins than the hub (the deployed app on
  // xnet.fyi, Electron/Capacitor shells, self-hosted apps) and call the hub's
  // HTTP APIs with a Bearer UCAN token, which forces a CORS preflight. Auth is
  // token-based — never cookies — so a wildcard origin grants nothing a
  // malicious page could use without already holding a token.
  app.use('*', cors())
  // Global safety net (exploration 0315 P0): routes do their own try/catch, so
  // this only fires on a genuinely uncaught throw — log one structured line and
  // return a clean 500 instead of leaking a stack to the client.
  app.onError((err, c) => {
    log.error('unhandled', {
      method: c.req.method,
      path: c.req.path,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined
    })
    return c.json({ error: 'internal_error' }, 500)
  })
  const signaling = createSignalingService()
  // The demo hub's data is disposable, so let it auto-reset a corrupt base DB
  // and boot rather than crash-loop (exploration 0206 follow-up). A real
  // self-host / production hub never does this.
  const storage = await createStorage(config.storage, config.dataDir, {
    resetOnCorruption: !!config.demo
  })
  // In demo mode, every per-user cap comes from the demo overrides (10 MB /
  // 2 MB by default), not the 1 GB plan quota — otherwise a single visitor can
  // fill the small demo volume (exploration 0291).
  const demo = config.demo ? config.demoOverrides : undefined
  const perUserQuota = demo ? demo.quota : config.defaultQuota
  const maxBlobBytes = demo ? demo.maxBlob : config.maxBlobSize
  // Demo-only: watch the data dir and shed relay writes before the volume fills
  // (a full SQLite volume crashes the hub — exploration 0291 / the 0290 502).
  const diskWatchdog = demo
    ? new DiskWatchdog({ dataDir: config.dataDir, maxBytes: demo.diskLimitBytes })
    : null
  const isStorageFull = diskWatchdog ? () => diskWatchdog.isFull() : undefined
  const pool = new NodePool(storage, { isStorageFull })
  const relayIdentity = generateIdentity()
  const relay = new RelayService(pool, {
    replication: config.sync,
    verifyV2Envelope: config.syncVerification?.verifyV2Envelope,
    telemetry: config.telemetry,
    telemetryPeerHashSalt: config.telemetryPeerHashSalt,
    signing: {
      authorDID: relayIdentity.identity.did,
      signingKey: relayIdentity.privateKey
    }
  })
  const backup = new BackupService(storage, {
    maxQuotaBytes: perUserQuota,
    maxBlobSize: maxBlobBytes
  })
  // Files count against the same plan quota as backups (the hub's `defaultQuota`,
  // resolved from the signed HUB_PLAN entitlement). Without this, uploads fall back
  // to FileService's hardcoded 5 GiB default and silently diverge from the plan
  // quota the dashboard meter shows (exploration 0216).
  const files = new FileService(storage, { maxStoragePerUser: perUserQuota })
  const keyRegistry = new KeyRegistryService()
  const atprotoBindingVerifier = new AtprotoBindingVerifier()
  const atprotoRecoveryAnchor = new AtprotoRecoveryAnchor(atprotoBindingVerifier)
  const escrowStore = new EscrowStore()
  const taskIdentifiers = new TaskIdentifierService()
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
  const remoteMutationTelemetry = {
    telemetry: config.telemetry,
    telemetryPeerHashSalt: config.telemetryPeerHashSalt
  }
  const shareAccess = new ShareAccessService(storage)
  const nodeRelay = new NodeRelayService(storage, remoteMutationTelemetry, {
    quotaBytes: demo ? demo.quota : undefined,
    isStorageFull,
    // Fan channel nodes into their share room so grantees receive them (0298).
    shareAccess,
    broadcastToRoom: (room, change) =>
      signaling.publishFromHub(room, { type: 'node-change', room, change })
  })
  const awareness = new AwarenessService(storage, {
    ttlMs: config.awarenessTtlMs ?? 24 * 60 * 60 * 1000,
    cleanupIntervalMs: config.awarenessCleanupIntervalMs ?? 60 * 60 * 1000,
    maxUsersPerRoom: config.awarenessMaxUsers ?? 100,
    maxUpdateSize: config.awarenessMaxUpdateSize ?? 65_536
  })
  const discovery = new DiscoveryService(storage, {
    staleTtlMs: config.discoveryStaleTtlMs ?? 7 * 24 * 60 * 60 * 1000,
    cleanupIntervalMs: config.discoveryCleanupIntervalMs ?? 6 * 60 * 60 * 1000,
    maxPeers: config.discoveryMaxPeers ?? 10000
  })
  const schemas = new SchemaRegistryService(storage)
  const metrics = new Metrics()
  // Telemetry subsystem (exploration 0187): a SEPARATE telemetry.db (never in
  // hub.db) + metrics bridge + retention/tiering, assembled behind one handle so
  // createServer stays free of telemetry branching.
  const telemetry = setupHubTelemetry({
    storage: config.storage,
    dataDir: config.dataDir,
    metrics
  })
  const rateLimiter = new RateLimiter({
    perConnectionRate: config.rateLimit?.perConnectionRate ?? 100,
    maxConnections: config.rateLimit?.maxConnections ?? config.maxConnections,
    maxMessageSize: config.rateLimit?.maxMessageSize ?? config.maxMessageSize,
    windowMs: config.rateLimit?.windowMs ?? 1000
  })

  const startTime = Date.now()
  const socketTopics = new Map<WebSocket, Set<string>>()
  const socketPeers = new Map<WebSocket, Set<string>>()
  const socketSessions = new Map<WebSocket, AuthSession>()
  const shareHandles = new Map<string, ShareHandleRecord>()
  const replayCache = new Map<string, RevokedReplayRecord>()

  const pruneShareHandles = (): void => {
    const now = Date.now()
    for (const [handle, record] of shareHandles) {
      if (record.exp <= now || (record.used && now - record.issuedAt > 5 * 60 * 1000)) {
        shareHandles.delete(handle)
      }
    }
    for (const [key, record] of replayCache) {
      if (record.expiresAt <= now) {
        replayCache.delete(key)
      }
    }
  }

  // Periodic re-check of live subscriptions (token expiry / revocation) —
  // resolves through the same unified room-auth path as the message handlers.
  const enforceSocketTopicAuth = async (ws: WebSocket): Promise<void> => {
    const session = socketSessions.get(ws)
    if (!session) return
    const topics = socketTopics.get(ws)
    if (!topics || topics.size === 0) return

    for (const topic of topics) {
      const decision = await authorizeRoomAction({
        storage,
        session,
        action: 'hub/signal',
        topic,
        shareAccess
      })
      if (!decision.allowed) {
        denyAndCloseSocket(ws, decision, 'hub/signal', topic, metrics)
        return
      }
    }
  }

  // WebSocket message router (exploration 0276 Theme 2): every message-type
  // handler lives under src/ws/handlers/, registered in the pump's original
  // branch order by createWsMessageRouter.
  const messageRouter = createWsMessageRouter({
    config,
    storage,
    metrics,
    query,
    federation,
    federationEnabled: federationConfig.enabled,
    nodeRelay,
    shareAccess,
    awareness,
    relay,
    signaling,
    remoteMutationTelemetry,
    socketTopics,
    socketPeers
  })

  // On-disk usage is cached (a recursive size walk shouldn't run on every poll —
  // /health is hit by the control-plane probe + the dashboard). 30s is plenty.
  let usageCache: { at: number; usage: DataUsage } | null = null
  const dataUsage = (): DataUsage => {
    const nowMs = Date.now()
    if (usageCache && nowMs - usageCache.at < 30_000) return usageCache.usage
    const usage = measureDataUsage(config.dataDir)
    usageCache = { at: nowMs, usage }
    return usage
  }

  // Live backup freshness (exploration 0288): scrape Litestream's localhost metrics
  // to derive a `lastSyncMs`, refreshed lazily off /health (same TTL pattern as the
  // usage walk) so the handler stays synchronous and never blocks on the scrape. The
  // first probe primes the tracker; the next one reads a value.
  const syncTracker = new LitestreamSyncTracker()
  let lastMetricsAt = 0
  const maybeRefreshSync = (): void => {
    if (process.env.LITESTREAM !== '1') return
    const nowMs = Date.now()
    if (nowMs - lastMetricsAt < 15_000) return
    lastMetricsAt = nowMs
    void readLitestreamMetrics().then((text) => {
      if (text) syncTracker.observe(text, Date.now())
    })
  }

  app.get('/health', (c) => {
    const poolStats = pool.getStats()
    const rlStats = rateLimiter.getStats()
    const usage = dataUsage()
    maybeRefreshSync()
    const lastSyncMs = syncTracker.value
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
      // Data footprint + a "data as of" signal (exploration 0207). With continuous
      // Litestream replication the R2 replica is ≤ sync-interval behind lastWriteMs.
      storage: { usedBytes: usage.usedBytes },
      // `lastSyncMs` is the measured R2 replica sync time; `fresh` is the gate the
      // control plane trusts before demoting a tenant to cold (fails closed when the
      // scrape is unknown — exploration 0288).
      backup: {
        replicating: process.env.LITESTREAM === '1',
        lastWriteMs: usage.lastWriteMs,
        lastSyncMs,
        fresh: isBackupFresh(usage.lastWriteMs, lastSyncMs)
      },
      platform: config.runtime?.platform ?? 'unknown',
      region: config.runtime?.region,
      machineId: config.runtime?.machineId,
      // Hub identity (0307-B): clients mint UCANs with `aud` = this DID so a
      // token stolen for one hub is useless at another.
      hubDid: config.hubDid,
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

  const revocation = new RevocationService()

  const requireAuth: MiddlewareHandler = async (c, next) => {
    const authHeader = c.req.header('authorization') ?? c.req.header('Authorization')
    const auth = authenticateHttpRequest(authHeader ?? null, config, revocation)
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
  app.route('/audit', createAuditRoutes(storage, { requireAuth }))
  app.route('/keys', createKeyRegistryRoutes(keyRegistry))
  // ATProto binding verification (0301/0322/0338): the hub resolves DID docs
  // and binding records so clients can render verified handles.
  app.use('/atproto/*', requireAuth)
  app.route('/atproto', createAtprotoRoutes(atprotoBindingVerifier))

  // Recovery-anchor escrow (0243/0322/0338): enroll requires auth (a DID may
  // only enroll for itself); release is the recovery path and is public (the
  // caller has, by definition, lost their key) but gated by full server-side
  // ceremony verification + the user's PIN applied client-side.
  app.use('/recovery-anchor/enroll', requireAuth)
  app.route(
    '/recovery-anchor',
    createRecoveryAnchorRoutes({
      store: escrowStore,
      anchor: atprotoRecoveryAnchor,
      callerDid: (ctx) => {
        const header =
          (ctx as { req: { header(name: string): string | undefined } }).req.header(
            'authorization'
          ) ?? null
        return authenticateHttpRequest(header, config, revocation)?.did ?? null
      }
    })
  )
  // First-party hub features mount through the feature registry (exploration
  // 0189). Each receives a broker-scoped env — only the secrets it declared — so
  // billing reads STRIPE_SECRET_KEY/STRIPE_WEBHOOK_SECRET/BTCPAY_* but never the
  // GitHub webhook secret, and vice-versa. Behaviour is identical to the previous
  // hardcoded mounts.
  //
  // `tasksFeature` is mounted WITHOUT an `applyAutomationActions` callback: the
  // GitHub webhook verifies signatures and normalizes deliveries into
  // `TaskAutomationAction[]`, but applying them to a workspace's Task nodes needs
  // server-authoritative node writes (a hub system identity), which the hub does
  // not yet have. Until then the actions are reported (`{ ok, actions }`) but not
  // applied — matching the previous hand-written route, which also never wired
  // apply. See exploration 0189 (deferred: server-side action application).
  mountFeatures(
    [
      billingFeature(),
      tasksFeature(taskIdentifiers),
      unfurlFeature(crawlConfig.userAgent),
      // Managed-AI forwarder (0208): proxies `/ai/chat` + `/ai/models` to the
      // control plane with this hub's tenant credential. Unconfigured off-cloud →
      // `/ai/health` reports managed:false and the chat route stays unmounted.
      aiForwarderFeature(),
      // Opt-in diagnostics sharing (0210): off by default. When the owner sets
      // XNET_DIAGNOSTICS_URL/SECRET, forwards scrubbed, content-free crash
      // reports upstream so we can help debug their hub.
      diagnosticsSharingFeature(),
      // Signed integration webhooks (exploration 0213): Stripe/Sentry/PagerDuty.
      // Each is secret-gated (503 until its *_WEBHOOK_SECRET is set), verifies the
      // provider HMAC, and normalizes deliveries into ExternalItem-shaped actions.
      // Mounted WITHOUT an apply callback for the same reason as the GitHub
      // webhook above — server-authoritative node writes are deferred — so actions
      // are reported (`{ ok, actions }`) but not yet materialized.
      stripeFeature(),
      sentryFeature(),
      pagerdutyFeature(),
      // Public form submissions (exploration 0278): owner-minted hashed
      // tokens, anonymous GET definition / POST response, durable pending
      // inbox. The hub never writes nodes — the owner's client drains the
      // inbox into signed DatabaseRows (same deferred-write stance as above).
      formInboxFeature()
    ],
    {
      app,
      env: process.env,
      requireAuth,
      storage: config.storage,
      dataDir: config.dataDir,
      appUrl: config.appUrl ?? DEFAULT_APP_URL
    }
  )
  app.route('/dids', createDiscoveryRoutes(discovery, { requireAuth }))
  app.route(
    '/telemetry',
    createTelemetryRoutes({
      store: telemetry.store,
      hashSalt: config.telemetryPeerHashSalt ?? '',
      requireAuth
    })
  )
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

  app.route(
    '/shares',
    createShareLinkRoutes({
      storage,
      requireAuth,
      publicUrl: config.publicUrl,
      port: config.port,
      onGrantsChanged: (did, docId) => shareAccess.invalidate(did, docId)
    })
  )
  // Unauthenticated, read-only public access (exploration 0179) — gated on
  // effective visibility === 'public'; never bypasses the grant model otherwise.
  app.route('/public', createPublicRoutes({ storage }))
  app.route(
    '/',
    createShareInterstitialRoutes({
      publicUrl: config.publicUrl,
      port: config.port,
      appUrl: config.appUrl ?? DEFAULT_APP_URL,
      appleAppId: config.appleAppId,
      androidPackage: config.androidPackage,
      androidCertSha256: config.androidCertSha256
    })
  )
  // UCAN revocation (0307-B): admins kill a leaked/over-broad token by id
  // (sha256 of the compact JWT — `ucanTokenId`), a raw token, or a whole DID.
  // Enforced on every subsequent WS connect and HTTP request.
  app.post('/auth/revoke', requireAuth, async (c) => {
    // The root app is an untyped Hono; re-derive the context the middleware
    // just validated instead of reading the untyped variable bag.
    const authHeader = c.req.header('authorization') ?? c.req.header('Authorization')
    const auth = authenticateHttpRequest(authHeader ?? null, config, revocation)
    if (!auth || !auth.can('hub/admin', '*')) {
      return c.json(
        createHubAuthError({
          code: 'FORBIDDEN',
          message: 'hub/admin capability required to revoke tokens',
          action: 'hub/admin'
        }),
        403
      )
    }
    const body = await c.req.json().catch(() => null)
    if (!isRecord(body)) {
      return c.json({ error: 'Invalid request body' }, 400)
    }
    if (typeof body.token === 'string' && body.token.length > 0) {
      const parsed = verifyUCAN(body.token)
      const exp = parsed.payload?.exp ?? Math.floor(Date.now() / 1000) + 24 * 60 * 60
      revocation.revokeToken(ucanTokenId(body.token), exp)
      return c.json({ ok: true, revoked: 'token' })
    }
    if (typeof body.tokenId === 'string' && body.tokenId.length > 0) {
      const exp =
        typeof body.exp === 'number' ? body.exp : Math.floor(Date.now() / 1000) + 24 * 60 * 60
      revocation.revokeToken(body.tokenId, exp)
      return c.json({ ok: true, revoked: 'tokenId' })
    }
    if (typeof body.did === 'string' && body.did.startsWith('did:')) {
      revocation.revokeDid(body.did, typeof body.beforeMs === 'number' ? body.beforeMs : Date.now())
      return c.json({ ok: true, revoked: 'did' })
    }
    return c.json({ error: 'Provide token, tokenId, or did' }, 400)
  })

  app.post('/shares/issue', requireAuth, async (c) => {
    const body = await c.req.json().catch(() => null)
    if (!isRecord(body)) {
      return c.json({ error: 'Invalid request body' }, 400)
    }

    const endpoint = typeof body.endpoint === 'string' ? body.endpoint : ''
    const token = typeof body.token === 'string' ? body.token : ''
    const resource = typeof body.resource === 'string' ? body.resource : ''
    const docType = body.docType
    const exp = typeof body.exp === 'number' ? body.exp : NaN

    if (!endpoint || !token || !resource || !isShareDocType(docType) || !Number.isFinite(exp)) {
      return c.json({ error: 'Missing required share fields' }, 400)
    }
    if (!isSecureWsEndpoint(endpoint)) {
      return c.json({ error: 'Endpoint must be wss (or localhost ws in dev)' }, 400)
    }

    const now = Date.now()
    if (exp <= now) {
      return c.json({ error: 'Share already expired' }, 400)
    }

    const maxTtlMs = 30 * 60 * 1000
    const boundedExp = Math.min(exp, now + maxTtlMs)
    const handle = `sh_${randomBytes(24).toString('base64url')}`
    const jti = randomUUID()
    const nonce = randomBytes(16).toString('base64url')
    const endpointClaim = endpointClaimFor(endpoint, resource, boundedExp)

    shareHandles.set(handle, {
      handle,
      endpoint,
      endpointClaim,
      token,
      resource,
      docType,
      exp: boundedExp,
      jti,
      nonce,
      used: false,
      issuedAt: now
    })
    pruneShareHandles()

    return c.json({
      handle,
      exp: boundedExp,
      resource,
      docType,
      endpointClaim
    })
  })

  app.post('/shares/redeem', async (c) => {
    const body = await c.req.json().catch(() => null)
    if (!isRecord(body) || typeof body.handle !== 'string' || body.handle.length < 16) {
      return c.json({ code: 'INVALID_HANDLE', error: 'Share handle is invalid' }, 400)
    }

    pruneShareHandles()
    const handle = body.handle
    const replay = replayCache.get(handle)
    if (replay) {
      return c.json({ code: 'TOKEN_REPLAYED', error: 'Share handle was already redeemed' }, 409)
    }

    const record = shareHandles.get(handle)
    if (!record) {
      return c.json({ code: 'INVALID_HANDLE', error: 'Share handle not found' }, 404)
    }

    if (record.exp <= Date.now()) {
      shareHandles.delete(handle)
      return c.json({ code: 'TOKEN_EXPIRED', error: 'Share handle expired' }, 410)
    }
    if (record.used) {
      replayCache.set(handle, { jti: record.jti, expiresAt: record.exp })
      shareHandles.delete(handle)
      return c.json({ code: 'TOKEN_REPLAYED', error: 'Share handle was already redeemed' }, 409)
    }

    record.used = true
    replayCache.set(handle, { jti: record.jti, expiresAt: record.exp })
    shareHandles.delete(handle)

    return c.json({
      endpoint: record.endpoint,
      endpointClaim: record.endpointClaim,
      token: record.token,
      resource: record.resource,
      docType: record.docType,
      exp: record.exp,
      jti: record.jti,
      nonce: record.nonce
    })
  })

  let httpServer: ReturnType<typeof serve> | null = null
  let wss: WebSocketServer | null = null
  let sessionAuthInterval: ReturnType<typeof setInterval> | null = null
  let demoResetInterval: ReturnType<typeof setInterval> | null = null

  const start = async (): Promise<void> => {
    if (httpServer) return
    // 0307: an unauthenticated hub is an OPEN RELAY — anyone can read/write any
    // room. Never run this outside local development.
    if (!config.auth) {
      log.warn(
        '⚠️  AUTH DISABLED (auth: false): this hub is an OPEN RELAY. ' +
          'Every connection gets wildcard capabilities — any peer can read and ' +
          'write every room. Do NOT expose this hub to the internet. (0307)'
      )
    } else if (!config.hubDid && !config.publicUrl) {
      log.warn(
        'UCAN audience enforcement is OFF: neither hubDid nor publicUrl is ' +
          'configured, so tokens minted for other hubs are accepted here. ' +
          'Set hubDid (preferred) or publicUrl. (0307-B)'
      )
    }

    // Embedded OIDC provider (0338 Phase 3): the hub as an identity provider
    // for the org's other self-hosted apps. Opt-in; throws loud if misconfigured.
    if (config.identity?.oidcProvider?.enabled) {
      const mounted = await mountOidcProvider({
        app,
        config,
        storage,
        loadProfileClaims: async (did: string) => {
          const room = profileNodeIdForDid(did)
          const changes = await storage.getNodeChangesForNode(room, room)
          if (changes.length === 0) return null
          const merged: Record<string, unknown> = {}
          for (const ch of [...changes].sort((a, b) => a.lamportTime - b.lamportTime)) {
            Object.assign(merged, ch.payload.properties ?? {})
          }
          const name = typeof merged.displayName === 'string' ? merged.displayName : undefined
          const handle =
            typeof merged.atprotoHandle === 'string'
              ? merged.atprotoHandle
              : typeof merged.handle === 'string'
                ? merged.handle
                : undefined
          return {
            ...(name ? { name } : {}),
            ...(handle ? { preferred_username: handle } : {})
          }
        }
      })
      if (mounted) log.info(`OIDC provider mounted (issuer ${mounted.issuer})`)
    }

    telemetry.start()
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
    // Demo hub: guard the small disposable volume — watch disk usage and wipe
    // all user data on a fixed cadence so it can't grow unbounded (0291).
    if (demo && diskWatchdog) {
      diskWatchdog.start()
      demoResetInterval = setInterval(() => {
        storage
          .resetAllUserData()
          .then(({ nodeChanges, docStates }) => log.info('demo-reset', { nodeChanges, docStates }))
          .catch((err) =>
            log.error('demo-reset failed', {
              error: err instanceof Error ? err.message : String(err)
            })
          )
      }, demo.resetInterval)
      demoResetInterval.unref?.()
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

    sessionAuthInterval = setInterval(() => {
      for (const client of wss?.clients ?? []) {
        if (client.readyState !== 1) {
          continue
        }
        void enforceSocketTopicAuth(client)
      }
    }, 10_000)

    wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
      void (async () => {
        if (!rateLimiter.canAcceptConnection()) {
          ws.close(1013, 'Server at capacity')
          metrics.increment(HUB_METRICS.RATE_LIMIT_REJECTIONS)
          return
        }

        const session = await authenticateConnection(ws, req, config, revocation)
        if (!session) return
        socketSessions.set(ws, session)
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
          socketSessions.delete(ws)
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
              ws.send(JSON.stringify(buildWsError({ kind: 'error', message: check.reason })))
              return
            }

            const payload = safeParseJson(dataToString(data))
            if (!payload) return

            await messageRouter.dispatch(payload, { ws, session, authContext })
          })()
        })

        ws.on('close', finalize)
        ws.on('error', finalize)
      })()
    })
  }

  const stop = async (): Promise<void> => {
    if (sessionAuthInterval) {
      clearInterval(sessionAuthInterval)
      sessionAuthInterval = null
    }
    if (demoResetInterval) {
      clearInterval(demoResetInterval)
      demoResetInterval = null
    }
    diskWatchdog?.stop()

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

    telemetry.stop()
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
