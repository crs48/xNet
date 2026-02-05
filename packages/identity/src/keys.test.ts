import { randomBytes } from '@xnet/crypto'
import { describe, it, expect } from 'vitest'
import {
  deriveKeyBundle,
  generateKeyBundle,
  serializeKeyBundle,
  deserializeKeyBundle
} from './keys'

describe('Key Management', () => {
  describe('deriveKeyBundle', () => {
    it('should derive deterministic keys from seed', () => {
      const seed = randomBytes(32)
      const bundle1 = deriveKeyBundle(seed)
      const bundle2 = deriveKeyBundle(seed)

      expect(bundle1.signingKey).toEqual(bundle2.signingKey)
      expect(bundle1.encryptionKey).toEqual(bundle2.encryptionKey)
      expect(bundle1.identity.did).toBe(bundle2.identity.did)
    })

    it('should derive different keys from different seeds', () => {
      const seed1 = randomBytes(32)
      const seed2 = randomBytes(32)
      const bundle1 = deriveKeyBundle(seed1)
      const bundle2 = deriveKeyBundle(seed2)

      expect(bundle1.signingKey).not.toEqual(bundle2.signingKey)
      expect(bundle1.encryptionKey).not.toEqual(bundle2.encryptionKey)
    })

    it('should derive different signing and encryption keys', () => {
      const seed = randomBytes(32)
      const bundle = deriveKeyBundle(seed)

      expect(bundle.signingKey).not.toEqual(bundle.encryptionKey)
    })

    it('should produce 32-byte keys', () => {
      const seed = randomBytes(32)
      const bundle = deriveKeyBundle(seed)

      expect(bundle.signingKey.length).toBe(32)
      expect(bundle.encryptionKey.length).toBe(32)
      expect(bundle.identity.publicKey.length).toBe(32)
    })
  })

  describe('generateKeyBundle', () => {
    it('should generate random key bundle', () => {
      const bundle1 = generateKeyBundle()
      const bundle2 = generateKeyBundle()

      expect(bundle1.signingKey).not.toEqual(bundle2.signingKey)
      expect(bundle1.identity.did).not.toBe(bundle2.identity.did)
    })

    it('should produce valid DID', () => {
      const bundle = generateKeyBundle()
      expect(bundle.identity.did).toMatch(/^did:key:z6Mk/)
    })
  })

  describe('serialization', () => {
    it('should round-trip key bundle', () => {
      const original = generateKeyBundle()
      const serialized = serializeKeyBundle(original)
      const restored = deserializeKeyBundle(serialized)

      expect(restored.signingKey).toEqual(original.signingKey)
      expect(restored.encryptionKey).toEqual(original.encryptionKey)
      expect(restored.identity.did).toBe(original.identity.did)
      expect(restored.identity.publicKey).toEqual(original.identity.publicKey)
    })
  })
})
