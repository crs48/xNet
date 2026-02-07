/**
 * @xnet/identity - Key bundle tests
 */
import type { HybridKeyBundle } from './types'
import { hybridVerify } from '@xnet/crypto'
import { describe, it, expect, beforeEach } from 'vitest'
import {
  createKeyBundle,
  createKeyBundleWithAttestation,
  signWithBundle,
  verifyWithBundle,
  bundleSecurityLevel,
  bundleCanSignAt,
  bundleSize,
  extractPublicKeys,
  bundlesMatch
} from './key-bundle'
import {
  serializeHybridKeyBundle,
  deserializeHybridKeyBundle,
  serializeKeyBundleToJSON,
  deserializeKeyBundleFromJSON,
  serializeKeyBundleToBinary,
  deserializeKeyBundleFromBinary
} from './key-bundle-storage'
import { MemoryPQKeyRegistry } from './pq-registry'

// ─── createKeyBundle ─────────────────────────────────────────────

describe('createKeyBundle', () => {
  it('creates hybrid bundle by default', () => {
    const bundle = createKeyBundle()

    // Classical keys
    expect(bundle.signingKey.length).toBe(32)
    expect(bundle.encryptionKey.length).toBe(32)

    // PQ keys
    expect(bundle.pqSigningKey).toBeDefined()
    expect(bundle.pqSigningKey!.length).toBe(4032)
    expect(bundle.pqPublicKey).toBeDefined()
    expect(bundle.pqPublicKey!.length).toBe(1952)

    // Identity
    expect(bundle.identity.did).toMatch(/^did:key:z/)
    expect(bundle.identity.publicKey.length).toBe(32)
    expect(bundle.identity.created).toBeGreaterThan(0)

    // Max level
    expect(bundle.maxSecurityLevel).toBe(2)
  })

  it('creates classical-only bundle when requested', () => {
    const bundle = createKeyBundle({ includePQ: false })

    expect(bundle.signingKey.length).toBe(32)
    expect(bundle.encryptionKey.length).toBe(32)
    expect(bundle.pqSigningKey).toBeUndefined()
    expect(bundle.pqPublicKey).toBeUndefined()
    expect(bundle.maxSecurityLevel).toBe(0)
  })

  it('creates deterministic bundle from seed', () => {
    const seed = new Uint8Array(32).fill(42)

    const bundle1 = createKeyBundle({ seed })
    const bundle2 = createKeyBundle({ seed })

    expect(bundle1.signingKey).toEqual(bundle2.signingKey)
    expect(bundle1.encryptionKey).toEqual(bundle2.encryptionKey)
    expect(bundle1.pqSigningKey).toEqual(bundle2.pqSigningKey)
    expect(bundle1.pqPublicKey).toEqual(bundle2.pqPublicKey)
    expect(bundle1.identity.did).toBe(bundle2.identity.did)
  })

  it('creates different bundles from different seeds', () => {
    const bundle1 = createKeyBundle({ seed: new Uint8Array(32).fill(1) })
    const bundle2 = createKeyBundle({ seed: new Uint8Array(32).fill(2) })

    expect(bundle1.identity.did).not.toBe(bundle2.identity.did)
    expect(bundle1.signingKey).not.toEqual(bundle2.signingKey)
  })

  it('creates different random bundles each time', () => {
    const bundle1 = createKeyBundle()
    const bundle2 = createKeyBundle()

    expect(bundle1.identity.did).not.toBe(bundle2.identity.did)
  })

  it('includes ML-KEM encryption keys in hybrid bundle', () => {
    const bundle = createKeyBundle()

    expect(bundle.pqEncryptionKey).toBeDefined()
    expect(bundle.pqEncryptionKey!.length).toBe(2400)
    expect(bundle.pqEncryptionPublicKey).toBeDefined()
    expect(bundle.pqEncryptionPublicKey!.length).toBe(1184)
  })

  it('classical-only bundle has no ML-KEM keys', () => {
    const bundle = createKeyBundle({ includePQ: false })

    expect(bundle.pqEncryptionKey).toBeUndefined()
    expect(bundle.pqEncryptionPublicKey).toBeUndefined()
  })
})

// ─── createKeyBundleWithAttestation ──────────────────────────────

