import { describe, expect, it } from 'vitest'
import { resolveSyncReplicationPolicy } from './replication-policy'

describe('resolveSyncReplicationPolicy', () => {
  it('requires signed replication by default', () => {
    expect(resolveSyncReplicationPolicy(undefined)).toEqual({
      allowUnsignedReplication: false,
      requireSignedReplication: true
    })
  })

  it('allows unsigned replication only through explicit compatibility mode', () => {
    expect(
      resolveSyncReplicationPolicy({
        compatibility: {
          allowUnsignedReplication: true
        }
      })
    ).toEqual({
      allowUnsignedReplication: true,
      requireSignedReplication: false
    })
  })
})
