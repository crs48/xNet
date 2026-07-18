/**
 * did:plc rotation-key sovereignty (0322/0338).
 */
import { p256 } from '@noble/curves/nist.js'
import { describe, expect, it } from 'vitest'
import { deriveKeysFromSeed } from '../seed-recovery'
import { derivePlcRotationKey, withUserPriorityRotationKey } from './rotation-key'

// The rotation key rides the recovery seed the user already backs up; derive it
// from the same `backupKey` deriveKeysFromSeed produces so it reconstructs from
// the phrase alone.
const seedFromPhrase = (phrase: string): Uint8Array => deriveKeysFromSeed(phrase).backupKey

describe('derivePlcRotationKey', () => {
  it('is deterministic from the seed (reconstructs on any device)', () => {
    const seed = new Uint8Array(64).fill(7)
    const a = derivePlcRotationKey(seed)
    const b = derivePlcRotationKey(seed)
    expect(a.didKey).toBe(b.didKey)
    expect(Array.from(a.privateKey)).toEqual(Array.from(b.privateKey))
  })

  it('produces a valid did:key with the p256 multicodec', () => {
    const key = derivePlcRotationKey(new Uint8Array(64).fill(3))
    expect(key.didKey).toMatch(/^did:key:z/)
    expect(key.publicKey.length).toBe(33) // compressed P-256 point
    // Public key really corresponds to the private scalar.
    expect(Array.from(p256.getPublicKey(key.privateKey, true))).toEqual(Array.from(key.publicKey))
  })

  it('differs from a different seed', () => {
    const a = derivePlcRotationKey(new Uint8Array(64).fill(1))
    const b = derivePlcRotationKey(new Uint8Array(64).fill(2))
    expect(a.didKey).not.toBe(b.didKey)
  })

  it('reconstructs from a recovery phrase alone (device-loss drill)', () => {
    const phrase =
      'amber ocean puzzle velvet cabin ridge tunnel garden mellow spark orbit lantern'
    const first = derivePlcRotationKey(seedFromPhrase(phrase))
    const second = derivePlcRotationKey(seedFromPhrase(phrase))
    expect(first.didKey).toBe(second.didKey)
  })
})

describe('withUserPriorityRotationKey', () => {
  it('puts the user key first (highest priority) and de-dups', () => {
    const user = 'did:key:zUserRotation'
    const pds = 'did:key:zPdsRotation'
    expect(withUserPriorityRotationKey(user, [pds])).toEqual([user, pds])
    // Idempotent if already present.
    expect(withUserPriorityRotationKey(user, [pds, user])).toEqual([user, pds])
  })
})