describe('createKeyBundleWithAttestation', () => {
  it('creates bundle and registers attestation', async () => {
    const registry = new MemoryPQKeyRegistry()

    const { bundle, attestation } = await createKeyBundleWithAttestation(registry)

    expect(attestation).not.toBeNull()
    expect(attestation!.did).toBe(bundle.identity.did)

    // Verify attestation is in registry
    const pqKey = await registry.lookup(bundle.identity.did)
    expect(pqKey).toEqual(bundle.pqPublicKey)
  })

  it('returns null attestation for classical bundle', async () => {
    const registry = new MemoryPQKeyRegistry()

    const { bundle, attestation } = await createKeyBundleWithAttestation(registry, {
      includePQ: false
    })

    expect(attestation).toBeNull()
    expect(bundle.maxSecurityLevel).toBe(0)

    // Registry should not have an entry
    const pqKey = await registry.lookup(bundle.identity.did)
    expect(pqKey).toBeNull()
  })

  it('respects expiresInDays option', async () => {
    const registry = new MemoryPQKeyRegistry()

    const { attestation } = await createKeyBundleWithAttestation(registry, {
      expiresInDays: 7
    })

    expect(attestation).not.toBeNull()
    // Expiration should be approximately 7 days in the future
    const expectedExpiry = Date.now() + 7 * 24 * 60 * 60 * 1000
    expect(attestation!.expiresAt).toBeGreaterThan(expectedExpiry - 1000)
    expect(attestation!.expiresAt).toBeLessThan(expectedExpiry + 1000)
  })
})

// ─── signWithBundle / verifyWithBundle ───────────────────────────

describe('signWithBundle / verifyWithBundle', () => {
  let hybridBundle: HybridKeyBundle
  let classicalBundle: HybridKeyBundle
  const message = new TextEncoder().encode('test message')

  beforeEach(() => {
    hybridBundle = createKeyBundle()
    classicalBundle = createKeyBundle({ includePQ: false })
  })

  it('signs and verifies at Level 0', () => {
    const sig = signWithBundle(hybridBundle, message, 0)
    expect(sig.level).toBe(0)
    expect(sig.ed25519).toBeDefined()
    expect(sig.mlDsa).toBeUndefined()

    const valid = verifyWithBundle(hybridBundle, message, sig)
    expect(valid).toBe(true)
  })

  it('signs and verifies at Level 1', () => {
    const sig = signWithBundle(hybridBundle, message, 1)
    expect(sig.level).toBe(1)
    expect(sig.ed25519).toBeDefined()
    expect(sig.mlDsa).toBeDefined()

    const valid = verifyWithBundle(hybridBundle, message, sig)
    expect(valid).toBe(true)
  })

  it('signs and verifies at Level 2', () => {
    const sig = signWithBundle(hybridBundle, message, 2)
    expect(sig.level).toBe(2)
    expect(sig.mlDsa).toBeDefined()

    const valid = verifyWithBundle(hybridBundle, message, sig)
    expect(valid).toBe(true)
  })

  it('defaults to Level 1 for hybrid bundles', () => {
    const sig = signWithBundle(hybridBundle, message)
    expect(sig.level).toBe(1)
  })

  it('defaults to Level 0 for classical bundles', () => {
    const sig = signWithBundle(classicalBundle, message)
    expect(sig.level).toBe(0)
  })

  it('fails verification with wrong message', () => {
    const sig = signWithBundle(hybridBundle, message)
    const wrongMessage = new TextEncoder().encode('wrong message')
    const valid = verifyWithBundle(hybridBundle, wrongMessage, sig)
    expect(valid).toBe(false)
  })

  it('fails verification with wrong bundle', () => {
    const otherBundle = createKeyBundle()
    const sig = signWithBundle(hybridBundle, message)
    const valid = verifyWithBundle(otherBundle, message, sig)
    expect(valid).toBe(false)
  })

  it('Level 1 signature verifies with both algorithms', () => {
    const sig = signWithBundle(hybridBundle, message, 1)

    // Verify with hybridVerify directly to check both
    const result = hybridVerify(message, sig, {
      ed25519: hybridBundle.identity.publicKey,
      mlDsa: hybridBundle.pqPublicKey
    })

    expect(result.valid).toBe(true)
    expect(result.details.ed25519?.verified).toBe(true)
    expect(result.details.mlDsa?.verified).toBe(true)
  })
})

// ─── bundleSecurityLevel / bundleCanSignAt ───────────────────────

describe('bundleSecurityLevel / bundleCanSignAt', () => {
  it('returns correct level for hybrid bundle', () => {
    const bundle = createKeyBundle()
    expect(bundleSecurityLevel(bundle)).toBe(2)
    expect(bundleCanSignAt(bundle, 0)).toBe(true)
    expect(bundleCanSignAt(bundle, 1)).toBe(true)
    expect(bundleCanSignAt(bundle, 2)).toBe(true)
  })

  it('returns correct level for classical bundle', () => {
    const bundle = createKeyBundle({ includePQ: false })
    expect(bundleSecurityLevel(bundle)).toBe(0)
    expect(bundleCanSignAt(bundle, 0)).toBe(true)
    expect(bundleCanSignAt(bundle, 1)).toBe(false)
    expect(bundleCanSignAt(bundle, 2)).toBe(false)
  })

  it('returns false for invalid level', () => {
    const bundle = createKeyBundle()
    expect(bundleCanSignAt(bundle, 3 as never)).toBe(false)
  })
})

