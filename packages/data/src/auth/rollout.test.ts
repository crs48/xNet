import { describe, expect, it } from 'vitest'
import { AUTH_FEATURE_FLAGS } from './rollout'

describe('AUTH_FEATURE_FLAGS', () => {
  it('defaults to shadow rollout mode', () => {
    expect(AUTH_FEATURE_FLAGS).toEqual({
      enforceLocal: false,
      enforceRemote: false,
      enforceHub: false,
      enforceEncryption: false,
      logDecisions: true
    })
  })
})
