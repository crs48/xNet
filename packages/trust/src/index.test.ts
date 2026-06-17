/**
 * Tests for @xnetjs/trust — the shared provenance→trust primitives (0194).
 */

import { describe, it, expect } from 'vitest'
import {
  deriveTrustTier,
  requiresCapabilityReprompt,
  sandboxForTier,
  type InstallProvenance
} from './index'

const ALL: InstallProvenance[] = [
  'builtin',
  'authored',
  'ai-generated',
  'imported',
  'marketplace',
  'synced'
]

describe('deriveTrustTier', () => {
  it('maps provenance to tier; only builtin is first-party, only marketplace is marketplace', () => {
    expect(deriveTrustTier('builtin')).toBe('first-party')
    expect(deriveTrustTier('marketplace')).toBe('marketplace')
    for (const p of ['authored', 'ai-generated', 'imported', 'synced'] as InstallProvenance[]) {
      expect(deriveTrustTier(p)).toBe('user')
    }
  })

  it('never throws and always returns a valid tier for any provenance', () => {
    for (const p of ALL) {
      expect(['first-party', 'user', 'marketplace']).toContain(deriveTrustTier(p))
    }
  })
})

describe('requiresCapabilityReprompt', () => {
  it.each(ALL)('is false only for builtin/authored (%s)', (provenance) => {
    const localToThisDevice = provenance === 'builtin' || provenance === 'authored'
    expect(requiresCapabilityReprompt(provenance)).toBe(!localToThisDevice)
  })
})

describe('sandboxForTier', () => {
  it('maps tiers to sandboxes', () => {
    expect(sandboxForTier('first-party')).toBe('host')
    expect(sandboxForTier('user')).toBe('ses-worker')
    expect(sandboxForTier('marketplace')).toBe('iframe')
  })

  it('round-trips: a marketplace install ends up in the iframe', () => {
    expect(sandboxForTier(deriveTrustTier('marketplace'))).toBe('iframe')
    expect(sandboxForTier(deriveTrustTier('synced'))).toBe('ses-worker')
    expect(sandboxForTier(deriveTrustTier('builtin'))).toBe('host')
  })
})
