/**
 * Tests for provenance→trust derivation and install consent (exploration 0192).
 */

import type { ModuleCapabilities } from '../feature-module'
import { describe, it, expect } from 'vitest'
import { describeCapabilities, evaluateInstallConsent, shortSchemaName } from '../ecosystem/consent'
import {
  deriveTrustTier,
  requiresCapabilityReprompt,
  sandboxForTier
} from '../ecosystem/provenance-trust'

describe('deriveTrustTier', () => {
  it('maps provenance to tier; synced never inherits above user', () => {
    expect(deriveTrustTier('builtin')).toBe('first-party')
    expect(deriveTrustTier('authored')).toBe('user')
    expect(deriveTrustTier('ai-generated')).toBe('user')
    expect(deriveTrustTier('imported')).toBe('user')
    expect(deriveTrustTier('synced')).toBe('user')
    expect(deriveTrustTier('marketplace')).toBe('marketplace')
  })
})

describe('requiresCapabilityReprompt', () => {
  it('is true for everything not authored locally', () => {
    expect(requiresCapabilityReprompt('builtin')).toBe(false)
    expect(requiresCapabilityReprompt('authored')).toBe(false)
    expect(requiresCapabilityReprompt('ai-generated')).toBe(true)
    expect(requiresCapabilityReprompt('imported')).toBe(true)
    expect(requiresCapabilityReprompt('marketplace')).toBe(true)
    expect(requiresCapabilityReprompt('synced')).toBe(true)
  })
})

describe('sandboxForTier', () => {
  it('maps tiers to the dashboard widget sandboxes', () => {
    expect(sandboxForTier('first-party')).toBe('host')
    expect(sandboxForTier('user')).toBe('ses-worker')
    expect(sandboxForTier('marketplace')).toBe('iframe')
  })
})

describe('shortSchemaName', () => {
  it('reduces an IRI to a friendly name', () => {
    expect(shortSchemaName('xnet://xnet.fyi/Task@1.0.0')).toBe('Task')
    expect(shortSchemaName('*')).toBe('all data')
  })
})

describe('describeCapabilities', () => {
  it('renders lines and flags broad/secret grants as danger', () => {
    const caps: ModuleCapabilities = {
      schemaWrite: ['xnet://xnet.fyi/Task@1.0.0', '*'],
      network: ['api.stripe.com'],
      secrets: ['STRIPE_SECRET_KEY']
    }
    const lines = describeCapabilities(caps)
    expect(lines.find((l) => l.text.includes('Task'))?.danger).toBe(false)
    expect(lines.find((l) => l.text.includes('all data'))?.danger).toBe(true)
    expect(lines.find((l) => l.icon === 'globe')?.danger).toBe(false)
    expect(lines.find((l) => l.icon === 'key')?.danger).toBe(true)
  })

  it('is empty for no capabilities', () => {
    expect(describeCapabilities(undefined)).toEqual([])
    expect(describeCapabilities({})).toEqual([])
  })
})

describe('evaluateInstallConsent', () => {
  const caps: ModuleCapabilities = { schemaWrite: ['xnet://xnet.fyi/Task@1.0.0'] }

  it('prompts for marketplace installs that request capabilities', () => {
    const d = evaluateInstallConsent('marketplace', caps)
    expect(d.tier).toBe('marketplace')
    expect(d.needsPrompt).toBe(true)
    expect(d.lines).toHaveLength(1)
  })

  it('does not prompt for locally-authored installs', () => {
    const d = evaluateInstallConsent('authored', caps)
    expect(d.needsPrompt).toBe(false)
  })

  it('does not prompt when there is nothing to consent to', () => {
    const d = evaluateInstallConsent('marketplace', undefined)
    expect(d.needsPrompt).toBe(false)
    expect(d.tier).toBe('marketplace')
  })

  it('surfaces danger when a broad grant is requested', () => {
    const d = evaluateInstallConsent('marketplace', { schemaWrite: ['*'] })
    expect(d.hasDanger).toBe(true)
  })
})
