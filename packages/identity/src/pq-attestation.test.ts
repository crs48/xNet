/**
 * Tests for PQ key attestation and registry.
 */
import { ed25519 } from '@noble/curves/ed25519.js'
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js'
import { describe, it, expect, beforeEach, beforeAll } from 'vitest'
import { createDID } from './did'
import {
  createPQKeyAttestation,
  verifyPQKeyAttestation,
  serializeAttestation,
  deserializeAttestation,
  type PQKeyAttestation
} from './pq-attestation'
import { MemoryPQKeyRegistry, createPQKeyRegistry } from './pq-registry'

// ─── Attestation Tests ───────────────────────────────────────────

describe('PQKeyAttestation', () => {
  let ed25519Keys: { publicKey: Uint8Array; privateKey: Uint8Array }
  let mlDsaKeys: { publicKey: Uint8Array; secretKey: Uint8Array }
  let did: string

  beforeAll(() => {
    const privateKey = new Uint8Array(32).fill(42)
    ed25519Keys = {
      privateKey,
      publicKey: ed25519.getPublicKey(privateKey)
    }
    mlDsaKeys = ml_dsa65.keygen()
    did = createDID(ed25519Keys.publicKey)
  })

  describe('createPQKeyAttestation', () => {
    it('creates valid attestation', () => {
      const attestation = createPQKeyAttestation(
        did,
        ed25519Keys.privateKey,
        mlDsaKeys.publicKey,
        mlDsaKeys.secretKey
      )

      expect(attestation.did).toBe(did)
      expect(attestation.pqPublicKey).toEqual(mlDsaKeys.publicKey)
      expect(attestation.algorithm).toBe('ml-dsa-65')
      expect(attestation.timestamp).toBeLessThanOrEqual(Date.now())
      expect(attestation.ed25519Signature.length).toBe(64)
      expect(attestation.pqSignature.length).toBe(3309)
    })

    it('sets expiration when specified', () => {
      const attestation = createPQKeyAttestation(
        did,
        ed25519Keys.privateKey,
        mlDsaKeys.publicKey,
        mlDsaKeys.secretKey,
        { expiresInDays: 30 }
      )

      expect(attestation.expiresAt).toBeDefined()
      expect(attestation.expiresAt! - attestation.timestamp).toBe(30 * 24 * 60 * 60 * 1000)
    })

    it('uses custom timestamp when provided', () => {
      const customTimestamp = 1700000000000
      const attestation = createPQKeyAttestation(
        did,
        ed25519Keys.privateKey,
        mlDsaKeys.publicKey,
        mlDsaKeys.secretKey,
        { timestamp: customTimestamp }
      )

      expect(attestation.timestamp).toBe(customTimestamp)
    })

    it('creates attestation without expiration by default', () => {
      const attestation = createPQKeyAttestation(
        did,
        ed25519Keys.privateKey,
        mlDsaKeys.publicKey,
        mlDsaKeys.secretKey
      )

      expect(attestation.expiresAt).toBeUndefined()
    })
  })

  describe('verifyPQKeyAttestation', () => {
    it('verifies valid attestation', () => {
      const attestation = createPQKeyAttestation(
        did,
        ed25519Keys.privateKey,
        mlDsaKeys.publicKey,
        mlDsaKeys.secretKey
      )

      const result = verifyPQKeyAttestation(attestation)

      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
      expect(result.expired).toBe(false)
    })

    it('rejects tampered Ed25519 signature', () => {
      const attestation = createPQKeyAttestation(
        did,
        ed25519Keys.privateKey,
        mlDsaKeys.publicKey,
        mlDsaKeys.secretKey
      )

      attestation.ed25519Signature[0] ^= 0xff

      const result = verifyPQKeyAttestation(attestation)

      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Ed25519 signature is invalid')
    })

    it('rejects tampered ML-DSA signature', () => {
      const attestation = createPQKeyAttestation(
        did,
        ed25519Keys.privateKey,
        mlDsaKeys.publicKey,
        mlDsaKeys.secretKey
      )

      attestation.pqSignature[0] ^= 0xff

      const result = verifyPQKeyAttestation(attestation)

      expect(result.valid).toBe(false)
      expect(result.errors).toContain('ML-DSA signature is invalid')
    })

    it('rejects both tampered signatures', () => {
      const attestation = createPQKeyAttestation(
        did,
        ed25519Keys.privateKey,
        mlDsaKeys.publicKey,
        mlDsaKeys.secretKey
      )

      attestation.ed25519Signature[0] ^= 0xff
      attestation.pqSignature[0] ^= 0xff

      const result = verifyPQKeyAttestation(attestation)

      expect(result.valid).toBe(false)
      expect(result.errors.length).toBe(2)
    })

    it('rejects expired attestation', () => {
      const attestation = createPQKeyAttestation(
        did,
        ed25519Keys.privateKey,
        mlDsaKeys.publicKey,
        mlDsaKeys.secretKey,
        { timestamp: Date.now() - 2000, expiresInDays: 0 }
      )

      // Force expiration
      attestation.expiresAt = Date.now() - 1

      const result = verifyPQKeyAttestation(attestation)

      expect(result.expired).toBe(true)
      expect(result.errors).toContain('Attestation has expired')
    })

    it('accepts non-expired attestation', () => {
      const attestation = createPQKeyAttestation(
        did,
        ed25519Keys.privateKey,
        mlDsaKeys.publicKey,
        mlDsaKeys.secretKey,
        { expiresInDays: 365 }
      )

      const result = verifyPQKeyAttestation(attestation)

      expect(result.valid).toBe(true)
      expect(result.expired).toBe(false)
    })

    it('rejects attestation with wrong DID', () => {
      // Create attestation with one DID
      const attestation = createPQKeyAttestation(
        did,
        ed25519Keys.privateKey,
        mlDsaKeys.publicKey,
        mlDsaKeys.secretKey
      )

      // Change DID to a different one
      const otherPrivateKey = new Uint8Array(32).fill(99)
      const otherPublicKey = ed25519.getPublicKey(otherPrivateKey)
      attestation.did = createDID(otherPublicKey)

      const result = verifyPQKeyAttestation(attestation)

      expect(result.valid).toBe(false)
    })
  })

  describe('Serialization', () => {
    it('round-trips attestation', () => {
      const original = createPQKeyAttestation(
        did,
        ed25519Keys.privateKey,
        mlDsaKeys.publicKey,
        mlDsaKeys.secretKey,
        { expiresInDays: 365 }
      )

      const wire = serializeAttestation(original)
      const restored = deserializeAttestation(wire)

      expect(restored.did).toBe(original.did)
      expect(restored.pqPublicKey).toEqual(original.pqPublicKey)
      expect(restored.algorithm).toBe(original.algorithm)
      expect(restored.timestamp).toBe(original.timestamp)
      expect(restored.expiresAt).toBe(original.expiresAt)
      expect(restored.ed25519Signature).toEqual(original.ed25519Signature)
      expect(restored.pqSignature).toEqual(original.pqSignature)
    })

    it('round-trips attestation without expiration', () => {
      const original = createPQKeyAttestation(
        did,
        ed25519Keys.privateKey,
        mlDsaKeys.publicKey,
        mlDsaKeys.secretKey
      )

      const wire = serializeAttestation(original)
      const restored = deserializeAttestation(wire)

      expect(restored.expiresAt).toBeUndefined()
    })

    it('serialized attestation is valid JSON', () => {
      const attestation = createPQKeyAttestation(
        did,
        ed25519Keys.privateKey,
        mlDsaKeys.publicKey,
        mlDsaKeys.secretKey
      )

      const wire = serializeAttestation(attestation)
      const jsonString = JSON.stringify(wire)
      const parsed = JSON.parse(jsonString)

      expect(parsed.did).toBe(attestation.did)
      expect(parsed.algorithm).toBe('ml-dsa-65')
    })

    it('restored attestation verifies correctly', () => {
      const original = createPQKeyAttestation(
        did,
        ed25519Keys.privateKey,
        mlDsaKeys.publicKey,
        mlDsaKeys.secretKey
      )

      const wire = serializeAttestation(original)
      const restored = deserializeAttestation(wire)

      const result = verifyPQKeyAttestation(restored)
      expect(result.valid).toBe(true)
    })
  })
})

