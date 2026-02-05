import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { AutoBlocker } from '../src/security/auto-blocker'
import { PeerScorer } from '../src/security/peer-scorer'
import { DefaultConnectionGater } from '../src/security/gater'
import { DEFAULT_LIMITS } from '../src/security/limits'
import { configureSecurityLogger } from '../src/security/logging'

describe('AutoBlocker', () => {
  let gater: DefaultConnectionGater
  let blocker: AutoBlocker

  beforeEach(() => {
    vi.useFakeTimers()
    configureSecurityLogger({ console: false })
    gater = new DefaultConnectionGater(DEFAULT_LIMITS)
    blocker = new AutoBlocker(gater)
  })

  afterEach(() => {
    blocker.destroy()
    gater.destroy()
    vi.useRealTimers()
  })

  describe('recordEvent', () => {
    it('should not block below threshold', () => {
      blocker.recordEvent('peer1', 'invalid_signature')
      blocker.recordEvent('peer1', 'invalid_signature')
      expect(blocker.isBlocked('peer1')).toBe(false)
    })

    it('should block after threshold exceeded', () => {
      // invalid_signature threshold: 3 in 60s
      blocker.recordEvent('peer1', 'invalid_signature')
      blocker.recordEvent('peer1', 'invalid_signature')
      blocker.recordEvent('peer1', 'invalid_signature')

      expect(blocker.isBlocked('peer1')).toBe(true)
    })

    it('should respect time window', () => {
      blocker.recordEvent('peer1', 'invalid_signature')
      blocker.recordEvent('peer1', 'invalid_signature')

      // Move past the window
      vi.advanceTimersByTime(61_000)

      // Third event doesn't trigger (first two expired)
      blocker.recordEvent('peer1', 'invalid_signature')
      expect(blocker.isBlocked('peer1')).toBe(false)
    })

    it('should skip if already blocked', () => {
      blocker.blockPeer('peer1', { reason: 'test' })

      // Should not throw or create duplicate entries
      blocker.recordEvent('peer1', 'invalid_signature')
      expect(blocker.isBlocked('peer1')).toBe(true)
    })

    it('should use different thresholds per event type', () => {
      // rate_limit_exceeded needs 10 events
      for (let i = 0; i < 9; i++) {
        blocker.recordEvent('peer1', 'rate_limit_exceeded')
      }
      expect(blocker.isBlocked('peer1')).toBe(false)

      blocker.recordEvent('peer1', 'rate_limit_exceeded')
      expect(blocker.isBlocked('peer1')).toBe(true)
    })
  })

  describe('blockPeer', () => {
    it('should block with duration', () => {
      blocker.blockPeer('peer1', { reason: 'test', duration: 60_000 })
      expect(blocker.isBlocked('peer1')).toBe(true)

      vi.advanceTimersByTime(61_000)
      expect(blocker.isBlocked('peer1')).toBe(false)
    })

    it('should block permanently without duration', () => {
      blocker.blockPeer('peer1', { reason: 'test' })
      vi.advanceTimersByTime(365 * 24 * 60 * 60_000) // 1 year
      expect(blocker.isBlocked('peer1')).toBe(true)
    })

    it('should add to gater denylist', () => {
      blocker.blockPeer('peer1', { reason: 'test' })
      expect(gater.isDenylisted('peer1')).toBe(true)
    })

    it('should store block info', () => {
      blocker.blockPeer('peer1', {
        reason: 'invalid_signature',
        evidence: 'bad sig on change xyz',
        autoBlock: true
      })

      const info = blocker.getBlockInfo('peer1')
      expect(info).not.toBeNull()
      expect(info!.reason).toBe('invalid_signature')
      expect(info!.evidence).toContain('bad sig')
      expect(info!.autoBlock).toBe(true)
    })
  })

  describe('unblockPeer', () => {
    it('should unblock and remove from gater', () => {
      blocker.blockPeer('peer1', { reason: 'test' })
      blocker.unblockPeer('peer1')

      expect(blocker.isBlocked('peer1')).toBe(false)
      expect(gater.isDenylisted('peer1')).toBe(false)
    })

    it('should clear event history', () => {
      // Accumulate some events
      blocker.recordEvent('peer1', 'invalid_signature')
      blocker.recordEvent('peer1', 'invalid_signature')
      blocker.blockPeer('peer1', { reason: 'test' })
      blocker.unblockPeer('peer1')

      // Events should be cleared, so 1 more shouldn't trigger
      blocker.recordEvent('peer1', 'invalid_signature')
      expect(blocker.isBlocked('peer1')).toBe(false)
    })
  })

  describe('getBlockedPeers', () => {
    it('should return all blocked peers', () => {
      blocker.blockPeer('peer1', { reason: 'a', autoBlock: true })
      blocker.blockPeer('peer2', { reason: 'b', autoBlock: false })

      const blocked = blocker.getBlockedPeers()
      expect(blocked).toHaveLength(2)
      expect(blocked.map((b) => b.peerId)).toContain('peer1')
      expect(blocked.map((b) => b.peerId)).toContain('peer2')
    })

    it('should exclude expired blocks', () => {
      blocker.blockPeer('peer1', { reason: 'test', duration: 1000 })
      vi.advanceTimersByTime(1001)

      expect(blocker.getBlockedPeers()).toHaveLength(0)
    })
  })

  describe('getStats', () => {
    it('should return correct statistics', () => {
      blocker.blockPeer('peer1', { reason: 'auto', autoBlock: true })
      blocker.blockPeer('peer2', { reason: 'manual', autoBlock: false })
      blocker.blockPeer('peer3', { reason: 'auto2', autoBlock: true })

      const stats = blocker.getStats()
      expect(stats.totalBlocked).toBe(3)
      expect(stats.autoBlocked).toBe(2)
      expect(stats.manualBlocked).toBe(1)
    })
  })

  describe('integration with PeerScorer', () => {
    it('should block when score drops below disconnect threshold', () => {
      const scorer = new PeerScorer({ decayIntervalMs: 100_000 })
      const blockerWithScorer = new AutoBlocker(gater, scorer)

      // Drive score below disconnect threshold (-50)
      scorer.recordInvalidSignature('bad-peer') // -50
      scorer.recordSyncFailure('bad-peer') // -2 more

      expect(blockerWithScorer.isBlocked('bad-peer')).toBe(true)

      scorer.destroy()
      blockerWithScorer.destroy()
    })
  })

  describe('custom thresholds', () => {
    it('should accept custom thresholds', () => {
      const customBlocker = new AutoBlocker(gater, undefined, {
        thresholds: {
          invalid_signature: { count: 1, window: 60_000, duration: 60_000 }
        }
      })

      // Single event should trigger with custom threshold
      customBlocker.recordEvent('peer1', 'invalid_signature')
      expect(customBlocker.isBlocked('peer1')).toBe(true)

      customBlocker.destroy()
    })
  })
})