// ─── bundleSize ──────────────────────────────────────────────────

describe('bundleSize', () => {
  it('calculates classical bundle size', () => {
    const bundle = createKeyBundle({ includePQ: false })
    const size = bundleSize(bundle)
    expect(size).toBe(32 + 32 + 32) // signing + encryption + identity pubkey
  })

  it('calculates hybrid bundle size', () => {
    const bundle = createKeyBundle()
    const size = bundleSize(bundle)
    // 32 + 32 + 32 (classical) + 4032 + 1952 (PQ signing) + 2400 + 1184 (PQ encryption)
    expect(size).toBe(9664)
  })
})

// ─── extractPublicKeys ───────────────────────────────────────────

describe('extractPublicKeys', () => {
  it('extracts all public keys from hybrid bundle', () => {
    const bundle = createKeyBundle()
    const pubKeys = extractPublicKeys(bundle)

    expect(pubKeys.ed25519).toEqual(bundle.identity.publicKey)
    expect(pubKeys.mlDsa).toEqual(bundle.pqPublicKey)
    expect(pubKeys.mlKem).toEqual(bundle.pqEncryptionPublicKey)
  })

  it('extracts only ed25519 from classical bundle', () => {
    const bundle = createKeyBundle({ includePQ: false })
    const pubKeys = extractPublicKeys(bundle)

    expect(pubKeys.ed25519).toEqual(bundle.identity.publicKey)
    expect(pubKeys.mlDsa).toBeUndefined()
    expect(pubKeys.mlKem).toBeUndefined()
  })
})

// ─── bundlesMatch ────────────────────────────────────────────────

describe('bundlesMatch', () => {
  it('matches bundles with same seed', () => {
    const seed = new Uint8Array(32).fill(123)
    const bundle1 = createKeyBundle({ seed })
    const bundle2 = createKeyBundle({ seed })

    expect(bundlesMatch(bundle1, bundle2)).toBe(true)
  })

  it('does not match different bundles', () => {
    const bundle1 = createKeyBundle()
    const bundle2 = createKeyBundle()

    expect(bundlesMatch(bundle1, bundle2)).toBe(false)
  })
})

// ─── Serialization ───────────────────────────────────────────────

