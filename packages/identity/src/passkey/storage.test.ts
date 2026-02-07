/**
 * Tests for passkey storage serialization/deserialization and IndexedDB operations.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import {
  serializeRecord,
  deserializeRecord,
  type SerializedRecord,
  storeIdentity,
  getStoredIdentity,
  clearStoredIdentity
} from './storage'
import type { StoredPasskeyRecord, PasskeyIdentity, FallbackStorage } from './types'

// ─── Test Data ───────────────────────────────────────────────

function makePrfRecord(): StoredPasskeyRecord {
  return {
    passkey: {
      did: 'did:key:z6MktestPrf',
      publicKey: new Uint8Array([1, 2, 3, 4, 5]),
      credentialId: new Uint8Array([10, 20, 30]),
      createdAt: 1700000000000,
      rpId: 'localhost',
      mode: 'prf'
    }
  }
}

function makeFallbackRecord(): StoredPasskeyRecord {
  return {
    passkey: {
      did: 'did:key:z6MktestFallback',
      publicKey: new Uint8Array([5, 4, 3, 2, 1]),
      credentialId: new Uint8Array([30, 20, 10]),
      createdAt: 1700000001000,
      rpId: 'example.com',
      mode: 'fallback'
    },
    fallback: {
      encryptedBundle: new Uint8Array([100, 101, 102, 103]),
      nonce: new Uint8Array([200, 201, 202]),
      encKey: new Uint8Array([50, 51, 52, 53])
    }
  }
}

function makePasskey(overrides?: Partial<PasskeyIdentity>): PasskeyIdentity {
  return {
    did: 'did:key:z6MktestIDB',
    publicKey: new Uint8Array([1, 2, 3]),
    credentialId: new Uint8Array([4, 5, 6]),
    createdAt: Date.now(),
    rpId: 'localhost',
    mode: 'prf',
    ...overrides
  }
}

// ─── Serialization Tests ─────────────────────────────────────

describe('storage serialization', () => {
  describe('serializeRecord / deserializeRecord round-trip', () => {
    it('round-trips a PRF record', () => {
      const original = makePrfRecord()
      const serialized = serializeRecord(original)
      const deserialized = deserializeRecord(serialized)

      expect(deserialized.passkey.did).toBe(original.passkey.did)
      expect(deserialized.passkey.publicKey).toEqual(original.passkey.publicKey)
      expect(deserialized.passkey.credentialId).toEqual(original.passkey.credentialId)
      expect(deserialized.passkey.createdAt).toBe(original.passkey.createdAt)
      expect(deserialized.passkey.rpId).toBe(original.passkey.rpId)
      expect(deserialized.passkey.mode).toBe('prf')
      expect(deserialized.fallback).toBeUndefined()
    })

    it('round-trips a fallback record', () => {
      const original = makeFallbackRecord()
      const serialized = serializeRecord(original)
      const deserialized = deserializeRecord(serialized)

      expect(deserialized.passkey.did).toBe(original.passkey.did)
      expect(deserialized.passkey.mode).toBe('fallback')
      expect(deserialized.fallback).toBeDefined()
      expect(deserialized.fallback!.encryptedBundle).toEqual(original.fallback!.encryptedBundle)
      expect(deserialized.fallback!.nonce).toEqual(original.fallback!.nonce)
      expect(deserialized.fallback!.encKey).toEqual(original.fallback!.encKey)
    })

    it('produces number arrays in serialized form (not Uint8Array)', () => {
      const record = makePrfRecord()
      const serialized = serializeRecord(record)

      expect(Array.isArray(serialized.passkey.publicKey)).toBe(true)
      expect(Array.isArray(serialized.passkey.credentialId)).toBe(true)
    })

    it('produces Uint8Arrays in deserialized form', () => {
      const record = makeFallbackRecord()
      const serialized = serializeRecord(record)
      const deserialized = deserializeRecord(serialized)

      expect(deserialized.passkey.publicKey).toBeInstanceOf(Uint8Array)
      expect(deserialized.passkey.credentialId).toBeInstanceOf(Uint8Array)
      expect(deserialized.fallback!.encryptedBundle).toBeInstanceOf(Uint8Array)
      expect(deserialized.fallback!.nonce).toBeInstanceOf(Uint8Array)
      expect(deserialized.fallback!.encKey).toBeInstanceOf(Uint8Array)
    })
  })

  describe('migration from salt to encKey', () => {
    it('deserializes old records with salt field', () => {
      const oldSerialized: SerializedRecord = {
        passkey: {
          did: 'did:key:z6Mkold',
          publicKey: [1, 2, 3],
          credentialId: [4, 5, 6],
          createdAt: 1700000000000,
          rpId: 'localhost',
          mode: 'fallback'
        },
        fallback: {
          encryptedBundle: [10, 11, 12],
          nonce: [20, 21, 22],
          encKey: undefined as unknown as number[],
          salt: [30, 31, 32]
        }
      }

      const deserialized = deserializeRecord(oldSerialized)

      expect(deserialized.fallback).toBeDefined()
      expect(deserialized.fallback!.encKey).toEqual(new Uint8Array([30, 31, 32]))
    })

    it('prefers encKey over salt when both present', () => {
      const ambiguous: SerializedRecord = {
        passkey: {
          did: 'did:key:z6Mkboth',
          publicKey: [1],
          credentialId: [2],
          createdAt: 1700000000000,
          rpId: 'localhost',
          mode: 'fallback'
        },
        fallback: {
          encryptedBundle: [10],
          nonce: [20],
          encKey: [40, 41, 42],
          salt: [30, 31, 32]
        }
      }

      const deserialized = deserializeRecord(ambiguous)
      expect(deserialized.fallback!.encKey).toEqual(new Uint8Array([40, 41, 42]))
    })
  })
})

// ─── IndexedDB Storage Tests ─────────────────────────────────

describe('IndexedDB storage', () => {
  beforeEach(async () => {
    // Clear stored identity before each test
    await clearStoredIdentity()
  }, 30000) // Increase timeout for CI environments

  describe('storeIdentity / getStoredIdentity', () => {
    it('stores and retrieves a PRF identity', async () => {
      const passkey = makePasskey()
      await storeIdentity(passkey)

      const stored = await getStoredIdentity()
      expect(stored).not.toBeNull()
      expect(stored!.passkey.did).toBe(passkey.did)
      expect(stored!.passkey.publicKey).toEqual(passkey.publicKey)
      expect(stored!.passkey.credentialId).toEqual(passkey.credentialId)
      expect(stored!.passkey.rpId).toBe('localhost')
      expect(stored!.passkey.mode).toBe('prf')
      expect(stored!.fallback).toBeUndefined()
    })

    it('stores and retrieves a fallback identity with encKey', async () => {
      const passkey = makePasskey({ mode: 'fallback' })
      const fallback: FallbackStorage = {
        encryptedBundle: new Uint8Array([10, 20, 30, 40]),
        nonce: new Uint8Array([50, 60, 70]),
        encKey: new Uint8Array([80, 90, 100])
      }

      await storeIdentity(passkey, fallback)

      const stored = await getStoredIdentity()
      expect(stored).not.toBeNull()
      expect(stored!.passkey.mode).toBe('fallback')
      expect(stored!.fallback).toBeDefined()
      expect(stored!.fallback!.encryptedBundle).toEqual(fallback.encryptedBundle)
      expect(stored!.fallback!.nonce).toEqual(fallback.nonce)
      expect(stored!.fallback!.encKey).toEqual(fallback.encKey)
    })

    it('overwrites previous identity (only one at a time)', async () => {
      const passkey1 = makePasskey({ did: 'did:key:z6Mkfirst' })
      const passkey2 = makePasskey({ did: 'did:key:z6Mksecond' })

      await storeIdentity(passkey1)
      await storeIdentity(passkey2)

      const stored = await getStoredIdentity()
      expect(stored!.passkey.did).toBe('did:key:z6Mksecond')
    })

    it('returns null when no identity stored', async () => {
      const stored = await getStoredIdentity()
      expect(stored).toBeNull()
    })
  })

  describe('clearStoredIdentity', () => {
    it('clears the stored identity', async () => {
      await storeIdentity(makePasskey())
      expect(await getStoredIdentity()).not.toBeNull()

      await clearStoredIdentity()
      expect(await getStoredIdentity()).toBeNull()
    })

    it('does not throw when nothing to clear', async () => {
      await expect(clearStoredIdentity()).resolves.toBeUndefined()
    })
  })

  describe('Uint8Array round-trip through IndexedDB', () => {
    it('preserves Uint8Array data through store/retrieve cycle', async () => {
      const pubKey = new Uint8Array(32).fill(0xab)
      const credId = new Uint8Array(64).fill(0xcd)
      const passkey = makePasskey({
        publicKey: pubKey,
        credentialId: credId
      })

      await storeIdentity(passkey)
      const stored = await getStoredIdentity()

      expect(stored!.passkey.publicKey).toBeInstanceOf(Uint8Array)
      expect(stored!.passkey.publicKey).toEqual(pubKey)
      expect(stored!.passkey.credentialId).toBeInstanceOf(Uint8Array)
      expect(stored!.passkey.credentialId).toEqual(credId)
    })
  })
})
