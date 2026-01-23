/**
 * ConnectionTracker - tracks active connections and enforces limits.
 */

import type { ConnectionLimits } from './limits'

export interface ConnectionInfo {
  peerId: string
  ip: string
  connectedAt: number
  streamCount: number
}

export interface ConnectionStats {
  totalConnections: number
  pendingConnections: number
  uniquePeers: number
  uniqueIPs: number
  connectionsPerMinute: number
}

export class ConnectionTracker {
  private connections = new Map<string, ConnectionInfo>()
  private pendingConnections = new Set<string>()
  private connectionsByPeer = new Map<string, Set<string>>()
  private connectionsByIP = new Map<string, Set<string>>()
  private recentConnections: Array<{ timestamp: number; ip: string }> = []
  private pendingTimers = new Map<string, ReturnType<typeof setTimeout>>()

  constructor(private limits: ConnectionLimits) {}

  // ============ Limit Checks ============

  /** Check if a new connection can be accepted. */
  canAcceptConnection(peerId: string, ip: string): { allowed: boolean; reason?: string } {
    if (this.connections.size >= this.limits.maxConnections) {
      return { allowed: false, reason: 'max_connections_reached' }
    }

    if (this.pendingConnections.size >= this.limits.maxPendingConnections) {
      return { allowed: false, reason: 'max_pending_connections_reached' }
    }

    const peerConnections = this.connectionsByPeer.get(peerId)
    if (peerConnections && peerConnections.size >= this.limits.maxConnectionsPerPeer) {
      return { allowed: false, reason: 'max_connections_per_peer_reached' }
    }

    const ipConnections = this.connectionsByIP.get(ip)
    if (ipConnections && ipConnections.size >= this.limits.maxConnectionsPerIP) {
      return { allowed: false, reason: 'max_connections_per_ip_reached' }
    }

    const recentCount = this.getRecentConnectionCount(ip)
    if (recentCount >= this.limits.maxConnectionsPerMinute) {
      return { allowed: false, reason: 'connection_rate_exceeded' }
    }

    return { allowed: true }
  }

  /** Check if a new stream can be opened on a connection. */
  canOpenStream(connectionId: string): { allowed: boolean; reason?: string } {
    const conn = this.connections.get(connectionId)
    if (!conn) {
      return { allowed: false, reason: 'connection_not_found' }
    }

    if (conn.streamCount >= this.limits.maxStreamsPerConnection) {
      return { allowed: false, reason: 'max_streams_per_connection_reached' }
    }

    return { allowed: true }
  }

  // ============ Connection Lifecycle ============

  /** Mark a connection as pending (negotiating). */
  addPending(connectionId: string): void {
    this.pendingConnections.add(connectionId)

    const timer = setTimeout(() => {
      this.pendingConnections.delete(connectionId)
      this.pendingTimers.delete(connectionId)
    }, this.limits.pendingTimeout)

    this.pendingTimers.set(connectionId, timer)
  }

  /** Register a successfully established connection. */
  addConnection(connectionId: string, peerId: string, ip: string): void {
    // Remove from pending
    this.pendingConnections.delete(connectionId)
    const timer = this.pendingTimers.get(connectionId)
    if (timer) {
      clearTimeout(timer)
      this.pendingTimers.delete(connectionId)
    }

    this.connections.set(connectionId, {
      peerId,
      ip,
      connectedAt: Date.now(),
      streamCount: 0
    })

    // Track by peer
    let peerConns = this.connectionsByPeer.get(peerId)
    if (!peerConns) {
      peerConns = new Set()
      this.connectionsByPeer.set(peerId, peerConns)
    }
    peerConns.add(connectionId)

    // Track by IP
    let ipConns = this.connectionsByIP.get(ip)
    if (!ipConns) {
      ipConns = new Set()
      this.connectionsByIP.set(ip, ipConns)
    }
    ipConns.add(connectionId)

    // Track for rate limiting
    this.recentConnections.push({ timestamp: Date.now(), ip })
    this.pruneRecentConnections()
  }

  /** Remove a closed connection. */
  removeConnection(connectionId: string): void {
    const conn = this.connections.get(connectionId)
    if (!conn) return

    this.connections.delete(connectionId)

    const peerConns = this.connectionsByPeer.get(conn.peerId)
    if (peerConns) {
      peerConns.delete(connectionId)
      if (peerConns.size === 0) this.connectionsByPeer.delete(conn.peerId)
    }

    const ipConns = this.connectionsByIP.get(conn.ip)
    if (ipConns) {
      ipConns.delete(connectionId)
      if (ipConns.size === 0) this.connectionsByIP.delete(conn.ip)
    }
  }

  /** Update stream count for a connection. */
  updateStreamCount(connectionId: string, delta: number): void {
    const conn = this.connections.get(connectionId)
    if (conn) {
      conn.streamCount = Math.max(0, conn.streamCount + delta)
    }
  }

  // ============ Stats ============

  getStats(): ConnectionStats {
    return {
      totalConnections: this.connections.size,
      pendingConnections: this.pendingConnections.size,
      uniquePeers: this.connectionsByPeer.size,
      uniqueIPs: this.connectionsByIP.size,
      connectionsPerMinute: this.getRecentConnectionCount()
    }
  }

  /** Get connection info by ID. */
  getConnection(connectionId: string): ConnectionInfo | undefined {
    return this.connections.get(connectionId)
  }

  /** Clean up all timers. */
  destroy(): void {
    for (const timer of this.pendingTimers.values()) {
      clearTimeout(timer)
    }
    this.pendingTimers.clear()
  }

  // ============ Private ============

  private getRecentConnectionCount(ip?: string): number {
    const oneMinuteAgo = Date.now() - 60_000
    return this.recentConnections.filter((c) => c.timestamp > oneMinuteAgo && (!ip || c.ip === ip))
      .length
  }

  private pruneRecentConnections(): void {
    const oneMinuteAgo = Date.now() - 60_000
    this.recentConnections = this.recentConnections.filter((c) => c.timestamp > oneMinuteAgo)
  }
}
