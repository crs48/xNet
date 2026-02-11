/**
 * Tests for X25519 key resolution.
 */
import { ed25519 } from '@noble/curves/ed25519.js'
import { describe, it, expect } from 'vitest'
import {
  extractEd25519PubKey,
  ed25519ToX25519,
  ed25519PrivToX25519,
  createDIDFromEd25519PublicKey,
  DefaultPublicKeyResolver,
  type DID
} from './key-resolution'
import { bytesToHex } from './utils'

describe('key-resolution', () => {
  describe('extractEd25519PubKey', () => {
    it('extracts Ed25519 public key from did:key:z6Mk DID', () => {
      // Generate a key pair
      const privateKey = new Uint8Array(32).fill(42)
      const publicKey = ed25519.getPublicKey(privateKey)

      // Create DID from the public key
      const did = createDIDFromEd25519PublicKey(publicKey)

      // Extract should return the same public key
      const extracted = extractEd25519PubKey(did)
      expect(extracted).not.toBeNull()
      expect(bytesToHex(extracted!)).toBe(bytesToHex(publicKey))
    })

    it('returns null for non-Ed25519 DIDs', () => {
      const did = 'did:key:z12345' as DID // Not a valid z6Mk prefix
      expect(extractEd25519PubKey(did)).toBeNull()
    })

    it('returns null for invalid base58 encoding', () => {
      const did = 'did:key:z6MkINVALID!!!' as DID
      expect(extractEd25519PubKey(did)).toBeNull()
    })
  })

  describe('ed25519ToX25519', () => {
    it('converts Ed25519 public key to X25519', () => {
      const privateKey = new Uint8Array(32).fill(42)
      const ed25519PubKey = ed25519.getPublicKey(privateKey)

      const x25519Key = ed25519ToX25519(ed25519PubKey)

      // X25519 key should be 32 bytes
      expect(x25519Key.length).toBe(32)
      // Should not be the same as Ed25519 key
      expect(bytesToHex(x25519Key)).not.toBe(bytesToHex(ed25519PubKey))
    })

    it('is deterministic - same input produces same output', () => {
      const privateKey = new Uint8Array(32).fill(42)
      const ed25519PubKey = ed25519.getPublicKey(privateKey)

      const x25519Key1 = ed25519ToX25519(ed25519PubKey)
      const x25519Key2 = ed25519ToX25519(ed25519PubKey)

      expect(bytesToHex(x25519Key1)).toBe(bytesToHex(x25519Key2))
    })

    it('different Ed25519 keys produce different X25519 keys', () => {
      const privateKey1 = new Uint8Array(32).fill(42)
      const privateKey2 = new Uint8Array(32).fill(43)
      const ed25519PubKey1 = ed25519.getPublicKey(privateKey1)
      const ed25519PubKey2 = ed25519.getPublicKey(privateKey2)

      const x25519Key1 = ed25519ToX25519(ed25519PubKey1)
      const x25519Key2 = ed25519ToX25519(ed25519PubKey2)

      expect(bytesToHex(x25519Key1)).not.toBe(bytesToHex(x25519Key2))
    })
  })

  describe('ed25519PrivToX25519', () => {
    it('converts Ed25519 private key to X25519', () => {
      const ed25519PrivKey = new Uint8Array(32).fill(42)
      const x25519PrivKey = ed25519PrivToX25519(ed25519PrivKey)

      expect(x25519PrivKey.length).toBe(32)
    })
  })

  describe('createDIDFromEd25519PublicKey', () => {
    it('creates a valid did:key:z6Mk DID', () => {
      const privateKey = new Uint8Array(32).fill(42)
      const publicKey = ed25519.getPublicKey(privateKey)

      const did = createDIDFromEd25519PublicKey(publicKey)

      expect(did).toMatch(/^did:key:z6Mk/)
    })

    it('round-trips correctly', () => {
      const privateKey = new Uint8Array(32).fill(42)
      const publicKey = ed25519.getPublicKey(privateKey)

      const did = createDIDFromEd25519PublicKey(publicKey)
      const extracted = extractEd25519PubKey(did)

      expect(bytesToHex(extracted!)).toBe(bytesToHex(publicKey))
    })
  })

  describe('DefaultPublicKeyResolver', () => {
    it('resolves Ed25519 DID to X25519 key without network', async () => {
      const resolver = new DefaultPublicKeyResolver()
      const privateKey = new Uint8Array(32).fill(42)
      const publicKey = ed25519.getPublicKey(privateKey)
      const did = createDIDFromEd25519PublicKey(publicKey)

      const x25519Key = await resolver.resolve(did)

      expect(x25519Key).not.toBeNull()
      expect(x25519Key!.length).toBe(32)
      // Should match the birational conversion
      expect(bytesToHex(x25519Key!)).toBe(bytesToHex(ed25519ToX25519(publicKey)))
    })

    it('caches resolved keys', async () => {
      const resolver = new DefaultPublicKeyResolver()
      const privateKey = new Uint8Array(32).fill(42)
      const publicKey = ed25519.getPublicKey(privateKey)
      const did = createDIDFromEd25519PublicKey(publicKey)

      expect(resolver.getCacheSize()).toBe(0)

      await resolver.resolve(did)
      expect(resolver.getCacheSize()).toBe(1)

      await resolver.resolve(did)
      expect(resolver.getCacheSize()).toBe(1) // Same entry reused
    })

    it('resolveBatch resolves multiple DIDs in parallel', async () => {
      const resolver = new DefaultPublicKeyResolver()

      const dids: DID[] = []
      for (let i = 0; i < 5; i++) {
        const privateKey = new Uint8Array(32).fill(i)
        const publicKey = ed25519.getPublicKey(privateKey)
        dids.push(createDIDFromEd25519PublicKey(publicKey))
      }

      const results = await resolver.resolveBatch(dids)

      expect(results.size).toBe(5)
      for (const did of dids) {
        expect(results.has(did)).toBe(true)
        expect(results.get(did)!.length).toBe(32)
      }
    })

    it('returns null for non-Ed25519 DIDs without hub registry', async () => {
      const resolver = new DefaultPublicKeyResolver() // No hub URL
      const did = 'did:key:z12345other' as DID

      const result = await resolver.resolve(did)
      expect(result).toBeNull()
    })

    it('respects max cache size', async () => {
      const resolver = new DefaultPublicKeyResolver(undefined, 3) // Max 3

      for (let i = 0; i < 5; i++) {
        const privateKey = new Uint8Array(32).fill(i)
        const publicKey = ed25519.getPublicKey(privateKey)
        const did = createDIDFromEd25519PublicKey(publicKey)
        await resolver.resolve(did)
      }

      expect(resolver.getCacheSize()).toBe(3)
    })

    it('clearCache removes all cached entries', async () => {
      const resolver = new DefaultPublicKeyResolver()
      const privateKey = new Uint8Array(32).fill(42)
      const publicKey = ed25519.getPublicKey(privateKey)
      const did = createDIDFromEd25519PublicKey(publicKey)

      await resolver.resolve(did)
      expect(resolver.getCacheSize()).toBe(1)

      resolver.clearCache()
      expect(resolver.getCacheSize()).toBe(0)
    })
  })

  describe('Key invariant', () => {
    it('X25519 from DID resolution matches direct birational conversion', async () => {
      // This is the critical invariant from the V2 review:
      // DID -> Ed25519 pubkey -> X25519 pubkey must be deterministic
      // Both the PublicKeyResolver and seed derivation must produce the same X25519 key

      const resolver = new DefaultPublicKeyResolver()
      const privateKey = new Uint8Array(32).fill(42)
      const publicKey = ed25519.getPublicKey(privateKey)
      const did = createDIDFromEd25519PublicKey(publicKey)

      // Path 1: Resolver extracts Ed25519 from DID, converts to X25519
      const x25519FromResolver = await resolver.resolve(did)

      // Path 2: Direct birational conversion
      const x25519Direct = ed25519ToX25519(publicKey)

      expect(bytesToHex(x25519FromResolver!)).toBe(bytesToHex(x25519Direct))
    })
  })
})
