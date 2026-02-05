/**
 * Tests for ClientID-to-DID Binding
 */

import { generateIdentity } from '@xnet/identity'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  createClientIdAttestation,
  verifyClientIdAttestation,
  ClientIdMapImpl,
  validateClientIdOwnership,
  type ClientIdAttestation
} from './clientid-attestation'

describe('createClientIdAttestation', () => {
  it('produces valid attestation with correct fields', () => {
    const { identity, privateKey } = generateIdentity()
    const attestation = createClientIdAttestation(12345, identity.did, privateKey, 'room-abc')

    expect(attestation.clientId).toBe(12345)
    expect(attestation.did).toBe(identity.did)
    expect(attestation.room).toBe('room-abc')
    expect(attestation.signature).toBeInstanceOf(Uint8Array)
    expect(attestation.signature.length).toBe(64) // Ed25519 signature
    expect(attestation.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000))
  })

  it('uses default TTL of 1 hour', () => {
    const { identity, privateKey } = generateIdentity()
    const before = Math.floor(Date.now() / 1000)
    const attestation = createClientIdAttestation(1, identity.did, privateKey, 'room')
    const after = Math.floor(Date.now() / 1000)

    // Should be ~1 hour from now (3600 seconds)
    expect(attestation.expiresAt).toBeGreaterThanOrEqual(before + 3600)
    expect(attestation.expiresAt).toBeLessThanOrEqual(after + 3600)
  })

  it('respects custom TTL', () => {
    const { identity, privateKey } = generateIdentity()
    const before = Math.floor(Date.now() / 1000)
    const attestation = createClientIdAttestation(1, identity.did, privateKey, 'room', 300) // 5 minutes
    const after = Math.floor(Date.now() / 1000)

    expect(attestation.expiresAt).toBeGreaterThanOrEqual(before + 300)
    expect(attestation.expiresAt).toBeLessThanOrEqual(after + 300)
  })

  it('produces different signatures for different clientIds', () => {
    const { identity, privateKey } = generateIdentity()
    const att1 = createClientIdAttestation(111, identity.did, privateKey, 'room')
    const att2 = createClientIdAttestation(222, identity.did, privateKey, 'room')

    expect(att1.signature).not.toEqual(att2.signature)
  })

  it('produces different signatures for different rooms', () => {
    const { identity, privateKey } = generateIdentity()
    const att1 = createClientIdAttestation(1, identity.did, privateKey, 'room-a')
    const att2 = createClientIdAttestation(1, identity.did, privateKey, 'room-b')

    expect(att1.signature).not.toEqual(att2.signature)
  })

  it('produces different signatures for different keys', () => {
    const { identity: id1, privateKey: key1 } = generateIdentity()
    const { identity: id2, privateKey: key2 } = generateIdentity()

    const att1 = createClientIdAttestation(1, id1.did, key1, 'room')
    const att2 = createClientIdAttestation(1, id2.did, key2, 'room')

    expect(att1.signature).not.toEqual(att2.signature)
  })
})

