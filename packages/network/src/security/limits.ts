/**
 * Connection and resource limits.
 * First line of defense against DoS / resource exhaustion.
 */

export interface ConnectionLimits {
  // ============ Connection Limits ============

  /** Maximum total connections (default: 100) */
  maxConnections: number

  /** Maximum connections per peer (default: 2) */
  maxConnectionsPerPeer: number

  /** Maximum connections from same IP (default: 5) */
  maxConnectionsPerIP: number

  /** Maximum pending (negotiating) connections (default: 20) */
  maxPendingConnections: number

  // ============ Stream Limits ============

  /** Maximum streams per connection (default: 100) */
  maxStreamsPerConnection: number

  /** Maximum inbound streams per connection (default: 50) */
  maxInboundStreamsPerConnection: number

  /** Maximum streams per protocol (default: 20) */
  maxStreamsPerProtocol: number

  // ============ Rate Limits ============

  /** Maximum new connections per minute (default: 30) */
  maxConnectionsPerMinute: number

  /** Maximum new streams per minute per connection (default: 60) */
  maxStreamsPerMinute: number

  // ============ Timeouts ============

  /** Connection handshake timeout in ms (default: 30000) */
  connectionTimeout: number

  /** Stream idle timeout in ms (default: 60000) */
  streamIdleTimeout: number

  /** Pending connection timeout in ms (default: 10000) */
  pendingTimeout: number

  // ============ Memory Limits ============

  /** Maximum memory per connection in bytes (default: 16MB) */
  maxMemoryPerConnection: number

  /** Maximum total memory for connections in bytes (default: 256MB) */
  maxTotalMemory: number
}

/** Default connection limits (conservative). */
export const DEFAULT_LIMITS: ConnectionLimits = {
  maxConnections: 100,
  maxConnectionsPerPeer: 2,
  maxConnectionsPerIP: 5,
  maxPendingConnections: 20,

  maxStreamsPerConnection: 100,
  maxInboundStreamsPerConnection: 50,
  maxStreamsPerProtocol: 20,

  maxConnectionsPerMinute: 30,
  maxStreamsPerMinute: 60,

  connectionTimeout: 30_000,
  streamIdleTimeout: 60_000,
  pendingTimeout: 10_000,

  maxMemoryPerConnection: 16 * 1024 * 1024,
  maxTotalMemory: 256 * 1024 * 1024
}

/** Stricter limits for resource-constrained environments (mobile, etc.). */
export const STRICT_LIMITS: ConnectionLimits = {
  ...DEFAULT_LIMITS,
  maxConnections: 50,
  maxConnectionsPerPeer: 1,
  maxConnectionsPerIP: 3,
  maxPendingConnections: 10,
  maxStreamsPerConnection: 50,
  maxConnectionsPerMinute: 15
}

/** Relaxed limits for trusted environments (local dev, private network). */
export const RELAXED_LIMITS: ConnectionLimits = {
  ...DEFAULT_LIMITS,
  maxConnections: 200,
  maxConnectionsPerPeer: 4,
  maxConnectionsPerIP: 10,
  maxPendingConnections: 50,
  maxStreamsPerConnection: 200,
  maxConnectionsPerMinute: 60
}
