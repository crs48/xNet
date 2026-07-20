/**
 * @xnetjs/hub - Hub configuration and instance types.
 */

import type { AtprotoIndexConfig } from './features/atproto-index'
import type { HubSubscriptionsConfig } from './features/hub-subscriber'
import type { CrawlConfig } from './services/crawl'
import type { FederationConfig } from './services/federation'
import type { ShardConfig } from './services/index-shards'
import type { YjsEnvelopeV2Verifier } from './services/relay'
import type { AbuseTelemetryReporter } from '@xnetjs/abuse'
import type { SyncReplicationConfig } from '@xnetjs/sync'

export type HubConfig = {
  /** WebSocket + HTTP port (default: 4444). */
  port: number
  /** Data directory for SQLite + blobs (default: ./xnet-hub-data). */
  dataDir: string
  /** Storage backend (default: 'sqlite'). */
  storage: 'sqlite' | 'memory'
  /** Enable UCAN authentication (default: true). */
  auth: boolean
  /** Maximum message size in bytes (default: 5MB). */
  maxMessageSize: number
  /** Maximum concurrent connections (default: 1000). */
  maxConnections: number
  /** Default storage quota per DID in bytes (default: 1GB). */
  defaultQuota: number
  /** Maximum backup blob size in bytes (default: 50MB). */
  maxBlobSize: number
  /** Awareness entry TTL in ms (default: 24 hours). */
  awarenessTtlMs: number
  /** Awareness cleanup interval in ms (default: 1 hour). */
  awarenessCleanupIntervalMs: number
  /** Max awareness users stored per room (default: 100). */
  awarenessMaxUsers: number
  /** Max awareness update or state payload size in bytes (default: 64KB). */
  awarenessMaxUpdateSize: number
  /** Document replication policy. */
  sync?: SyncReplicationConfig
  /** Programmatic sync envelope verification hooks. */
  syncVerification?: {
    verifyV2Envelope?: YjsEnvelopeV2Verifier
  }
  /** Optional privacy-preserving abuse telemetry collector. */
  telemetry?: AbuseTelemetryReporter
  /** Optional deployment-local salt for hashing peer identifiers in telemetry. */
  telemetryPeerHashSalt?: string
  /** Hub's own DID for UCAN audience verification (optional). */
  hubDid?: string
  /**
   * Delegation roots this hub trusts (exploration 0337). When set, a
   * presented UCAN is only honored if every root issuer of its proof chain
   * is in this list — a self-issued `{with:'*', can:'*'}` token roots at the
   * stranger who minted it and is rejected (the 0307 weakness). Unset
   * preserves the legacy accept-any-verified-token behavior.
   */
  trustedDids?: string[]
  /** Public hub URL for peer discovery (optional). */
  publicUrl?: string
  /**
   * Identity-provider features (0338 Phase 3). When `oidcProvider.enabled`, the
   * hub embeds `node-oidc-provider` (MIT) and becomes an OIDC provider for the
   * org's other self-hosted apps — the `tsidp` pattern. Opt-in only; requires
   * `auth: true` and a `publicUrl` (the issuer). Never the packaged default.
   */
  identity?: {
    oidcProvider?: {
      enabled: boolean
      /** Relying parties allowed to authenticate against this hub. */
      clients?: Array<{
        client_id: string
        client_secret?: string
        redirect_uris: string[]
        grant_types?: string[]
        response_types?: string[]
      }>
      /** JWKS for signing id_tokens; auto-generated ephemeral if omitted. */
      jwks?: { keys: unknown[] }
    }
    /**
     * Bring-your-own-OIDC inbound (0338 Phase 3): an org points its hub at an
     * existing IdP; a verified session admits a device into the account ledger.
     */
    byoOidc?: {
      issuer: string
      clientId: string
    }
  }
  /**
   * Web app base URL the share interstitial falls back to. A trailing `#`
   * marks a hash-routed deployment (default: https://xnet.fyi/app/#).
   */
  appUrl?: string
  /** Apple team-prefixed app id for Universal Links (TEAMID.bundle.id). */
  appleAppId?: string
  /** Android package name for App Links. */
  androidPackage?: string
  /** Android signing cert SHA-256 fingerprints for App Links. */
  androidCertSha256?: string[]
  /** Peer discovery TTL in ms (default: 7 days). */
  discoveryStaleTtlMs: number
  /** Peer discovery cleanup interval in ms (default: 6 hours). */
  discoveryCleanupIntervalMs: number
  /** Max peers stored for discovery (default: 10000). */
  discoveryMaxPeers: number
  /** Optional rate limit overrides. */
  rateLimit?: {
    perConnectionRate?: number
    /** Max node-changes per window per connection, across single and batched pushes (0357). */
    perConnectionChangeRate?: number
    maxConnections?: number
    maxMessageSize?: number
    windowMs?: number
  }
  /** Log level (default: 'info'). */
  logLevel: 'debug' | 'info' | 'warn' | 'error'
  /** Federation configuration (optional; merged over server defaults). */
  federation?: Partial<FederationConfig>
  /** Global shard configuration (optional; merged over server defaults). */
  shards?: Partial<ShardConfig>
  /** Crawl coordination configuration (optional; merged over server defaults). */
  crawl?: Partial<CrawlConfig>
  /** Public-interaction policy surface (0378/0383 W2; on in the community role). */
  publicInteractions?: { enabled: boolean }
  /** The atproto index engine (0374/0383 W3; the index role's plane). */
  atprotoIndex?: AtprotoIndexConfig
  /** Hub-to-hub Space subscriptions (0258/0383 W4; the gateway role's plane). */
  subscriptions?: HubSubscriptionsConfig
  /** Runtime metadata (platform info, region). */
  runtime?: {
    platform?: 'railway' | 'fly' | 'cloud-run' | 'fargate' | 'local' | 'unknown'
    region?: string
    machineId?: string
  }
  /** Shutdown grace period in ms (platform-specific). */
  shutdownGraceMs?: number
  /** Enable demo mode with restricted quotas and eviction. */
  demo?: boolean
  /** Demo mode overrides (applied when demo=true). */
  demoOverrides?: DemoOverrides
  /**
   * Named deployment role (explorations 0382/0383). A role is a config preset
   * expanded by `resolveConfig` — never a runtime branch of its own. Roles are
   * the ONLY supported feature combinations; arbitrary config remains possible
   * but unclaimed (the Elasticsearch `node.roles` posture).
   */
  role?: HubRole
}

