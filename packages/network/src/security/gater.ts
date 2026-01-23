/**
 * ConnectionGater - decides whether to accept/reject connections.
 *
 * Combines limit checking, denylist/allowlist, and security logging.
 */

import type { ConnectionLimits } from './limits'
import { ConnectionTracker } from './tracker'
import { logSecurityEvent } from './logging'

/**
 * Connection gater interface.
 * Can be used to gate both inbound and outbound connections.
 */
export interface ConnectionGater {
  /** Called before accepting inbound connection from an IP */
  interceptAccept(ip: string): boolean
  /** Called before dialing outbound to a peer */
  interceptDial(peerId: string): boolean
  /** Called after security negotiation to verify peer identity */
  interceptSecured(peerId: string, ip: string, direction: 'inbound' | 'outbound'): boolean
  /** Called before opening a stream on a connection */
  interceptStream(connectionId: string, protocol: string): boolean
}

/**
 * Default connection gater implementation.
 */
export class DefaultConnectionGater implements ConnectionGater {
  private tracker: ConnectionTracker
  private denylist = new Set<string>()
  private allowlist = new Set<string>()

  constructor(limits: ConnectionLimits, options?: { denylist?: string[]; allowlist?: string[] }) {
    this.tracker = new ConnectionTracker(limits)

    if (options?.denylist) {
      for (const id of options.denylist) this.denylist.add(id)
    }
    if (options?.allowlist) {
      for (const id of options.allowlist) this.allowlist.add(id)
    }
  }

  interceptAccept(ip: string): boolean {
    if (this.denylist.has(ip)) {
      logSecurityEvent({
        eventType: 'connection_flood',
        severity: 'medium',
        ip,
        actionTaken: 'blocked',
        details: { reason: 'ip_denylisted' }
      })
      return false
    }
    return true
  }

  interceptDial(peerId: string): boolean {
    return !this.denylist.has(peerId)
  }

  interceptSecured(peerId: string, ip: string, direction: 'inbound' | 'outbound'): boolean {
    if (this.denylist.has(peerId)) {
      logSecurityEvent({
        eventType: 'connection_flood',
        severity: 'medium',
        peerId,
        ip,
        actionTaken: 'blocked',
        details: { direction, reason: 'peer_denylisted' }
      })
      return false
    }

    // Allowlisted peers bypass limits
    if (this.allowlist.has(peerId)) return true

    const check = this.tracker.canAcceptConnection(peerId, ip)
    if (!check.allowed) {
      logSecurityEvent({
        eventType: 'connection_flood',
        severity: 'low',
        peerId,
        ip,
        actionTaken: 'blocked',
        details: { direction, reason: check.reason }
      })
      return false
    }

    // Register the connection
    this.tracker.addConnection(`${peerId}-${Date.now()}`, peerId, ip)
    return true
  }

  interceptStream(connectionId: string, protocol: string): boolean {
    const check = this.tracker.canOpenStream(connectionId)
    if (!check.allowed) {
      logSecurityEvent({
        eventType: 'stream_exhaustion',
        severity: 'low',
        actionTaken: 'blocked',
        details: { connectionId: connectionId.slice(0, 16), protocol, reason: check.reason }
      })
      return false
    }

    this.tracker.updateStreamCount(connectionId, 1)
    return true
  }

  // ============ List Management ============

  addToDenylist(id: string, options?: { duration?: number }): void {
    this.denylist.add(id)
    if (options?.duration) {
      setTimeout(() => this.denylist.delete(id), options.duration)
    }
  }

  removeFromDenylist(id: string): void {
    this.denylist.delete(id)
  }

  addToAllowlist(peerId: string): void {
    this.allowlist.add(peerId)
  }

  removeFromAllowlist(peerId: string): void {
    this.allowlist.delete(peerId)
  }

  isDenylisted(id: string): boolean {
    return this.denylist.has(id)
  }

  isAllowlisted(peerId: string): boolean {
    return this.allowlist.has(peerId)
  }

  // ============ Stats ============

  getTracker(): ConnectionTracker {
    return this.tracker
  }

  getStats() {
    return {
      ...this.tracker.getStats(),
      denylistSize: this.denylist.size,
      allowlistSize: this.allowlist.size
    }
  }

  /** Clean up timers. */
  destroy(): void {
    this.tracker.destroy()
  }
}
