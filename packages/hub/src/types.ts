/**
 * @xnet/hub - Hub configuration and instance types.
 */

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
  /** Optional rate limit overrides. */
  rateLimit?: {
    perConnectionRate?: number
    maxConnections?: number
    maxMessageSize?: number
    windowMs?: number
  }
  /** Log level (default: 'info'). */
  logLevel: 'debug' | 'info' | 'warn' | 'error'
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
  logLevel: 'info'
}

export type HubInstance = {
  start(): Promise<void>
  stop(): Promise<void>
  readonly port: number
  readonly config: HubConfig
}
