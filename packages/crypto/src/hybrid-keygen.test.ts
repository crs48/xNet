/**
 * Tests for hybrid key generation.
 */
import { describe, it, expect } from 'vitest'
import {
  ML_DSA_65_PUBLIC_KEY_SIZE,
  ML_DSA_65_PRIVATE_KEY_SIZE,
  ML_KEM_768_PUBLIC_KEY_SIZE,
  ML_KEM_768_PRIVATE_KEY_SIZE
} from './constants'
import {
  generateHybridKeyPair,
  deriveHybridKeyPair,
  extractSigningKeys,
  extractPublicKeys,
  keyPairSecurityLevel,
  keyPairCanSignAt,
  keyPairSize,
  serializePublicKeys,
  deserializePublicKeys,
  publicKeysEqual
} from './hybrid-keygen'
import { hybridSign, hybridVerify } from './hybrid-signing'

// ─── Random Generation Tests ─────────────────────────────────────

describe('generateHybridKeyPair', () => {
  it('generates full hybrid keys by default', () => {
    const keys = generateHybridKeyPair()

    // Ed25519
    expect(keys.ed25519.privateKey).toBeInstanceOf(Uint8Array)
    expect(keys.ed25519.privateKey.length).toBe(32)
    expect(keys.ed25519.publicKey.length).toBe(32)

    // X25519
    expect(keys.x25519.privateKey.length).toBe(32)
    expect(keys.x25519.publicKey.length).toBe(32)

    // ML-DSA
    expect(keys.mlDsa).toBeDefined()
    expect(keys.mlDsa!.privateKey.length).toBe(ML_DSA_65_PRIVATE_KEY_SIZE)
    expect(keys.mlDsa!.publicKey.length).toBe(ML_DSA_65_PUBLIC_KEY_SIZE)

    // ML-KEM
    expect(keys.mlKem).toBeDefined()
    expect(keys.mlKem!.privateKey.length).toBe(ML_KEM_768_PRIVATE_KEY_SIZE)
    expect(keys.mlKem!.publicKey.length).toBe(ML_KEM_768_PUBLIC_KEY_SIZE)
  })

  it('generates classical-only keys when includePQ is false', () => {
    const keys = generateHybridKeyPair({ includePQ: false })

    expect(keys.ed25519.privateKey.length).toBe(32)
    expect(keys.x25519.privateKey.length).toBe(32)
    expect(keys.mlDsa).toBeUndefined()
    expect(keys.mlKem).toBeUndefined()
  })

  it('generates signing-only keys when includeKeyExchange is false', () => {
    const keys = generateHybridKeyPair({ includeKeyExchange: false })

    expect(keys.ed25519.privateKey.length).toBe(32)
    expect(keys.x25519.privateKey.length).toBe(0)
    expect(keys.mlDsa).toBeDefined()
    expect(keys.mlKem).toBeUndefined()
  })

  it('generates minimal keys when both options are false', () => {
    const keys = generateHybridKeyPair({ includePQ: false, includeKeyExchange: false })

    expect(keys.ed25519.privateKey.length).toBe(32)
    expect(keys.x25519.privateKey.length).toBe(0)
    expect(keys.mlDsa).toBeUndefined()
    expect(keys.mlKem).toBeUndefined()
  })

  it('generates different keys each time', () => {
    const keys1 = generateHybridKeyPair()
    const keys2 = generateHybridKeyPair()

    expect(keys1.ed25519.privateKey).not.toEqual(keys2.ed25519.privateKey)
    expect(keys1.mlDsa!.privateKey).not.toEqual(keys2.mlDsa!.privateKey)
  })

  it('generates valid Ed25519 key pair', () => {
    const keys = generateHybridKeyPair({ includePQ: false })
    const message = new TextEncoder().encode('test')

    // Sign and verify with extracted keys
    const sig = hybridSign(message, extractSigningKeys(keys), 0)
    const result = hybridVerify(message, sig, extractPublicKeys(keys))

    expect(result.valid).toBe(true)
  })
})

// ─── Deterministic Derivation Tests ──────────────────────────────

