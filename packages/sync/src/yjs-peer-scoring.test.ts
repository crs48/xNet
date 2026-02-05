/**
 * Tests for Yjs Peer Scoring
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { YjsPeerScorer, DEFAULT_YJS_SCORING_CONFIG } from './yjs-peer-scoring'

describe('YjsPeerScorer', () => {
  describe('initial state', () => {
    it('starts peers at score 100', () => {
      const scorer = new YjsPeerScorer()
      expect(scorer.getScore('peer-1')).toBe(100)
      expect(scorer.getScore('unknown-peer')).toBe(100)
    })

    it('returns allow action for new peers', () => {
      const scorer = new YjsPeerScorer()
      expect(scorer.getPeerAction('peer-1')).toBe('allow')
    })

    it('has no metrics for new peers', () => {
      const scorer = new YjsPeerScorer()
      expect(scorer.getMetrics('peer-1')).toBeUndefined()
    })
  })

  describe('penalize', () => {
    it('deducts points on violation', () => {
      const scorer = new YjsPeerScorer()
      scorer.penalize('peer-1', 'invalidSignature')
      expect(scorer.getScore('peer-1')).toBe(70) // 100 - 30
    })

    it('deducts correct points for each violation type', () => {
      const scorer = new YjsPeerScorer()
      const penalties = DEFAULT_YJS_SCORING_CONFIG.penalties

      scorer.penalize('p1', 'invalidSignature')
      expect(scorer.getScore('p1')).toBe(100 - penalties.invalidSignature)

      scorer.penalize('p2', 'oversizedUpdate')
      expect(scorer.getScore('p2')).toBe(100 - penalties.oversizedUpdate)

      scorer.penalize('p3', 'rateExceeded')
      expect(scorer.getScore('p3')).toBe(100 - penalties.rateExceeded)

      scorer.penalize('p4', 'unsignedUpdate')
      expect(scorer.getScore('p4')).toBe(100 - penalties.unsignedUpdate)

      scorer.penalize('p5', 'unattestedClientId')
      expect(scorer.getScore('p5')).toBe(100 - penalties.unattestedClientId)
    })

    it('accumulates penalties', () => {
      const scorer = new YjsPeerScorer()
      scorer.penalize('peer-1', 'oversizedUpdate') // -10
      scorer.penalize('peer-1', 'rateExceeded') // -5
      expect(scorer.getScore('peer-1')).toBe(85) // 100 - 10 - 5
    })

    it('does not go below 0', () => {
      const scorer = new YjsPeerScorer()
      for (let i = 0; i < 10; i++) {
        scorer.penalize('peer-1', 'invalidSignature')
      }
      expect(scorer.getScore('peer-1')).toBe(0)
    })

    it('tracks violation counts in metrics', () => {
      const scorer = new YjsPeerScorer()
      scorer.penalize('peer-1', 'invalidSignature')
      scorer.penalize('peer-1', 'invalidSignature')
      scorer.penalize('peer-1', 'oversizedUpdate')

      const metrics = scorer.getMetrics('peer-1')!
      expect(metrics.invalidSignatures).toBe(2)
      expect(metrics.oversizedUpdates).toBe(1)
      expect(metrics.rateExceeded).toBe(0)
    })

    it('updates lastViolation timestamp', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2025-01-15T12:00:00Z'))

      const scorer = new YjsPeerScorer()
      scorer.penalize('peer-1', 'rateExceeded')

      const metrics = scorer.getMetrics('peer-1')!
      expect(metrics.lastViolation).toBe(Date.now())

      vi.useRealTimers()
    })
  })

  describe('instant block', () => {
    it('instant-blocks after 3 invalid signatures (default)', () => {
      const scorer = new YjsPeerScorer()
      scorer.penalize('peer-1', 'invalidSignature') // 1
      scorer.penalize('peer-1', 'invalidSignature') // 2
      const action = scorer.penalize('peer-1', 'invalidSignature') // 3

      expect(action).toBe('block')
      expect(scorer.getScore('peer-1')).toBe(0)
    })

    it('respects custom instantBlockAfter', () => {
      const scorer = new YjsPeerScorer({ instantBlockAfter: 2 })
      scorer.penalize('peer-1', 'invalidSignature') // 1
      const action = scorer.penalize('peer-1', 'invalidSignature') // 2

      expect(action).toBe('block')
    })
  })

  describe('action thresholds', () => {
    it('returns block at score <= 10', () => {
      const scorer = new YjsPeerScorer()
      expect(scorer.getAction(10)).toBe('block')
      expect(scorer.getAction(5)).toBe('block')
      expect(scorer.getAction(0)).toBe('block')
    })

    it('returns throttle at score 11-30', () => {
      const scorer = new YjsPeerScorer()
      expect(scorer.getAction(30)).toBe('throttle')
      expect(scorer.getAction(20)).toBe('throttle')
      expect(scorer.getAction(11)).toBe('throttle')
    })

    it('returns warn at score 31-50', () => {
      const scorer = new YjsPeerScorer()
      expect(scorer.getAction(50)).toBe('warn')
      expect(scorer.getAction(40)).toBe('warn')
      expect(scorer.getAction(31)).toBe('warn')
    })

    it('returns allow at score > 50', () => {
      const scorer = new YjsPeerScorer()
      expect(scorer.getAction(51)).toBe('allow')
      expect(scorer.getAction(75)).toBe('allow')
      expect(scorer.getAction(100)).toBe('allow')
    })

    it('respects custom thresholds', () => {
      const scorer = new YjsPeerScorer({
        thresholds: { warn: 80, throttle: 60, block: 40 }
      })
      expect(scorer.getAction(85)).toBe('allow')
      expect(scorer.getAction(75)).toBe('warn')
      expect(scorer.getAction(55)).toBe('throttle')
      expect(scorer.getAction(35)).toBe('block')
    })
  })

  describe('recordValid', () => {
    it('tracks valid update count', () => {
      const scorer = new YjsPeerScorer()
      scorer.recordValid('peer-1')
      scorer.recordValid('peer-1')

      const metrics = scorer.getMetrics('peer-1')!
      expect(metrics.validUpdates).toBe(2)
    })

    it('does not affect score', () => {
      const scorer = new YjsPeerScorer()
      scorer.recordValid('peer-1')
      expect(scorer.getScore('peer-1')).toBe(100)
    })
  })

  describe('tick (score recovery)', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('recovers score after violation-free period', () => {
      const scorer = new YjsPeerScorer({ recoveryRate: 5 })
      vi.setSystemTime(new Date('2025-01-15T12:00:00Z'))

      scorer.penalize('peer-1', 'rateExceeded') // 95

      // Advance 2 minutes (beyond 60s recovery window)
      vi.advanceTimersByTime(120_000)

      scorer.tick()
      expect(scorer.getScore('peer-1')).toBe(100) // recovered to cap
    })

    it('does not recover during active violations', () => {
      const scorer = new YjsPeerScorer({ recoveryRate: 5 })
      vi.setSystemTime(new Date('2025-01-15T12:00:00Z'))

      scorer.penalize('peer-1', 'rateExceeded') // 95

      // Only 30s passed
      vi.advanceTimersByTime(30_000)

      scorer.tick()
      expect(scorer.getScore('peer-1')).toBe(95) // no recovery
    })

    it('does not exceed 100', () => {
      const scorer = new YjsPeerScorer({ recoveryRate: 50 })
      vi.setSystemTime(new Date('2025-01-15T12:00:00Z'))

      scorer.penalize('peer-1', 'rateExceeded') // 95
      vi.advanceTimersByTime(120_000)

      scorer.tick()
      scorer.tick()
      scorer.tick()

      expect(scorer.getScore('peer-1')).toBe(100)
    })

    it('recovers multiple peers', () => {
      const scorer = new YjsPeerScorer({ recoveryRate: 5 })
      vi.setSystemTime(new Date('2025-01-15T12:00:00Z'))

      scorer.penalize('peer-1', 'rateExceeded') // 95
      scorer.penalize('peer-2', 'oversizedUpdate') // 90

      vi.advanceTimersByTime(120_000)
      scorer.tick()

      expect(scorer.getScore('peer-1')).toBe(100)
      expect(scorer.getScore('peer-2')).toBe(95) // 90 + 5
    })
  })

  describe('remove', () => {
    it('removes peer state', () => {
      const scorer = new YjsPeerScorer()
      scorer.penalize('peer-1', 'rateExceeded')
      expect(scorer.getScore('peer-1')).toBe(95)

      scorer.remove('peer-1')

      // After removal, peer starts fresh
      expect(scorer.getScore('peer-1')).toBe(100)
      expect(scorer.getMetrics('peer-1')).toBeUndefined()
    })
  })

  describe('clear', () => {
    it('clears all state', () => {
      const scorer = new YjsPeerScorer()
      scorer.penalize('peer-1', 'rateExceeded')
      scorer.penalize('peer-2', 'oversizedUpdate')

      scorer.clear()

      expect(scorer.getScore('peer-1')).toBe(100)
      expect(scorer.getScore('peer-2')).toBe(100)
      expect(scorer.getAllPeerIds()).toHaveLength(0)
    })
  })

  describe('getViolationRatio', () => {
    it('returns 0 for unknown peer', () => {
      const scorer = new YjsPeerScorer()
      expect(scorer.getViolationRatio('unknown')).toBe(0)
    })

    it('returns 0 for peer with no operations', () => {
      const scorer = new YjsPeerScorer()
      // Just create metrics without any operations
      scorer.recordValid('peer-1')
      scorer.remove('peer-1')
      expect(scorer.getViolationRatio('peer-1')).toBe(0)
    })

    it('calculates correct ratio', () => {
      const scorer = new YjsPeerScorer()

      // 10 valid updates
      for (let i = 0; i < 10; i++) {
        scorer.recordValid('peer-1')
      }

      // 2 violations
      scorer.penalize('peer-1', 'rateExceeded')
      scorer.penalize('peer-1', 'oversizedUpdate')

      // 2 violations / 12 total = 0.1666...
      expect(scorer.getViolationRatio('peer-1')).toBeCloseTo(2 / 12)
    })

    it('returns 1 for peer with only violations', () => {
      const scorer = new YjsPeerScorer()
      scorer.penalize('peer-1', 'rateExceeded')
      scorer.penalize('peer-1', 'oversizedUpdate')

      expect(scorer.getViolationRatio('peer-1')).toBe(1)
    })
  })

  describe('getAllMetrics / getAllPeerIds', () => {
    it('returns all tracked peers', () => {
      const scorer = new YjsPeerScorer()
      scorer.penalize('peer-1', 'rateExceeded')
      scorer.recordValid('peer-2')

      const peerIds = scorer.getAllPeerIds()
      expect(peerIds).toContain('peer-1')
      expect(peerIds).toContain('peer-2')
    })

    it('returns all metrics', () => {
      const scorer = new YjsPeerScorer()
      scorer.penalize('peer-1', 'invalidSignature')
      scorer.recordValid('peer-2')

      const allMetrics = scorer.getAllMetrics()
      expect(allMetrics.size).toBe(2)
      expect(allMetrics.get('peer-1')!.invalidSignatures).toBe(1)
      expect(allMetrics.get('peer-2')!.validUpdates).toBe(1)
    })
  })
})