describe('verifyClientIdAttestation', () => {
  it('accepts correctly signed attestation', () => {
    const { identity, privateKey } = generateIdentity()
    const attestation = createClientIdAttestation(12345, identity.did, privateKey, 'room')

    const result = verifyClientIdAttestation(attestation)
    expect(result.valid).toBe(true)
    expect(result.reason).toBeUndefined()
  })

  it('rejects expired attestation', () => {
    const { identity, privateKey } = generateIdentity()
    // Create attestation with -1 second TTL (already expired)
    const attestation = createClientIdAttestation(1, identity.did, privateKey, 'room', -1)

    const result = verifyClientIdAttestation(attestation)
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('expired')
  })

  it('rejects attestation with tampered clientId', () => {
    const { identity, privateKey } = generateIdentity()
    const attestation = createClientIdAttestation(12345, identity.did, privateKey, 'room')
    attestation.clientId = 99999 // tamper

    const result = verifyClientIdAttestation(attestation)
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('invalid_signature')
  })

  it('rejects attestation with tampered room', () => {
    const { identity, privateKey } = generateIdentity()
    const attestation = createClientIdAttestation(1, identity.did, privateKey, 'room-a')
    attestation.room = 'room-b' // tamper

    const result = verifyClientIdAttestation(attestation)
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('invalid_signature')
  })

  it('rejects attestation with tampered expiresAt', () => {
    const { identity, privateKey } = generateIdentity()
    const attestation = createClientIdAttestation(1, identity.did, privateKey, 'room')
    attestation.expiresAt = attestation.expiresAt + 10000 // tamper to extend

    const result = verifyClientIdAttestation(attestation)
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('invalid_signature')
  })

  it('rejects attestation with wrong DID (key mismatch)', () => {
    const { privateKey: key1 } = generateIdentity()
    const { identity: id2 } = generateIdentity()

    // Sign with key1 but claim to be id2
    const attestation = createClientIdAttestation(1, id2.did, key1, 'room')

    const result = verifyClientIdAttestation(attestation)
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('invalid_signature')
  })

  it('rejects attestation with tampered signature', () => {
    const { identity, privateKey } = generateIdentity()
    const attestation = createClientIdAttestation(1, identity.did, privateKey, 'room')
    attestation.signature = new Uint8Array(64).fill(0) // invalid sig

    const result = verifyClientIdAttestation(attestation)
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('invalid_signature')
  })

  it('rejects attestation with invalid DID format', () => {
    const attestation: ClientIdAttestation = {
      clientId: 1,
      did: 'did:key:invalid',
      signature: new Uint8Array(64),
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
      room: 'room'
    }

    const result = verifyClientIdAttestation(attestation)
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('did_resolution_failed')
  })

  it('rejects attestation with non-DID string', () => {
    const attestation: ClientIdAttestation = {
      clientId: 1,
      did: 'not-a-did',
      signature: new Uint8Array(64),
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
      room: 'room'
    }

    const result = verifyClientIdAttestation(attestation)
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('did_resolution_failed')
  })
})