describe('deriveHybridKeyPair', () => {
  const seed = new Uint8Array(32).fill(42)

  it('derives deterministic keys from seed', () => {
    const keys1 = deriveHybridKeyPair(seed)
    const keys2 = deriveHybridKeyPair(seed)

    expect(keys1.ed25519.privateKey).toEqual(keys2.ed25519.privateKey)
    expect(keys1.ed25519.publicKey).toEqual(keys2.ed25519.publicKey)
    expect(keys1.x25519.privateKey).toEqual(keys2.x25519.privateKey)
    expect(keys1.x25519.publicKey).toEqual(keys2.x25519.publicKey)
    expect(keys1.mlDsa!.privateKey).toEqual(keys2.mlDsa!.privateKey)
    expect(keys1.mlDsa!.publicKey).toEqual(keys2.mlDsa!.publicKey)
    expect(keys1.mlKem!.privateKey).toEqual(keys2.mlKem!.privateKey)
    expect(keys1.mlKem!.publicKey).toEqual(keys2.mlKem!.publicKey)
  })

  it('derives different keys from different seeds', () => {
    const seed1 = new Uint8Array(32).fill(1)
    const seed2 = new Uint8Array(32).fill(2)

    const keys1 = deriveHybridKeyPair(seed1)
    const keys2 = deriveHybridKeyPair(seed2)

    expect(keys1.ed25519.privateKey).not.toEqual(keys2.ed25519.privateKey)
    expect(keys1.mlDsa!.privateKey).not.toEqual(keys2.mlDsa!.privateKey)
  })

  it('derives different keys with different versions', () => {
    const keys1 = deriveHybridKeyPair(seed, { version: 'v1' })
    const keys2 = deriveHybridKeyPair(seed, { version: 'v2' })

    expect(keys1.ed25519.privateKey).not.toEqual(keys2.ed25519.privateKey)
    expect(keys1.mlDsa!.privateKey).not.toEqual(keys2.mlDsa!.privateKey)
  })

  it('throws for wrong seed length', () => {
    const shortSeed = new Uint8Array(16)
    expect(() => deriveHybridKeyPair(shortSeed)).toThrow('Seed must be 32 bytes')

    const longSeed = new Uint8Array(64)
    expect(() => deriveHybridKeyPair(longSeed)).toThrow('Seed must be 32 bytes')
  })

  it('respects includePQ option', () => {
    const keys = deriveHybridKeyPair(seed, { includePQ: false })

    expect(keys.ed25519.privateKey.length).toBe(32)
    expect(keys.mlDsa).toBeUndefined()
    expect(keys.mlKem).toBeUndefined()
  })

  it('respects includeKeyExchange option', () => {
    const keys = deriveHybridKeyPair(seed, { includeKeyExchange: false })

    expect(keys.x25519.privateKey.length).toBe(0)
    expect(keys.mlKem).toBeUndefined()
    expect(keys.mlDsa).toBeDefined() // Still has ML-DSA for signing
  })

  it('derived keys work for signing at Level 0', () => {
    const keys = deriveHybridKeyPair(seed)
    const message = new TextEncoder().encode('test message')

    const sig = hybridSign(message, extractSigningKeys(keys), 0)
    const result = hybridVerify(message, sig, extractPublicKeys(keys))

    expect(result.valid).toBe(true)
  })

  it('derived keys work for signing at Level 1', () => {
    const keys = deriveHybridKeyPair(seed)
    const message = new TextEncoder().encode('test message')

    const sig = hybridSign(message, extractSigningKeys(keys), 1)
    const result = hybridVerify(message, sig, extractPublicKeys(keys))

    expect(result.valid).toBe(true)
    expect(result.level).toBe(1)
  })

  it('derived keys work for signing at Level 2', () => {
    const keys = deriveHybridKeyPair(seed)
    const message = new TextEncoder().encode('test message')

    const sig = hybridSign(message, extractSigningKeys(keys), 2)
    const result = hybridVerify(message, sig, extractPublicKeys(keys))

    expect(result.valid).toBe(true)
    expect(result.level).toBe(2)
  })
})

// ─── Key Extraction Tests ────────────────────────────────────────

describe('extractSigningKeys', () => {
  it('extracts Ed25519 key only for classical keys', () => {
    const keyPair = generateHybridKeyPair({ includePQ: false })
    const signingKeys = extractSigningKeys(keyPair)

    expect(signingKeys.ed25519).toBe(keyPair.ed25519.privateKey)
    expect(signingKeys.mlDsa).toBeUndefined()
  })

  it('extracts both keys for hybrid keys', () => {
    const keyPair = generateHybridKeyPair()
    const signingKeys = extractSigningKeys(keyPair)

    expect(signingKeys.ed25519).toBe(keyPair.ed25519.privateKey)
    expect(signingKeys.mlDsa).toBe(keyPair.mlDsa!.privateKey)
  })
})

