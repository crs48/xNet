/**
 * Reusable abuse decision fixtures for tests and adapters.
 */

import type { AbuseFacts, AbuseLabel } from './types'

export const TRUSTED_SPAM_LABEL: AbuseLabel = {
  value: 'spam',
  sourceDID: 'did:key:zTrustedLabeler',
  sourceWeight: 2,
  confidence: 1,
  evidenceRefs: ['label:evidence:spam']
}

export const WARNING_SLOP_LABEL: AbuseLabel = {
  value: 'slop',
  sourceDID: 'did:key:zTrustedQualityLabeler',
  sourceWeight: 1,
  confidence: 0.75,
  evidenceRefs: ['label:evidence:slop']
}

export function createBaseFacts(overrides: Partial<AbuseFacts> = {}): AbuseFacts {
  return {
    surface: overrides.surface ?? 'remoteMutation',
    crypto: {
      hashValid: true,
      signatureValid: true,
      authorized: true,
      freshnessValid: true,
      docBindingValid: true,
      ...overrides.crypto
    },
    resource: {
      overSizeLimit: false,
      overRateLimit: false,
      estimatedCost: 0,
      budgetRemaining: null,
      ...overrides.resource
    },
    actor: {
      did: 'did:key:zActor',
      peerId: 'peer-1',
      firstContact: false,
      peerScore: 100,
      localBlocked: false,
      workspaceBlocked: false,
      hubBlocked: false,
      appViewBlocked: false,
      ...overrides.actor
    },
    labels: overrides.labels ?? [],
    quality: {
      duplicateScore: 0,
      slopScore: 0,
      citationCoverage: 1,
      provenanceScore: 1,
      ...overrides.quality
    },
    policy: overrides.policy,
    override: overrides.override,
    now: overrides.now ?? 1_700_000_000_000
  }
}

export const abuseFixtures = {
  validRemoteMutation: createBaseFacts(),
  invalidSignatureRemoteMutation: createBaseFacts({
    crypto: { signatureValid: false }
  }),
  oversizedRemoteMutation: createBaseFacts({
    resource: { overSizeLimit: true }
  }),
  firstContactComment: createBaseFacts({
    surface: 'commentThread',
    actor: { firstContact: true }
  }),
  trustedSpamComment: createBaseFacts({
    surface: 'commentThread',
    labels: [TRUSTED_SPAM_LABEL]
  }),
  lowQualitySearchCandidate: createBaseFacts({
    surface: 'searchIndex',
    quality: {
      duplicateScore: 0.8,
      slopScore: 0.8,
      citationCoverage: 0.1,
      provenanceScore: 0.2
    }
  }),
  expiredSpamLabel: createBaseFacts({
    surface: 'commentThread',
    labels: [{ ...TRUSTED_SPAM_LABEL, expiresAt: 1 }],
    now: 2
  }),
  throttledPeer: createBaseFacts({
    surface: 'transport',
    actor: { peerScore: 20 }
  })
} as const
