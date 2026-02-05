/**
 * @xnet/hub - Hub configuration and instance types.
 */

import type { CrawlConfig } from './services/crawl'
import type { FederationConfig } from './services/federation'
import type { ShardConfig } from './services/index-shards'

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
  /** Hub's own DID for UCAN audience verification (optional). */
  hubDid?: string
  /** Public hub URL for peer discovery (optional). */
  publicUrl?: string
  /** Peer discovery TTL in ms (default: 7 days). */
  discoveryStaleTtlMs: number
  /** Peer discovery cleanup interval in ms (default: 6 hours). */
  discoveryCleanupIntervalMs: number
  /** Max peers stored for discovery (default: 10000). */
  discoveryMaxPeers: number
  /** Optional rate limit overrides. */
  rateLimit?: {
    perConnectionRate?: number
    maxConnections?: number
    maxMessageSize?: number
    windowMs?: number
  }
  /** Log level (default: 'info'). */
  logLevel: 'debug' | 'info' | 'warn' | 'error'
  /** Federation configuration (optional). */
  federation?: FederationConfig
  /** Global shard configuration (optional). */
  shards?: ShardConfig
  /** Crawl coordination configuration (optional). */
  crawl?: CrawlConfig
  /** Runtime metadata (platform info, region). */
  runtime?: {
    platform?: 'railway' | 'fly' | 'local' | 'unknown'
    region?: string
    machineId?: string
  }
  /** Shutdown grace period in ms (platform-specific). */
  shutdownGraceMs?: number
  /** Enable demo mode with restricted quotas and eviction. */
  demo?: boolean
  /** Demo mode overrides (applied when demo=true). */
  demoOverrides?: DemoOverrides
}

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
}

export const DEMO_DEFAULTS: DemoOverrides = {
  quota: 10 * 1024 * 1024, // 10 MB
  maxDocs: 50,
  maxBlob: 2 * 1024 * 1024, // 2 MB
  evictionTtl: 24 * 60 * 60 * 1000, // 24 hours
  evictionInterval: 60 * 60 * 1000 // 1 hour
}

export type HubInstance = {
  start(): Promise<void>
  stop(): Promise<void>
  readonly port: number
  readonly config: HubConfig
}
