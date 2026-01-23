import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { DefaultConnectionGater } from '../src/security/gater'
import { DEFAULT_LIMITS } from '../src/security/limits'
import { configureSecurityLogger } from '../src/security/logging'

describe('DefaultConnectionGater', () => {
  let gater: DefaultConnectionGater

  beforeEach(() => {
    // Suppress console output during tests
    configureSecurityLogger({ console: false })
    gater = new DefaultConnectionGater(DEFAULT_LIMITS)
  })

  afterEach(() => {
    gater.destroy()
  })

  describe('interceptAccept', () => {
    it('should allow non-denylisted IPs', () => {
      expect(gater.interceptAccept('192.168.1.1')).toBe(true)
    })

    it('should block denylisted IPs', () => {
      gater.addToDenylist('192.168.1.1')
      expect(gater.interceptAccept('192.168.1.1')).toBe(false)
    })
  })

  describe('interceptDial', () => {
    it('should allow non-denylisted peers', () => {
      expect(gater.interceptDial('peer-123')).toBe(true)
    })

    it('should block denylisted peers', () => {
      gater.addToDenylist('peer-123')
      expect(gater.interceptDial('peer-123')).toBe(false)
    })
  })

  describe('interceptSecured', () => {
    it('should allow normal connections', () => {
      expect(gater.interceptSecured('peer-1', '10.0.0.1', 'inbound')).toBe(true)
    })

    it('should block denylisted peers', () => {
      gater.addToDenylist('bad-peer')
      expect(gater.interceptSecured('bad-peer', '10.0.0.1', 'inbound')).toBe(false)
    })

    it('should bypass limits for allowlisted peers', () => {
      // Fill up connections to limit
      for (let i = 0; i < DEFAULT_LIMITS.maxConnections; i++) {
        gater.interceptSecured(`peer-${i}`, `10.0.${Math.floor(i / 5)}.${(i % 5) + 1}`, 'inbound')
      }

      // Regular peer should be blocked
      expect(gater.interceptSecured('regular-peer', '172.16.0.1', 'inbound')).toBe(false)

      // Allowlisted peer still gets through
      gater.addToAllowlist('vip-peer')
      expect(gater.interceptSecured('vip-peer', '172.16.0.2', 'inbound')).toBe(true)
    })

    it('should enforce per-peer limits', () => {
      // maxConnectionsPerPeer = 2, so register 2 connections directly via tracker
      const tracker = gater.getTracker()
      tracker.addConnection('conn-a', 'same-peer', '10.0.0.1')
      tracker.addConnection('conn-b', 'same-peer', '10.0.0.2')

      // Third connection for same peer should be blocked
      expect(gater.interceptSecured('same-peer', '10.0.0.100', 'inbound')).toBe(false)
    })
  })

  describe('denylist management', () => {
    it('should add and remove from denylist', () => {
      gater.addToDenylist('peer-1')
      expect(gater.isDenylisted('peer-1')).toBe(true)

      gater.removeFromDenylist('peer-1')
      expect(gater.isDenylisted('peer-1')).toBe(false)
    })

    it('should support timed denylist entries', () => {
      vi.useFakeTimers()
      gater.addToDenylist('temp-block', { duration: 5000 })

      expect(gater.isDenylisted('temp-block')).toBe(true)
      vi.advanceTimersByTime(5001)
      expect(gater.isDenylisted('temp-block')).toBe(false)

      vi.useRealTimers()
    })
  })

  describe('allowlist management', () => {
    it('should add and remove from allowlist', () => {
      gater.addToAllowlist('trusted-peer')
      expect(gater.isAllowlisted('trusted-peer')).toBe(true)

      gater.removeFromAllowlist('trusted-peer')
      expect(gater.isAllowlisted('trusted-peer')).toBe(false)
    })
  })

  describe('constructor options', () => {
    it('should accept initial denylist', () => {
      const g = new DefaultConnectionGater(DEFAULT_LIMITS, {
        denylist: ['bad-1', 'bad-2']
      })
      expect(g.isDenylisted('bad-1')).toBe(true)
      expect(g.isDenylisted('bad-2')).toBe(true)
      g.destroy()
    })

    it('should accept initial allowlist', () => {
      const g = new DefaultConnectionGater(DEFAULT_LIMITS, {
        allowlist: ['vip-1']
      })
      expect(g.isAllowlisted('vip-1')).toBe(true)
      g.destroy()
    })
  })

  describe('getStats', () => {
    it('should return combined stats', () => {
      gater.addToDenylist('deny-1')
      gater.addToAllowlist('allow-1')
      gater.interceptSecured('peer-1', '10.0.0.1', 'inbound')

      const stats = gater.getStats()
      expect(stats.denylistSize).toBe(1)
      expect(stats.allowlistSize).toBe(1)
      expect(stats.totalConnections).toBe(1)
    })
  })
})