describe('extractPublicKeys', () => {
  it('extracts Ed25519 public key only for classical keys', () => {
    const keyPair = generateHybridKeyPair({ includePQ: false })
    const publicKeys = extractPublicKeys(keyPair)

    expect(publicKeys.ed25519).toBe(keyPair.ed25519.publicKey)
    expect(publicKeys.mlDsa).toBeUndefined()
  })

  it('extracts both public keys for hybrid keys', () => {
    const keyPair = generateHybridKeyPair()
    const publicKeys = extractPublicKeys(keyPair)

    expect(publicKeys.ed25519).toBe(keyPair.ed25519.publicKey)
    expect(publicKeys.mlDsa).toBe(keyPair.mlDsa!.publicKey)
  })
})

// ─── Security Level Tests ────────────────────────────────────────

describe('keyPairSecurityLevel', () => {
  it('returns 0 for classical-only keys', () => {
    const keys = generateHybridKeyPair({ includePQ: false })
    expect(keyPairSecurityLevel(keys)).toBe(0)
  })

  it('returns 2 for hybrid keys', () => {
    const keys = generateHybridKeyPair()
    expect(keyPairSecurityLevel(keys)).toBe(2)
  })
})

describe('keyPairCanSignAt', () => {
  it('classical keys can only sign at Level 0', () => {
    const keys = generateHybridKeyPair({ includePQ: false })

    expect(keyPairCanSignAt(keys, 0)).toBe(true)
    expect(keyPairCanSignAt(keys, 1)).toBe(false)
    expect(keyPairCanSignAt(keys, 2)).toBe(false)
  })

  it('hybrid keys can sign at all levels', () => {
    const keys = generateHybridKeyPair()

    expect(keyPairCanSignAt(keys, 0)).toBe(true)
    expect(keyPairCanSignAt(keys, 1)).toBe(true)
    expect(keyPairCanSignAt(keys, 2)).toBe(true)
  })

  it('returns false for invalid level', () => {
    const keys = generateHybridKeyPair()
    // @ts-expect-error testing invalid level
    expect(keyPairCanSignAt(keys, 5)).toBe(false)
  })
})

// ─── Size Calculation Tests ──────────────────────────────────────

describe('keyPairSize', () => {
  it('calculates classical-only size', () => {
    const keys = generateHybridKeyPair({ includePQ: false })
    const size = keyPairSize(keys)

    expect(size.privateKeys).toBe(64) // Ed25519 + X25519
    expect(size.publicKeys).toBe(64)
    expect(size.total).toBe(128)
  })

  it('calculates signing-only classical size', () => {
    const keys = generateHybridKeyPair({ includePQ: false, includeKeyExchange: false })
    const size = keyPairSize(keys)

    expect(size.privateKeys).toBe(32) // Ed25519 only
    expect(size.publicKeys).toBe(32)
    expect(size.total).toBe(64)
  })

  it('calculates full hybrid size', () => {
    const keys = generateHybridKeyPair()
    const size = keyPairSize(keys)

    // Private: Ed25519(32) + X25519(32) + ML-DSA(4032) + ML-KEM(2400) = 6496
    expect(size.privateKeys).toBe(6496)
    // Public: Ed25519(32) + X25519(32) + ML-DSA(1952) + ML-KEM(1184) = 3200
    expect(size.publicKeys).toBe(3200)
    expect(size.total).toBe(9696)
  })

  it('calculates signing-only hybrid size', () => {
    const keys = generateHybridKeyPair({ includeKeyExchange: false })
    const size = keyPairSize(keys)

    // Private: Ed25519(32) + ML-DSA(4032) = 4064
    expect(size.privateKeys).toBe(4064)
    // Public: Ed25519(32) + ML-DSA(1952) = 1984
    expect(size.publicKeys).toBe(1984)
    expect(size.total).toBe(6048)
  })
})

// ─── Serialization Tests ─────────────────────────────────────────