describe('Serialization', () => {
  describe('serializeHybridKeyBundle / deserializeHybridKeyBundle', () => {
    it('round-trips hybrid bundle', () => {
      const original = createKeyBundle()
      const serialized = serializeHybridKeyBundle(original)
      const restored = deserializeHybridKeyBundle(serialized)

      expect(restored.signingKey).toEqual(original.signingKey)
      expect(restored.encryptionKey).toEqual(original.encryptionKey)
      expect(restored.pqSigningKey).toEqual(original.pqSigningKey)
      expect(restored.pqPublicKey).toEqual(original.pqPublicKey)
      expect(restored.pqEncryptionKey).toEqual(original.pqEncryptionKey)
      expect(restored.pqEncryptionPublicKey).toEqual(original.pqEncryptionPublicKey)
      expect(restored.identity.did).toBe(original.identity.did)
      expect(restored.maxSecurityLevel).toBe(original.maxSecurityLevel)
    })

    it('round-trips classical bundle', () => {
      const original = createKeyBundle({ includePQ: false })
      const serialized = serializeHybridKeyBundle(original)
      const restored = deserializeHybridKeyBundle(serialized)

      expect(restored.signingKey).toEqual(original.signingKey)
      expect(restored.encryptionKey).toEqual(original.encryptionKey)
      expect(restored.pqSigningKey).toBeUndefined()
      expect(restored.pqPublicKey).toBeUndefined()
      expect(restored.maxSecurityLevel).toBe(0)
    })

    it('serialized format has correct version', () => {
      const bundle = createKeyBundle()
      const serialized = serializeHybridKeyBundle(bundle)
      expect(serialized.v).toBe(2)
    })

    it('restored bundle can sign and verify', () => {
      const original = createKeyBundle()
      const serialized = serializeHybridKeyBundle(original)
      const restored = deserializeHybridKeyBundle(serialized)

      const message = new TextEncoder().encode('test')
      const sig = signWithBundle(restored, message, 1)
      const valid = verifyWithBundle(restored, message, sig)

      expect(valid).toBe(true)
    })
  })

  describe('serializeKeyBundleToJSON / deserializeKeyBundleFromJSON', () => {
    it('round-trips via JSON string', () => {
      const original = createKeyBundle()
      const json = serializeKeyBundleToJSON(original)
      const restored = deserializeKeyBundleFromJSON(json)

      expect(restored.identity.did).toBe(original.identity.did)
      expect(restored.signingKey).toEqual(original.signingKey)
      expect(restored.pqSigningKey).toEqual(original.pqSigningKey)
    })

    it('produces valid JSON', () => {
      const bundle = createKeyBundle()
      const json = serializeKeyBundleToJSON(bundle)

      expect(() => JSON.parse(json)).not.toThrow()
    })
  })

  describe('serializeKeyBundleToBinary / deserializeKeyBundleFromBinary', () => {
    it('round-trips hybrid bundle in binary', () => {
      const original = createKeyBundle()
      const binary = serializeKeyBundleToBinary(original)
      const restored = deserializeKeyBundleFromBinary(binary)

      expect(restored.signingKey).toEqual(original.signingKey)
      expect(restored.encryptionKey).toEqual(original.encryptionKey)
      expect(restored.pqSigningKey).toEqual(original.pqSigningKey)
      expect(restored.pqPublicKey).toEqual(original.pqPublicKey)
      expect(restored.identity.did).toBe(original.identity.did)
    })

    it('round-trips classical bundle in binary', () => {
      const original = createKeyBundle({ includePQ: false })
      const binary = serializeKeyBundleToBinary(original)
      const restored = deserializeKeyBundleFromBinary(binary)

      expect(restored.signingKey).toEqual(original.signingKey)
      expect(restored.pqSigningKey).toBeUndefined()
      expect(restored.maxSecurityLevel).toBe(0)
    })

    it('binary is more compact than JSON for classical bundle', () => {
      const bundle = createKeyBundle({ includePQ: false })
      const binary = serializeKeyBundleToBinary(bundle)
      const json = serializeKeyBundleToJSON(bundle)

      expect(binary.length).toBeLessThan(json.length)
    })

    it('throws on invalid version', () => {
      const binary = new Uint8Array([99, 0, 0, 0, 0, 0, 0, 0, 0, 0])
      expect(() => deserializeKeyBundleFromBinary(binary)).toThrow('Unsupported key bundle version')
    })

    it('preserves creation timestamp', () => {
      const original = createKeyBundle()
      const binary = serializeKeyBundleToBinary(original)
      const restored = deserializeKeyBundleFromBinary(binary)

      expect(restored.identity.created).toBe(original.identity.created)
    })
  })
})

// ─── Integration Tests ───────────────────────────────────────────

describe('Integration', () => {
  it('deterministic derivation produces same DID across serialization', () => {
    const seed = new Uint8Array(32).fill(99)

    // Create, serialize, deserialize, create again
    const bundle1 = createKeyBundle({ seed })
    const json = serializeKeyBundleToJSON(bundle1)
    const bundle2 = deserializeKeyBundleFromJSON(json)
    const bundle3 = createKeyBundle({ seed })

    expect(bundle1.identity.did).toBe(bundle2.identity.did)
    expect(bundle1.identity.did).toBe(bundle3.identity.did)
  })

  it('signature created by original verifies after deserialization', () => {
    const original = createKeyBundle()
    const message = new TextEncoder().encode('cross-serialization test')
    const sig = signWithBundle(original, message, 1)

    // Serialize and restore
    const binary = serializeKeyBundleToBinary(original)
    const restored = deserializeKeyBundleFromBinary(binary)

    // Original signature should verify with restored bundle
    const valid = verifyWithBundle(restored, message, sig)
    expect(valid).toBe(true)
  })

  it('signature created after deserialization verifies with original', () => {
    const original = createKeyBundle()
    const binary = serializeKeyBundleToBinary(original)
    const restored = deserializeKeyBundleFromBinary(binary)

    const message = new TextEncoder().encode('reverse test')
    const sig = signWithBundle(restored, message, 2)

    // Signature from restored should verify with original
    const valid = verifyWithBundle(original, message, sig)
    expect(valid).toBe(true)
  })

  it('registry attestation lookup works after bundle serialization', async () => {
    const registry = new MemoryPQKeyRegistry()
    const { bundle } = await createKeyBundleWithAttestation(registry)

    // Serialize and restore bundle
    const json = serializeKeyBundleToJSON(bundle)
    const restored = deserializeKeyBundleFromJSON(json)

    // Registry should still have the PQ key
    const pqKey = await registry.lookup(restored.identity.did)
    expect(pqKey).toEqual(restored.pqPublicKey)
  })
})