describe('ClientIdMapImpl', () => {
  let map: ClientIdMapImpl

  beforeEach(() => {
    map = new ClientIdMapImpl()
  })

  describe('register and lookup', () => {
    it('stores and retrieves binding by clientId', () => {
      const { identity, privateKey } = generateIdentity()
      const attestation = createClientIdAttestation(12345, identity.did, privateKey, 'room')

      map.register(attestation)

      expect(map.getOwner(12345)).toBe(identity.did)
    })

    it('stores and retrieves binding by DID', () => {
      const { identity, privateKey } = generateIdentity()
      const attestation = createClientIdAttestation(12345, identity.did, privateKey, 'room')

      map.register(attestation)

      expect(map.getClientId(identity.did)).toBe(12345)
    })

    it('returns undefined for unknown clientId', () => {
      expect(map.getOwner(99999)).toBeUndefined()
    })

    it('returns undefined for unknown DID', () => {
      expect(map.getClientId('did:key:zunknown')).toBeUndefined()
    })

    it('has() returns true for registered clientId', () => {
      const { identity, privateKey } = generateIdentity()
      const attestation = createClientIdAttestation(12345, identity.did, privateKey, 'room')

      map.register(attestation)

      expect(map.has(12345)).toBe(true)
      expect(map.has(99999)).toBe(false)
    })

    it('size() returns correct count', () => {
      const { identity: id1, privateKey: key1 } = generateIdentity()
      const { identity: id2, privateKey: key2 } = generateIdentity()

      expect(map.size()).toBe(0)

      map.register(createClientIdAttestation(1, id1.did, key1, 'room'))
      expect(map.size()).toBe(1)

      map.register(createClientIdAttestation(2, id2.did, key2, 'room'))
      expect(map.size()).toBe(2)
    })
  })

  describe('re-registration', () => {
    it('replaces previous binding when DID registers new clientId', () => {
      const { identity, privateKey } = generateIdentity()

      // First registration
      map.register(createClientIdAttestation(111, identity.did, privateKey, 'room'))
      expect(map.getOwner(111)).toBe(identity.did)
      expect(map.getClientId(identity.did)).toBe(111)

      // Re-register with different clientId (e.g., browser refresh)
      map.register(createClientIdAttestation(222, identity.did, privateKey, 'room'))

      expect(map.getOwner(222)).toBe(identity.did)
      expect(map.getClientId(identity.did)).toBe(222)
      expect(map.getOwner(111)).toBeUndefined() // old binding removed
    })

    it('replaces previous binding when clientId claimed by new DID', () => {
      const { identity: id1, privateKey: key1 } = generateIdentity()
      const { identity: id2, privateKey: key2 } = generateIdentity()

      // First DID claims clientId
      map.register(createClientIdAttestation(12345, id1.did, key1, 'room'))
      expect(map.getOwner(12345)).toBe(id1.did)

      // Second DID claims same clientId (collision)
      map.register(createClientIdAttestation(12345, id2.did, key2, 'room'))

      expect(map.getOwner(12345)).toBe(id2.did)
      expect(map.getClientId(id1.did)).toBeUndefined() // old binding removed
    })
  })

  describe('expiration', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('returns undefined for expired binding via getOwner', () => {
      const { identity, privateKey } = generateIdentity()
      const attestation = createClientIdAttestation(1, identity.did, privateKey, 'room', 60) // 1 minute TTL

      map.register(attestation)
      expect(map.getOwner(1)).toBe(identity.did)

      // Advance time past expiry
      vi.advanceTimersByTime(61_000)

      expect(map.getOwner(1)).toBeUndefined()
    })

    it('returns undefined for expired binding via getClientId', () => {
      const { identity, privateKey } = generateIdentity()
      const attestation = createClientIdAttestation(1, identity.did, privateKey, 'room', 60)

      map.register(attestation)
      expect(map.getClientId(identity.did)).toBe(1)

      vi.advanceTimersByTime(61_000)

      expect(map.getClientId(identity.did)).toBeUndefined()
    })

    it('cleanup() removes expired bindings', () => {
      const { identity: id1, privateKey: key1 } = generateIdentity()
      const { identity: id2, privateKey: key2 } = generateIdentity()

      map.register(createClientIdAttestation(1, id1.did, key1, 'room', 60)) // expires in 1 min
      map.register(createClientIdAttestation(2, id2.did, key2, 'room', 300)) // expires in 5 min

      expect(map.size()).toBe(2)

      // Advance 2 minutes
      vi.advanceTimersByTime(120_000)
      map.cleanup()

      expect(map.size()).toBe(1)
      expect(map.has(1)).toBe(false)
      expect(map.has(2)).toBe(true)
    })
  })

  describe('getAll', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('returns all active bindings', () => {
      const { identity: id1, privateKey: key1 } = generateIdentity()
      const { identity: id2, privateKey: key2 } = generateIdentity()

      map.register(createClientIdAttestation(1, id1.did, key1, 'room'))
      map.register(createClientIdAttestation(2, id2.did, key2, 'room'))

      const all = map.getAll()
      expect(all).toHaveLength(2)
      expect(all.find((b) => b.clientId === 1)?.did).toBe(id1.did)
      expect(all.find((b) => b.clientId === 2)?.did).toBe(id2.did)
    })

    it('excludes expired bindings', () => {
      const { identity: id1, privateKey: key1 } = generateIdentity()
      const { identity: id2, privateKey: key2 } = generateIdentity()

      map.register(createClientIdAttestation(1, id1.did, key1, 'room', 60))
      map.register(createClientIdAttestation(2, id2.did, key2, 'room', 300))

      vi.advanceTimersByTime(120_000)

      const all = map.getAll()
      expect(all).toHaveLength(1)
      expect(all[0].clientId).toBe(2)
    })
  })

  describe('clear', () => {
    it('removes all bindings', () => {
      const { identity: id1, privateKey: key1 } = generateIdentity()
      const { identity: id2, privateKey: key2 } = generateIdentity()

      map.register(createClientIdAttestation(1, id1.did, key1, 'room'))
      map.register(createClientIdAttestation(2, id2.did, key2, 'room'))
      expect(map.size()).toBe(2)

      map.clear()

      expect(map.size()).toBe(0)
      expect(map.has(1)).toBe(false)
      expect(map.has(2)).toBe(false)
    })
  })
})

