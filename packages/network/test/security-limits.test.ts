import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { DEFAULT_LIMITS, STRICT_LIMITS, RELAXED_LIMITS } from '../src/security/limits'
import { ConnectionTracker } from '../src/security/tracker'

describe('ConnectionLimits presets', () => {
  it('STRICT_LIMITS should be more restrictive than DEFAULT', () => {
    expect(STRICT_LIMITS.maxConnections).toBeLessThan(DEFAULT_LIMITS.maxConnections)
    expect(STRICT_LIMITS.maxConnectionsPerPeer).toBeLessThan(DEFAULT_LIMITS.maxConnectionsPerPeer)
  })

  it('RELAXED_LIMITS should be more permissive than DEFAULT', () => {
    expect(RELAXED_LIMITS.maxConnections).toBeGreaterThan(DEFAULT_LIMITS.maxConnections)
    expect(RELAXED_LIMITS.maxConnectionsPerIP).toBeGreaterThan(DEFAULT_LIMITS.maxConnectionsPerIP)
  })
})

describe('ConnectionTracker', () => {
  let tracker: ConnectionTracker

  beforeEach(() => {
    vi.useFakeTimers()
    tracker = new ConnectionTracker(DEFAULT_LIMITS)
  })

  afterEach(() => {
    tracker.destroy()
    vi.useRealTimers()
  })

  describe('canAcceptConnection', () => {
    it('should allow connections under limit', () => {
      const result = tracker.canAcceptConnection('peer1', '192.168.1.1')
      expect(result.allowed).toBe(true)
    })

    it('should reject when max connections reached', () => {
      for (let i = 0; i < DEFAULT_LIMITS.maxConnections; i++) {
        tracker.addConnection(`conn-${i}`, `peer-${i}`, `10.0.${Math.floor(i / 5)}.${(i % 5) + 1}`)
      }

      const result = tracker.canAcceptConnection('new-peer', '172.16.0.1')
      expect(result.allowed).toBe(false)
      expect(result.reason).toBe('max_connections_reached')
    })

    it('should reject when per-peer limit reached', () => {
      for (let i = 0; i < DEFAULT_LIMITS.maxConnectionsPerPeer; i++) {
        tracker.addConnection(`conn-${i}`, 'same-peer', `192.168.1.${i + 1}`)
      }

      const result = tracker.canAcceptConnection('same-peer', '192.168.1.100')
      expect(result.allowed).toBe(false)
      expect(result.reason).toBe('max_connections_per_peer_reached')
    })

    it('should reject when per-IP limit reached', () => {
      for (let i = 0; i < DEFAULT_LIMITS.maxConnectionsPerIP; i++) {
        tracker.addConnection(`conn-${i}`, `peer-${i}`, '192.168.1.1')
      }

      const result = tracker.canAcceptConnection('new-peer', '192.168.1.1')
      expect(result.allowed).toBe(false)
      expect(result.reason).toBe('max_connections_per_ip_reached')
    })

    it('should reject when connection rate exceeded for a given IP', () => {
      // Use a custom tracker with high per-IP limit but low rate limit
      const customTracker = new ConnectionTracker({
        ...DEFAULT_LIMITS,
        maxConnectionsPerIP: 100, // Won't hit this
        maxConnectionsPerMinute: 5 // Will hit this
      })

      // Add 5 connections from same IP (hits rate limit)
      for (let i = 0; i < 5; i++) {
        customTracker.addConnection(`conn-${i}`, `peer-${i}`, '10.0.0.1')
      }

      const result = customTracker.canAcceptConnection('new-peer', '10.0.0.1')
      expect(result.allowed).toBe(false)
      expect(result.reason).toBe('connection_rate_exceeded')
      customTracker.destroy()
    })

    it('should allow after rate window expires', () => {
      for (let i = 0; i < DEFAULT_LIMITS.maxConnectionsPerMinute; i++) {
        tracker.addConnection(`conn-${i}`, `peer-${i}`, '10.0.0.1')
      }

      // Remove connections to free slots
      for (let i = 0; i < DEFAULT_LIMITS.maxConnectionsPerMinute; i++) {
        tracker.removeConnection(`conn-${i}`)
      }

      // Advance past the rate window
      vi.advanceTimersByTime(61_000)

      const result = tracker.canAcceptConnection('new-peer', '10.0.0.1')
      expect(result.allowed).toBe(true)
    })
  })

  describe('canOpenStream', () => {
    it('should allow streams under limit', () => {
      tracker.addConnection('conn-1', 'peer-1', '192.168.1.1')
      expect(tracker.canOpenStream('conn-1').allowed).toBe(true)
    })

    it('should reject when stream limit reached', () => {
      tracker.addConnection('conn-1', 'peer-1', '192.168.1.1')
      tracker.updateStreamCount('conn-1', DEFAULT_LIMITS.maxStreamsPerConnection)

      expect(tracker.canOpenStream('conn-1').allowed).toBe(false)
      expect(tracker.canOpenStream('conn-1').reason).toBe('max_streams_per_connection_reached')
    })

    it('should reject for unknown connection', () => {
      expect(tracker.canOpenStream('unknown').allowed).toBe(false)
      expect(tracker.canOpenStream('unknown').reason).toBe('connection_not_found')
    })
  })

  describe('removeConnection', () => {
    it('should free up slots when connection removed', () => {
      for (let i = 0; i < DEFAULT_LIMITS.maxConnectionsPerPeer; i++) {
        tracker.addConnection(`conn-${i}`, 'same-peer', `192.168.1.${i + 1}`)
      }

      tracker.removeConnection('conn-0')
      const result = tracker.canAcceptConnection('same-peer', '192.168.2.1')
      expect(result.allowed).toBe(true)
    })

    it('should clean up IP tracking', () => {
      tracker.addConnection('conn-1', 'peer-1', '192.168.1.1')
      tracker.removeConnection('conn-1')

      const stats = tracker.getStats()
      expect(stats.uniqueIPs).toBe(0)
      expect(stats.uniquePeers).toBe(0)
    })
  })

  describe('pending connections', () => {
    it('should track pending connections', () => {
      tracker.addPending('pending-1')
      expect(tracker.getStats().pendingConnections).toBe(1)
    })

    it('should reject when max pending reached', () => {
      for (let i = 0; i < DEFAULT_LIMITS.maxPendingConnections; i++) {
        tracker.addPending(`pending-${i}`)
      }

      const result = tracker.canAcceptConnection('new-peer', '192.168.1.1')
      expect(result.allowed).toBe(false)
      expect(result.reason).toBe('max_pending_connections_reached')
    })

    it('should auto-remove pending after timeout', () => {
      tracker.addPending('pending-1')
      vi.advanceTimersByTime(DEFAULT_LIMITS.pendingTimeout + 100)

      expect(tracker.getStats().pendingConnections).toBe(0)
    })

    it('should clear pending when connection established', () => {
      tracker.addPending('pending-1')
      tracker.addConnection('pending-1', 'peer-1', '192.168.1.1')

      expect(tracker.getStats().pendingConnections).toBe(0)
      expect(tracker.getStats().totalConnections).toBe(1)
    })
  })

  describe('getStats', () => {
    it('should return accurate statistics', () => {
      tracker.addConnection('c1', 'peer-1', '10.0.0.1')
      tracker.addConnection('c2', 'peer-2', '10.0.0.1')
      tracker.addConnection('c3', 'peer-2', '10.0.0.2')
      tracker.addPending('p1')

      const stats = tracker.getStats()
      expect(stats.totalConnections).toBe(3)
      expect(stats.pendingConnections).toBe(1)
      expect(stats.uniquePeers).toBe(2)
      expect(stats.uniqueIPs).toBe(2)
      expect(stats.connectionsPerMinute).toBe(3)
    })
  })
})
