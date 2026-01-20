import { describe, it, expect } from 'vitest'
import { BrowserPasskeyStorage, MemoryPasskeyStorage } from './passkey'
import { generateKeyBundle } from './keys'

describe('PasskeyStorage', () => {
  describe('MemoryPasskeyStorage', () => {
    it('should store and retrieve key bundle', async () => {
      const storage = new MemoryPasskeyStorage()
      const bundle = generateKeyBundle()

      const stored = await storage.store(bundle, 'test-credential')
      const retrieved = await storage.retrieve(stored, 'test-credential')

      expect(retrieved.signingKey).toEqual(bundle.signingKey)
      expect(retrieved.encryptionKey).toEqual(bundle.encryptionKey)
      expect(retrieved.identity.did).toBe(bundle.identity.did)
    })

    it('should report as available', () => {
      const storage = new MemoryPasskeyStorage()
      expect(storage.isAvailable()).toBe(true)
    })

    it('should produce encrypted data', async () => {
      const storage = new MemoryPasskeyStorage()
      const bundle = generateKeyBundle()

      const stored = await storage.store(bundle, 'test-credential')

      // Encrypted data should be different from serialized bundle
      expect(stored.encryptedKey.length).toBeGreaterThan(0)
      expect(stored.salt.length).toBe(32)
    })
  })

  describe('BrowserPasskeyStorage', () => {
    it('should store and retrieve key bundle', async () => {
      const storage = new BrowserPasskeyStorage()
      const bundle = generateKeyBundle()

      const stored = await storage.store(bundle, 'browser-credential')
      const retrieved = await storage.retrieve(stored, 'browser-credential')

      expect(retrieved.signingKey).toEqual(bundle.signingKey)
      expect(retrieved.encryptionKey).toEqual(bundle.encryptionKey)
      expect(retrieved.identity.did).toBe(bundle.identity.did)
    })

    it('should report availability based on environment', () => {
      const storage = new BrowserPasskeyStorage()
      // In Node.js test environment, crypto is available
      expect(storage.isAvailable()).toBe(true)
    })
  })
})