// ─── Registry Tests ──────────────────────────────────────────────

describe('MemoryPQKeyRegistry', () => {
  let registry: MemoryPQKeyRegistry
  let ed25519Keys: { publicKey: Uint8Array; privateKey: Uint8Array }
  let mlDsaKeys: { publicKey: Uint8Array; secretKey: Uint8Array }
  let did: string
  let attestation: PQKeyAttestation

  beforeAll(() => {
    const privateKey = new Uint8Array(32).fill(42)
    ed25519Keys = {
      privateKey,
      publicKey: ed25519.getPublicKey(privateKey)
    }
    mlDsaKeys = ml_dsa65.keygen()
    did = createDID(ed25519Keys.publicKey)
  })

  beforeEach(() => {
    registry = new MemoryPQKeyRegistry()

    attestation = createPQKeyAttestation(
      did,
      ed25519Keys.privateKey,
      mlDsaKeys.publicKey,
      mlDsaKeys.secretKey
    )
  })

  it('stores and retrieves attestation', async () => {
    await registry.store(attestation)

    const key = await registry.lookup(did)
    expect(key).toEqual(mlDsaKeys.publicKey)
  })

  it('returns null for unknown DID', async () => {
    const key = await registry.lookup('did:key:unknown')
    expect(key).toBeNull()
  })

  it('rejects invalid attestation', async () => {
    attestation.ed25519Signature[0] ^= 0xff

    await expect(registry.store(attestation)).rejects.toThrow('Invalid attestation')
  })

  it('retrieves full attestation', async () => {
    await registry.store(attestation)

    const stored = await registry.getAttestation(did)
    expect(stored).not.toBeNull()
    expect(stored!.did).toBe(did)
    expect(stored!.pqPublicKey).toEqual(mlDsaKeys.publicKey)
  })

  it('returns null attestation for unknown DID', async () => {
    const stored = await registry.getAttestation('did:key:unknown')
    expect(stored).toBeNull()
  })

  it('removes attestation', async () => {
    await registry.store(attestation)
    expect(await registry.has(did)).toBe(true)

    await registry.remove(did)
    expect(await registry.has(did)).toBe(false)
  })

  it('has returns false for unknown DID', async () => {
    expect(await registry.has('did:key:unknown')).toBe(false)
  })

  it('lists all DIDs', async () => {
    await registry.store(attestation)

    // Create second attestation
    const privateKey2 = new Uint8Array(32).fill(99)
    const ed25519Keys2 = {
      privateKey: privateKey2,
      publicKey: ed25519.getPublicKey(privateKey2)
    }
    const mlDsaKeys2 = ml_dsa65.keygen()
    const did2 = createDID(ed25519Keys2.publicKey)
    const attestation2 = createPQKeyAttestation(
      did2,
      ed25519Keys2.privateKey,
      mlDsaKeys2.publicKey,
      mlDsaKeys2.secretKey
    )
    await registry.store(attestation2)

    const dids = await registry.list()
    expect(dids).toHaveLength(2)
    expect(dids).toContain(did)
    expect(dids).toContain(did2)
  })

  it('notifies subscribers on store', async () => {
    const events: Array<{ did: string; key: Uint8Array | null }> = []
    registry.subscribe((d, k) => events.push({ did: d, key: k }))

    await registry.store(attestation)

    expect(events).toHaveLength(1)
    expect(events[0].did).toBe(did)
    expect(events[0].key).toEqual(mlDsaKeys.publicKey)
  })

  it('notifies subscribers on remove', async () => {
    await registry.store(attestation)

    const events: Array<{ did: string; key: Uint8Array | null }> = []
    registry.subscribe((d, k) => events.push({ did: d, key: k }))

    await registry.remove(did)

    expect(events).toHaveLength(1)
    expect(events[0].did).toBe(did)
    expect(events[0].key).toBeNull()
  })

  it('unsubscribe stops notifications', async () => {
    const events: Array<{ did: string; key: Uint8Array | null }> = []
    const unsubscribe = registry.subscribe((d, k) => events.push({ did: d, key: k }))

    await registry.store(attestation)
    expect(events).toHaveLength(1)

    unsubscribe()
    await registry.remove(did)
    expect(events).toHaveLength(1) // No new events
  })

  it('clears all attestations', async () => {
    await registry.store(attestation)
    await registry.clear()

    expect(await registry.list()).toHaveLength(0)
    expect(await registry.has(did)).toBe(false)
  })

  it('handles expired attestation on lookup', async () => {
    // Create attestation that's already expired
    const expiredAttestation = createPQKeyAttestation(
      did,
      ed25519Keys.privateKey,
      mlDsaKeys.publicKey,
      mlDsaKeys.secretKey,
      { timestamp: Date.now() - 2000 }
    )
    expiredAttestation.expiresAt = Date.now() - 1

    // Store it directly (bypassing verification for test)
    // We need to create a valid one first, then modify
    const validAttestation = createPQKeyAttestation(
      did,
      ed25519Keys.privateKey,
      mlDsaKeys.publicKey,
      mlDsaKeys.secretKey
    )
    await registry.store(validAttestation)

    // Now manually set expiration (this simulates time passing)
    const stored = await registry.getAttestation(did)
    stored!.expiresAt = Date.now() - 1

    // Lookup should return null for expired
    const key = await registry.lookup(did)
    expect(key).toBeNull()
  })
})