describe('Serialization', () => {
  it('round-trips full public keys', () => {
    const keys = generateHybridKeyPair()
    const serialized = serializePublicKeys(keys)
    const deserialized = deserializePublicKeys(serialized)

    expect(deserialized.ed25519).toEqual(keys.ed25519.publicKey)
    expect(deserialized.x25519).toEqual(keys.x25519.publicKey)
    expect(deserialized.mlDsa).toEqual(keys.mlDsa!.publicKey)
    expect(deserialized.mlKem).toEqual(keys.mlKem!.publicKey)
  })

  it('serializes classical-only keys', () => {
    const keys = generateHybridKeyPair({ includePQ: false })
    const serialized = serializePublicKeys(keys)

    expect(serialized.ed25519).toBeDefined()
    expect(serialized.x25519).toBeDefined()
    expect(serialized.mlDsa).toBeUndefined()
    expect(serialized.mlKem).toBeUndefined()
  })

  it('serializes signing-only keys', () => {
    const keys = generateHybridKeyPair({ includeKeyExchange: false })
    const serialized = serializePublicKeys(keys)

    expect(serialized.ed25519).toBeDefined()
    expect(serialized.x25519).toBeUndefined()
    expect(serialized.mlDsa).toBeDefined()
    expect(serialized.mlKem).toBeUndefined()
  })

  it('serialized format is valid base64', () => {
    const keys = generateHybridKeyPair()
    const serialized = serializePublicKeys(keys)

    // Should be valid base64 strings
    expect(() => atob(serialized.ed25519)).not.toThrow()
    expect(() => atob(serialized.mlDsa!)).not.toThrow()
    expect(() => atob(serialized.mlKem!)).not.toThrow()
  })
})

// ─── Key Comparison Tests ────────────────────────────────────────

describe('publicKeysEqual', () => {
  it('returns true for identical derived keys', () => {
    const seed = new Uint8Array(32).fill(1)
    const keys1 = deriveHybridKeyPair(seed)
    const keys2 = deriveHybridKeyPair(seed)

    expect(publicKeysEqual(keys1, keys2)).toBe(true)
  })

  it('returns false for different keys', () => {
    const keys1 = generateHybridKeyPair()
    const keys2 = generateHybridKeyPair()

    expect(publicKeysEqual(keys1, keys2)).toBe(false)
  })

  it('returns false when PQ presence differs', () => {
    const seed = new Uint8Array(32).fill(1)
    const keys1 = deriveHybridKeyPair(seed)
    const keys2 = deriveHybridKeyPair(seed, { includePQ: false })

    expect(publicKeysEqual(keys1, keys2)).toBe(false)
  })

  it('returns false when only Ed25519 differs', () => {
    const keys1 = generateHybridKeyPair({ includePQ: false })
    const keys2 = generateHybridKeyPair({ includePQ: false })

    expect(publicKeysEqual(keys1, keys2)).toBe(false)
  })
})

// ─── Integration Tests ───────────────────────────────────────────

describe('Integration: sign and verify', () => {
  it('derived keys sign and verify at all levels', () => {
    const seed = new Uint8Array(32).fill(123)
    const keys = deriveHybridKeyPair(seed)
    const message = new TextEncoder().encode('test message for all levels')

    // Level 0
    const sig0 = hybridSign(message, extractSigningKeys(keys), 0)
    expect(hybridVerify(message, sig0, extractPublicKeys(keys)).valid).toBe(true)

    // Level 1
    const sig1 = hybridSign(message, extractSigningKeys(keys), 1)
    expect(hybridVerify(message, sig1, extractPublicKeys(keys)).valid).toBe(true)

    // Level 2
    const sig2 = hybridSign(message, extractSigningKeys(keys), 2)
    expect(hybridVerify(message, sig2, extractPublicKeys(keys)).valid).toBe(true)
  })

  it('random keys sign and verify', () => {
    const keys = generateHybridKeyPair()
    const message = new TextEncoder().encode('random key test')

    const sig = hybridSign(message, extractSigningKeys(keys), 1)
    const result = hybridVerify(message, sig, extractPublicKeys(keys))

    expect(result.valid).toBe(true)
    expect(result.level).toBe(1)
  })

  it('different keys cannot verify each other', () => {
    const keys1 = generateHybridKeyPair()
    const keys2 = generateHybridKeyPair()
    const message = new TextEncoder().encode('cross-key test')

    const sig = hybridSign(message, extractSigningKeys(keys1), 1)
    const result = hybridVerify(message, sig, extractPublicKeys(keys2))

    expect(result.valid).toBe(false)
  })
})

// ─── Performance Sanity Tests ────────────────────────────────────

describe('Performance sanity', () => {
  it('random key generation completes in reasonable time', () => {
    const start = performance.now()
    for (let i = 0; i < 5; i++) {
      generateHybridKeyPair()
    }
    const elapsed = performance.now() - start

    // 5 full hybrid key generations should complete in under 5 seconds
    expect(elapsed).toBeLessThan(5000)
  })

  it('deterministic derivation completes in reasonable time', () => {
    const seed = new Uint8Array(32).fill(1)

    const start = performance.now()
    for (let i = 0; i < 5; i++) {
      deriveHybridKeyPair(seed)
    }
    const elapsed = performance.now() - start

    expect(elapsed).toBeLessThan(5000)
  })
})
