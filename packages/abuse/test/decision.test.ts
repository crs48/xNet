import { describe, expect, it } from 'vitest'
import {
  TRUSTED_SPAM_LABEL,
  abuseFixtures,
  createBaseFacts,
  decidePublicInteraction,
  decideReach,
  decideRemoteMutation,
  decideTransport,
  explainDecision,
  isRejected,
  isVisible,
  normalizeAbuseFacts,
  qualityRiskScore,
  shouldThrottle
} from '../src'

describe('@xnetjs/abuse decision engine', () => {
  describe('decideRemoteMutation', () => {
    it('allows a valid remote mutation', () => {
      const result = decideRemoteMutation(abuseFixtures.validRemoteMutation)

      expect(result.admission).toBe('accept')
      expect(result.visibility).toBe('show')
      expect(result.reach).toBe('normal')
      expect(result.reasons).toContain('accepted')
      expect(isRejected(result)).toBe(false)
    })

    it('rejects invalid signatures before mutation', () => {
      const result = decideRemoteMutation(abuseFixtures.invalidSignatureRemoteMutation)

      expect(result.admission).toBe('reject')
      expect(result.visibility).toBe('hide')
      expect(result.reach).toBe('exclude')
      expect(result.reasons).toContain('failed-admission')
      expect(result.reasons).toContain('invalid-signature')
      expect(result.telemetry[0]?.eventName).toBe('xnet.security.invalid_signature')
      expect(isRejected(result)).toBe(true)
    })

    it('rejects oversized remote updates before other work', () => {
      const result = decideRemoteMutation(abuseFixtures.oversizedRemoteMutation)

      expect(result.admission).toBe('reject')
      expect(result.reasons).toEqual(['over-size-limit'])
      expect(result.includeInSearch).toBe(false)
    })

    it('does not allow local overrides to bypass hard admission failures', () => {
      const result = decideRemoteMutation({
        ...abuseFixtures.invalidSignatureRemoteMutation,
        override: {
          visibility: 'show',
          reach: 'normal',
          reason: 'manual override'
        }
      })

      expect(result.admission).toBe('reject')
      expect(result.visibility).toBe('hide')
      expect(result.reasons).not.toContain('user-override')
    })
  })

  describe('decidePublicInteraction', () => {
    it('quarantines first-contact comments by default', () => {
      const result = decidePublicInteraction(abuseFixtures.firstContactComment)

      expect(result.admission).toBe('quarantine')
      expect(result.visibility).toBe('warn')
      expect(result.reach).toBe('demote')
      expect(result.notify).toBe(false)
      expect(result.review).toEqual({ required: true, queue: 'safety', priority: 50 })
      expect(result.reasons).toContain('first-contact')
    })

    it('hides content with trusted abuse labels', () => {
      const result = decidePublicInteraction(abuseFixtures.trustedSpamComment)

      expect(result.admission).toBe('accept')
      expect(result.visibility).toBe('hide')
      expect(result.reach).toBe('exclude')
      expect(result.includeInCounters).toBe(false)
      expect(result.includeInSearch).toBe(false)
      expect(result.review).toEqual({ required: true, queue: 'safety', priority: 80 })
    })

    it('ignores expired labels', () => {
      const result = decidePublicInteraction(abuseFixtures.expiredSpamLabel)

      expect(result.admission).toBe('accept')
      expect(result.visibility).toBe('show')
      expect(result.reasons).toContain('accepted')
    })

    it('applies safe local display overrides after reversible decisions', () => {
      const result = decidePublicInteraction({
        ...abuseFixtures.firstContactComment,
        override: {
          visibility: 'hide',
          reach: 'exclude',
          notify: false,
          reason: 'user muted sender'
        }
      })

      expect(result.admission).toBe('quarantine')
      expect(result.visibility).toBe('hide')
      expect(result.reach).toBe('exclude')
      expect(result.reasons).toContain('user-override')
      expect(result.evidenceRefs).toContain('user muted sender')
    })
  })

  describe('decideReach', () => {
    it('routes high quality risk candidates to review and demotes them', () => {
      const result = decideReach(abuseFixtures.lowQualitySearchCandidate)

      expect(result.admission).toBe('quarantine')
      expect(result.visibility).toBe('warn')
      expect(result.reach).toBe('demote')
      expect(result.includeInSearch).toBe(false)
      expect(result.review).toEqual({ required: true, queue: 'quality', priority: 82 })
      expect(result.reasons).toContain('quality-risk')
    })

    it('warns but does not quarantine lower quality risk candidates', () => {
      const result = decideReach(
        createBaseFacts({
          surface: 'feed',
          quality: {
            duplicateScore: 0.2,
            slopScore: 0.45,
            citationCoverage: 0.5,
            provenanceScore: 0.8
          }
        })
      )

      expect(result.admission).toBe('accept')
      expect(result.visibility).toBe('warn')
      expect(result.reach).toBe('demote')
      expect(result.review.required).toBe(false)
      expect(result.reasons).toContain('low-confidence-quality-signal')
    })
  })

  describe('decideTransport', () => {
    it('throttles low-score peers', () => {
      const result = decideTransport(abuseFixtures.throttledPeer)

      expect(result.admission).toBe('quarantine')
      expect(result.resource).toBe('throttle')
      expect(result.reasons).toContain('peer-score-throttle')
      expect(shouldThrottle(result)).toBe(true)
    })

    it('blocks peers below the block threshold', () => {
      const result = decideTransport(
        createBaseFacts({
          surface: 'transport',
          actor: { peerScore: 5 }
        })
      )

      expect(result.resource).toBe('block-peer')
      expect(result.reasons).toContain('peer-score-block')
    })
  })

  describe('explainDecision', () => {
    it('explains decision summaries and reason details', () => {
      const decision = decidePublicInteraction({
        surface: 'commentThread',
        labels: [TRUSTED_SPAM_LABEL]
      })
      const explanation = explainDecision(decision)

      expect(explanation.summary).toBe('Accepted but hidden by policy.')
      expect(explanation.reasons[0]).toEqual({
        code: 'trusted-abuse-label',
        severity: 'high',
        message: 'Trusted labels indicate abuse such as spam, scam, malware, or impersonation.'
      })
      expect(isVisible(decision)).toBe(false)
    })
  })

  describe('qualityRiskScore', () => {
    it('keeps quality risk scores between zero and one', () => {
      const facts = createBaseFacts({
        quality: {
          duplicateScore: 2,
          slopScore: 2,
          citationCoverage: -1,
          provenanceScore: -1
        }
      })

      expect(qualityRiskScore(normalizeAbuseFacts(facts))).toBe(1)
    })
  })
})