// ─── Factory Tests ───────────────────────────────────────────────

describe('createPQKeyRegistry', () => {
  it('creates a registry', () => {
    const registry = createPQKeyRegistry()
    expect(registry).toBeDefined()
    expect(registry.store).toBeDefined()
    expect(registry.lookup).toBeDefined()
  })
})

// ─── Integration Tests ───────────────────────────────────────────

describe('Integration', () => {
  it('full workflow: create, store, lookup, verify', async () => {
    // Generate keys
    const privateKey = new Uint8Array(32).fill(123)
    const publicKey = ed25519.getPublicKey(privateKey)
    const mlDsaKeys = ml_dsa65.keygen()
    const did = createDID(publicKey)

    // Create attestation
    const attestation = createPQKeyAttestation(
      did,
      privateKey,
      mlDsaKeys.publicKey,
      mlDsaKeys.secretKey,
      { expiresInDays: 365 }
    )

    // Verify attestation
    const verifyResult = verifyPQKeyAttestation(attestation)
    expect(verifyResult.valid).toBe(true)

    // Store in registry
    const registry = new MemoryPQKeyRegistry()
    await registry.store(attestation)

    // Lookup
    const pqKey = await registry.lookup(did)
    expect(pqKey).toEqual(mlDsaKeys.publicKey)

    // Verify stored attestation
    const storedAttestation = await registry.getAttestation(did)
    const storedResult = verifyPQKeyAttestation(storedAttestation!)
    expect(storedResult.valid).toBe(true)
  })
})
