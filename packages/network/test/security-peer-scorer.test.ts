import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { PeerScorer, DEFAULT_WEIGHTS, DEFAULT_THRESHOLDS } from '../src/security/peer-scorer'
import { configureSecurityLogger } from '../src/security/logging'

describe('PeerScorer', () => {
  let scorer: PeerScorer

  beforeEach(() => {
    configureSecurityLogger({ console: false })
    scorer = new PeerScorer({ decayIntervalMs: 100_000 }) // Long interval to avoid interference
  })

  afterEach(() => {
    scorer.destroy()
  })

  describe('score calculation', () => {
    it('should start at 0', () => {
      expect(scorer.getScore('peer1')).toBe(0)
    })

    it('should increase on sync success', () => {
      scorer.recordSyncSuccess('peer1')
      expect(scorer.getScore('peer1')).toBe(DEFAULT_WEIGHTS.syncSuccess)
    })

    it('should increase on valid changes', () => {
      scorer.recordValidChange('peer1', 10)
      expect(scorer.getScore('peer1')).toBe(DEFAULT_WEIGHTS.validChange * 10)
    })

    it('should decrease on sync failure', () => {
      scorer.recordSyncFailure('peer1')
      expect(scorer.getScore('peer1')).toBe(DEFAULT_WEIGHTS.syncFailure)
    })

    it('should decrease heavily on invalid signature', () => {
      scorer.recordInvalidSignature('peer1')
      expect(scorer.getScore('peer1')).toBe(DEFAULT_WEIGHTS.invalidSignature)
    })

    it('should decrease on invalid data', () => {
      scorer.recordInvalidData('peer1')
      expect(scorer.getScore('peer1')).toBe(DEFAULT_WEIGHTS.invalidData)
    })

    it('should decrease on rate limit violations', () => {
      scorer.recordRateLimitViolation('peer1')
      expect(scorer.getScore('peer1')).toBe(DEFAULT_WEIGHTS.rateLimitViolation)
    })

    it('should add low-latency bonus when < 100ms', () => {
      scorer.recordLatency('peer1', 50)
      expect(scorer.getScore('peer1')).toBe(DEFAULT_WEIGHTS.lowLatency)
    })

    it('should not add latency bonus when >= 100ms', () => {
      scorer.recordLatency('peer1', 150)
      expect(scorer.getScore('peer1')).toBe(0)
    })

    it('should penalize multiple IPs (Sybil indicator)', () => {
      scorer.recordIP('peer1', '10.0.0.1')
      expect(scorer.getScore('peer1')).toBe(0) // First IP is fine

      scorer.recordIP('peer1', '10.0.0.2')
      expect(scorer.getScore('peer1')).toBe(DEFAULT_WEIGHTS.ipColocation) // Penalty for 2nd IP
    })

    it('should clamp score to [-100, 100]', () => {
      // Drive score very negative
      for (let i = 0; i < 10; i++) scorer.recordInvalidSignature('peer1')
      expect(scorer.getScore('peer1')).toBe(-100)

      // Drive score very positive
      for (let i = 0; i < 500; i++) scorer.recordSyncSuccess('peer2')
      expect(scorer.getScore('peer2')).toBe(100)
    })

    it('should combine positive and negative factors', () => {
      scorer.recordSyncSuccess('peer1') // +0.5
      scorer.recordSyncSuccess('peer1') // +0.5
      scorer.recordSyncFailure('peer1') // -2
      // Total: 0.5 + 0.5 + (-2) = -1
      expect(scorer.getScore('peer1')).toBeCloseTo(-1)
    })
  })

  describe('score data access', () => {
    it('should return null for unknown peers', () => {
      expect(scorer.getScoreData('unknown')).toBeNull()
    })

    it('should return full score data', () => {
      scorer.recordSyncSuccess('peer1')
      const data = scorer.getScoreData('peer1')
      expect(data).not.toBeNull()
      expect(data!.peerId).toBe('peer1')
      expect(data!.metrics.syncSuccesses).toBe(1)
    })

    it('should sort all scores descending', () => {
      scorer.recordSyncSuccess('peer-high') // +0.5
      scorer.recordSyncFailure('peer-low') // -2
      scorer.recordSyncSuccess('peer-mid')
      scorer.recordSyncFailure('peer-mid') // +0.5 - 2 = -1.5

      const all = scorer.getAllScores()
      expect(all[0].peerId).toBe('peer-high')
      expect(all[all.length - 1].peerId).toBe('peer-low')
    })

    it('should get peers above threshold', () => {
      scorer.recordSyncSuccess('good')
      scorer.recordSyncFailure('bad')

      const above = scorer.getPeersAbove(0)
      expect(above).toContain('good')
      expect(above).not.toContain('bad')
    })

    it('should get peers below threshold', () => {
      scorer.recordSyncSuccess('good')
      scorer.recordSyncFailure('bad')

      const below = scorer.getPeersBelow(0)
      expect(below).toContain('bad')
      expect(below).not.toContain('good')
    })
  })

  describe('decay', () => {
    it('should decay positive scores towards 0', () => {
      scorer.recordSyncSuccess('peer1')
      const before = scorer.getScore('peer1')
      expect(before).toBeGreaterThan(0)

      scorer.forceDecay(0.5)
      expect(scorer.getScore('peer1')).toBeCloseTo(before * 0.5)
    })

    it('should decay negative scores towards 0', () => {
      scorer.recordSyncFailure('peer1')
      const before = scorer.getScore('peer1')
      expect(before).toBeLessThan(0)

      scorer.forceDecay(0.5)
      expect(scorer.getScore('peer1')).toBeCloseTo(before * 0.5)
    })
  })

  describe('threshold events', () => {
    it('should emit score-below-disconnect', () => {
      const handler = vi.fn()
      scorer.on('score-below-disconnect', handler)

      // Drive score below -50
      scorer.recordInvalidSignature('peer1') // -50
      scorer.recordSyncFailure('peer1') // -2 more

      expect(handler).toHaveBeenCalledWith('peer1', expect.any(Number))
      expect(handler.mock.calls[0][1]).toBeLessThan(DEFAULT_THRESHOLDS.disconnect)
    })

    it('should emit score-below-throttle', () => {
      const handler = vi.fn()
      scorer.on('score-below-throttle', handler)

      // Drive score to around -25 (between throttle and disconnect)
      scorer.recordInvalidData('peer1') // -10
      scorer.recordInvalidData('peer1') // -10
      scorer.recordRateLimitViolation('peer1') // -5

      expect(handler).toHaveBeenCalled()
    })

    it('should be removable with off()', () => {
      const handler = vi.fn()
      scorer.on('score-below-disconnect', handler)
      scorer.off('score-below-disconnect', handler)

      scorer.recordInvalidSignature('peer1')
      scorer.recordSyncFailure('peer1')

      expect(handler).not.toHaveBeenCalled()
    })
  })

  describe('uptime tracking', () => {
    it('should cap uptime bonus at 10', () => {
      // Very long uptime: 10+ minutes
      scorer.recordUptime('peer1', 20 * 60_000) // 20 minutes
      // Score should be capped at uptime weight * 10 = 0.01 * 10 = 0.1... wait
      // Actually: min(10, (uptime/60000) * weight) = min(10, 20 * 0.01) = min(10, 0.2) = 0.2
      expect(scorer.getScore('peer1')).toBeCloseTo(0.2)

      // Even with extreme uptime the cap is 10
      scorer.recordUptime('peer2', 100_000 * 60_000)
      expect(scorer.getScore('peer2')).toBeCloseTo(10)
    })
  })
})
