/**
 * Tests for passkey storage serialization/deserialization.
 */
import { describe, it, expect } from 'vitest'
import { serializeRecord, deserializeRecord, type SerializedRecord } from './storage'
import type { StoredPasskeyRecord } from './types'

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

// ─── Tests ───────────────────────────────────────────────────

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
      // Simulate an old serialized record that uses `salt` instead of `encKey`
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
      // Should have migrated salt → encKey
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
      // encKey should be preferred
      expect(deserialized.fallback!.encKey).toEqual(new Uint8Array([40, 41, 42]))
    })
  })
})
