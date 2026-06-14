import { describe, expect, it } from 'vitest'
import { deriveTrustTier, requiresCapabilityReprompt } from '../trust'

describe('deriveTrustTier', () => {
  it('maps provenance to a trust tier', () => {
    expect(deriveTrustTier('builtin')).toBe('first-party')
    expect(deriveTrustTier('authored')).toBe('user')
    expect(deriveTrustTier('ai-generated')).toBe('user')
    expect(deriveTrustTier('imported')).toBe('user')
    expect(deriveTrustTier('marketplace')).toBe('marketplace')
  })

  it('never lets a synced node inherit elevated trust', () => {
    // Sync is not consent: a synced extension lands at user tier, never first-party.
    expect(deriveTrustTier('synced')).toBe('user')
  })
})

describe('requiresCapabilityReprompt', () => {
  it('re-prompts for anything not authored locally', () => {
    expect(requiresCapabilityReprompt('synced')).toBe(true)
    expect(requiresCapabilityReprompt('ai-generated')).toBe(true)
    expect(requiresCapabilityReprompt('marketplace')).toBe(true)
    expect(requiresCapabilityReprompt('authored')).toBe(false)
    expect(requiresCapabilityReprompt('builtin')).toBe(false)
  })
})
