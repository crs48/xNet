/** Desk id derivation (0273): deterministic, per-identity, recognizable. */
import { describe, expect, it } from 'vitest'
import { deskIdFor, isDeskId } from './desk'

describe('deskIdFor', () => {
  it('is deterministic for the same DID', () => {
    expect(deskIdFor('did:key:zAbc')).toBe(deskIdFor('did:key:zAbc'))
  })

  it('differs across identities', () => {
    expect(deskIdFor('did:key:zAbc')).not.toBe(deskIdFor('did:key:zXyz'))
  })

  it('round-trips through isDeskId', () => {
    expect(isDeskId(deskIdFor('did:key:zAbc'))).toBe(true)
    expect(isDeskId('a1b2c3')).toBe(false)
  })
})