/**
 * The named roles one hub binary can run as (exploration 0382: one binary,
 * many roles, monolith default). `gateway` arrives with the federation plane
 * (0383 W4); adding a role means adding a preset in `roles.ts`, never a
 * scattered ternary (0382's "demo ternaries" anti-pattern).
 */
export type HubRole = 'personal' | 'demo' | 'community' | 'index' | 'registry' | 'gateway'

export const DEFAULT_CONFIG: HubConfig = {
  port: 4444,
  dataDir: './xnet-hub-data',
  storage: 'sqlite',
  auth: true,
  maxMessageSize: 5 * 1024 * 1024,
  maxConnections: 1000,
  defaultQuota: 1024 * 1024 * 1024,
  maxBlobSize: 50 * 1024 * 1024,
  awarenessTtlMs: 24 * 60 * 60 * 1000,
  awarenessCleanupIntervalMs: 60 * 60 * 1000,
  awarenessMaxUsers: 100,
  awarenessMaxUpdateSize: 65_536,
  discoveryStaleTtlMs: 7 * 24 * 60 * 60 * 1000,
  discoveryCleanupIntervalMs: 6 * 60 * 60 * 1000,
  discoveryMaxPeers: 10000,
  logLevel: 'info',
  shutdownGraceMs: 8000
}

// ─── Demo Mode ──────────────────────────────────────────────

export type DemoOverrides = {
  /** Storage quota per user (bytes). Default: 10 MB. */
  quota: number
  /** Max documents per user. Default: 50. */
  maxDocs: number
  /** Max blob size (bytes). Default: 2 MB. */
  maxBlob: number
  /** Inactivity TTL before eviction (ms). Default: 24 hours. */
  evictionTtl: number
  /** How often to run eviction check (ms). Default: 1 hour. */
  evictionInterval: number
  /** Wipe all user data on this cadence (ms). Default: 24 hours. */
  resetInterval: number
  /** Volume capacity the disk watchdog guards (bytes). Default: 500 MB. */
  diskLimitBytes: number
}

export const DEMO_DEFAULTS: DemoOverrides = {
  quota: 10 * 1024 * 1024, // 10 MB
  maxDocs: 50,
  maxBlob: 2 * 1024 * 1024, // 2 MB
  evictionTtl: 24 * 60 * 60 * 1000, // 24 hours
  evictionInterval: 60 * 60 * 1000, // 1 hour
  resetInterval: 24 * 60 * 60 * 1000, // 24 hours
  diskLimitBytes: 500 * 1024 * 1024 // 500 MB (Railway demo volume)
}

export type HubInstance = {
  start(): Promise<void>
  stop(): Promise<void>
  readonly port: number
  readonly config: HubConfig
}
