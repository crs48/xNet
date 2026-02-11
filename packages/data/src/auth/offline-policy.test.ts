import { describe, expect, it } from 'vitest'
import {
  DEFAULT_OFFLINE_POLICY,
  mergeOfflinePolicy,
  type OfflineAuthPolicy,
  type RevocationConfig
} from './offline-policy'

describe('offline policy', () => {
  it('should provide the documented defaults', () => {
    expect(DEFAULT_OFFLINE_POLICY).toEqual({
      decisionCacheTTL: 300000,
      maxStaleness: 3600000,
      revalidation: 'hybrid',
      allowOfflineGrants: true
    })
  })

  it('should merge partial policy updates', () => {
    const updated = mergeOfflinePolicy(DEFAULT_OFFLINE_POLICY, {
      revalidation: 'eager',
      decisionCacheTTL: 120000
    })

    expect(updated).toEqual({
      decisionCacheTTL: 120000,
      maxStaleness: 3600000,
      revalidation: 'eager',
      allowOfflineGrants: true
    })
  })

  it('should keep revocation config typing strict', () => {
    const config: RevocationConfig = {
      mode: 'strict',
      maxStaleness: 60000
    }

    const policy: OfflineAuthPolicy = {
      ...DEFAULT_OFFLINE_POLICY,
      revalidation: 'lazy'
    }

    expect(config.mode).toBe('strict')
    expect(policy.revalidation).toBe('lazy')
  })
})