describe('validateClientIdOwnership', () => {
  let map: ClientIdMapImpl

  beforeEach(() => {
    map = new ClientIdMapImpl()
  })

  it('returns true when no binding exists (graceful)', () => {
    const { identity } = generateIdentity()

    // No attestation registered for clientId 12345
    const valid = validateClientIdOwnership(12345, identity.did, map)
    expect(valid).toBe(true)
  })

  it('returns true when clientId matches registered owner', () => {
    const { identity, privateKey } = generateIdentity()
    map.register(createClientIdAttestation(12345, identity.did, privateKey, 'room'))

    const valid = validateClientIdOwnership(12345, identity.did, map)
    expect(valid).toBe(true)
  })

  it('returns false when clientId claimed by different DID', () => {
    const { identity: owner, privateKey } = generateIdentity()
    const { identity: imposter } = generateIdentity()

    // Owner registers clientId
    map.register(createClientIdAttestation(12345, owner.did, privateKey, 'room'))

    // Imposter tries to use that clientId
    const valid = validateClientIdOwnership(12345, imposter.did, map)
    expect(valid).toBe(false)
  })

  it('returns true after binding expires (graceful fallback)', () => {
    vi.useFakeTimers()

    const { identity: owner, privateKey: ownerKey } = generateIdentity()
    const { identity: other } = generateIdentity()

    map.register(createClientIdAttestation(12345, owner.did, ownerKey, 'room', 60))

    // Before expiry: other DID blocked
    expect(validateClientIdOwnership(12345, other.did, map)).toBe(false)

    // After expiry: binding gone, anyone can use
    vi.advanceTimersByTime(61_000)
    expect(validateClientIdOwnership(12345, other.did, map)).toBe(true)

    vi.useRealTimers()
  })
})

describe('integration: attestation flow', () => {
  it('complete flow: create, verify, register, validate', () => {
    const { identity, privateKey } = generateIdentity()
    const map = new ClientIdMapImpl()

    // 1. Client creates attestation when joining room
    const attestation = createClientIdAttestation(42, identity.did, privateKey, 'my-doc-room')

    // 2. Server/peer verifies attestation
    const verifyResult = verifyClientIdAttestation(attestation)
    expect(verifyResult.valid).toBe(true)

    // 3. Server registers valid attestation
    map.register(attestation)

    // 4. Subsequent updates from this clientId are validated
    expect(validateClientIdOwnership(42, identity.did, map)).toBe(true)

    // 5. Impersonation attempt fails
    const { identity: imposter } = generateIdentity()
    expect(validateClientIdOwnership(42, imposter.did, map)).toBe(false)
  })

  it('rejects forged attestation in complete flow', () => {
    const { identity: victim, privateKey: victimKey } = generateIdentity()
    const { privateKey: attackerKey } = generateIdentity()
    const map = new ClientIdMapImpl()

    // Victim legitimately registers
    const legitAttestation = createClientIdAttestation(42, victim.did, victimKey, 'room')
    expect(verifyClientIdAttestation(legitAttestation).valid).toBe(true)
    map.register(legitAttestation)

    // Attacker tries to forge attestation claiming victim's clientId
    const forgedAttestation = createClientIdAttestation(42, victim.did, attackerKey, 'room')
    // This will fail verification because attackerKey doesn't match victim's DID
    expect(verifyClientIdAttestation(forgedAttestation).valid).toBe(false)

    // Attacker can't override the binding
    // (In real code, server would reject unverified attestation)
  })

  it('handles client rejoin with new clientId', () => {
    const { identity, privateKey } = generateIdentity()
    const map = new ClientIdMapImpl()

    // Initial join
    map.register(createClientIdAttestation(100, identity.did, privateKey, 'room'))
    expect(map.getOwner(100)).toBe(identity.did)

    // Browser refresh - new clientId
    map.register(createClientIdAttestation(200, identity.did, privateKey, 'room'))

    // Old clientId no longer bound
    expect(map.getOwner(100)).toBeUndefined()
    // New clientId bound
    expect(map.getOwner(200)).toBe(identity.did)
    // DID maps to new clientId
    expect(map.getClientId(identity.did)).toBe(200)
  })
})
