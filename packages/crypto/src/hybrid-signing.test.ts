/**
 * Tests for hybrid signing and verification.
 */
import { ed25519 } from '@noble/curves/ed25519.js'
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js'
import { describe, it, expect, beforeAll } from 'vitest'
import { ML_DSA_65_SIGNATURE_SIZE } from './constants'
import {
  hybridSign,
  hybridVerify,
  hybridVerifyQuick,
  hybridSignBatch,
  hybridVerifyBatch,
  hybridVerifyBatchAsync,
  hybridVerifyAll,
  hybridVerifyAllAsync,
  canSignAtLevel,
  canVerifyAtLevel,
  maxSecurityLevel,
  requiredKeysForLevel,
  type HybridSigningKey,
  type HybridPublicKey
} from './hybrid-signing'
import { DEFAULT_SECURITY_LEVEL } from './security-level'

// ─── Test Fixtures ───────────────────────────────────────────────

describe('hybridSign', () => {
  let ed25519PrivateKey: Uint8Array
  let mlDsaKeys: { publicKey: Uint8Array; secretKey: Uint8Array }
  let hybridKey: HybridSigningKey
  const message = new TextEncoder().encode('test message')

  beforeAll(() => {
    // Generate deterministic Ed25519 keys for tests
    ed25519PrivateKey = new Uint8Array(32).fill(1)

    // Generate ML-DSA keys (not deterministic, but consistent within test run)
    mlDsaKeys = ml_dsa65.keygen()

    hybridKey = {
      ed25519: ed25519PrivateKey,
      mlDsa: mlDsaKeys.secretKey
    }
  })

  describe('Level 0 (Ed25519 only)', () => {
    it('creates signature with only ed25519', () => {
      const sig = hybridSign(message, { ed25519: hybridKey.ed25519 }, 0)

      expect(sig.level).toBe(0)
      expect(sig.ed25519).toBeInstanceOf(Uint8Array)
      expect(sig.ed25519?.length).toBe(64)
      expect(sig.mlDsa).toBeUndefined()
    })

    it('works without ML-DSA key', () => {
      const sig = hybridSign(message, { ed25519: hybridKey.ed25519 }, 0)
      expect(sig.level).toBe(0)
      expect(sig.ed25519).toBeDefined()
    })

    it('produces consistent signatures', () => {
      const sig1 = hybridSign(message, { ed25519: hybridKey.ed25519 }, 0)
      const sig2 = hybridSign(message, { ed25519: hybridKey.ed25519 }, 0)

      // Ed25519 signatures are deterministic
      expect(sig1.ed25519).toEqual(sig2.ed25519)
    })

    it('produces different signatures for different messages', () => {
      const msg1 = new TextEncoder().encode('message 1')
      const msg2 = new TextEncoder().encode('message 2')

      const sig1 = hybridSign(msg1, { ed25519: hybridKey.ed25519 }, 0)
      const sig2 = hybridSign(msg2, { ed25519: hybridKey.ed25519 }, 0)

      expect(sig1.ed25519).not.toEqual(sig2.ed25519)
    })
  })

  describe('Level 1 (Hybrid)', () => {
    it('creates signature with both algorithms', () => {
      const sig = hybridSign(message, hybridKey, 1)

      expect(sig.level).toBe(1)
      expect(sig.ed25519).toBeInstanceOf(Uint8Array)
      expect(sig.ed25519?.length).toBe(64)
      expect(sig.mlDsa).toBeInstanceOf(Uint8Array)
      expect(sig.mlDsa?.length).toBe(ML_DSA_65_SIGNATURE_SIZE)
    })

    it('throws without ML-DSA key', () => {
      expect(() => hybridSign(message, { ed25519: hybridKey.ed25519 }, 1)).toThrow(
        'Level 1 signing requires ML-DSA key'
      )
    })

    it('uses DEFAULT_SECURITY_LEVEL when level not specified', () => {
      if (DEFAULT_SECURITY_LEVEL === 0) {
        // With Level 0 default, it should only produce ed25519
        const sig = hybridSign(message, { ed25519: hybridKey.ed25519 })
        expect(sig.level).toBe(0)
      } else if (DEFAULT_SECURITY_LEVEL === 1) {
        // With Level 1 default, it should produce both
        const sig = hybridSign(message, hybridKey)
        expect(sig.level).toBe(1)
      }
    })
  })

  describe('Level 2 (ML-DSA only)', () => {
    it('creates signature with only mlDsa', () => {
      const sig = hybridSign(message, hybridKey, 2)

      expect(sig.level).toBe(2)
      expect(sig.ed25519).toBeUndefined()
      expect(sig.mlDsa).toBeInstanceOf(Uint8Array)
      expect(sig.mlDsa?.length).toBe(ML_DSA_65_SIGNATURE_SIZE)
    })

    it('throws without ML-DSA key', () => {
      expect(() => hybridSign(message, { ed25519: hybridKey.ed25519 }, 2)).toThrow(
        'Level 2 signing requires ML-DSA key'
      )
    })
  })

  it('throws for invalid level', () => {
    // @ts-expect-error testing invalid level
    expect(() => hybridSign(message, hybridKey, 5)).toThrow('Invalid security level')
  })

  it('handles empty message', () => {
    const emptyMessage = new Uint8Array(0)
    const sig = hybridSign(emptyMessage, { ed25519: hybridKey.ed25519 }, 0)

    expect(sig.level).toBe(0)
    expect(sig.ed25519).toBeDefined()
  })

  it('handles large message', () => {
    const largeMessage = new Uint8Array(1024 * 100).fill(0x42) // 100KB
    const sig = hybridSign(largeMessage, { ed25519: hybridKey.ed25519 }, 0)

    expect(sig.level).toBe(0)
    expect(sig.ed25519?.length).toBe(64)
  })
})

// ─── Verification Tests ──────────────────────────────────────────

describe('hybridVerify', () => {
  let hybridKey: HybridSigningKey
  let hybridPublicKey: HybridPublicKey
  const message = new TextEncoder().encode('test message')

  beforeAll(() => {
    const ed25519PrivateKey = new Uint8Array(32).fill(42)
    const ed25519PublicKey = ed25519.getPublicKey(ed25519PrivateKey)
    const mlDsaKeys = ml_dsa65.keygen()

    hybridKey = {
      ed25519: ed25519PrivateKey,
      mlDsa: mlDsaKeys.secretKey
    }
    hybridPublicKey = {
      ed25519: ed25519PublicKey,
      mlDsa: mlDsaKeys.publicKey
    }
  })

  describe('Level 0 verification', () => {
    it('verifies valid Level 0 signature', () => {
      const sig = hybridSign(message, { ed25519: hybridKey.ed25519 }, 0)
      const result = hybridVerify(message, sig, { ed25519: hybridPublicKey.ed25519 })

      expect(result.valid).toBe(true)
      expect(result.level).toBe(0)
      expect(result.details.ed25519?.verified).toBe(true)
    })

    it('rejects tampered message', () => {
      const sig = hybridSign(message, { ed25519: hybridKey.ed25519 }, 0)
      const tampered = new TextEncoder().encode('tampered message')
      const result = hybridVerify(tampered, sig, { ed25519: hybridPublicKey.ed25519 })

      expect(result.valid).toBe(false)
      expect(result.details.ed25519?.verified).toBe(false)
    })

    it('rejects wrong public key', () => {
      const sig = hybridSign(message, { ed25519: hybridKey.ed25519 }, 0)
      const wrongKey = ed25519.getPublicKey(new Uint8Array(32).fill(99))
      const result = hybridVerify(message, sig, { ed25519: wrongKey })

      expect(result.valid).toBe(false)
    })

    it('rejects corrupted signature', () => {
      const sig = hybridSign(message, { ed25519: hybridKey.ed25519 }, 0)
      sig.ed25519![0] ^= 0xff

      const result = hybridVerify(message, sig, { ed25519: hybridPublicKey.ed25519 })

      expect(result.valid).toBe(false)
      expect(result.details.ed25519?.verified).toBe(false)
    })
  })

  describe('Level 1 verification', () => {
    it('verifies valid Level 1 signature (strict)', () => {
      const sig = hybridSign(message, hybridKey, 1)
      const result = hybridVerify(message, sig, hybridPublicKey)

      expect(result.valid).toBe(true)
      expect(result.level).toBe(1)
      expect(result.details.ed25519?.verified).toBe(true)
      expect(result.details.mlDsa?.verified).toBe(true)
    })

    it('fails if Ed25519 invalid (strict)', () => {
      const sig = hybridSign(message, hybridKey, 1)
      // Corrupt ed25519 signature
      sig.ed25519![0] ^= 0xff

      const result = hybridVerify(message, sig, hybridPublicKey)

      expect(result.valid).toBe(false)
      expect(result.details.ed25519?.verified).toBe(false)
      expect(result.details.mlDsa?.verified).toBe(true)
    })

    it('fails if ML-DSA invalid (strict)', () => {
      const sig = hybridSign(message, hybridKey, 1)
      // Corrupt ML-DSA signature
      sig.mlDsa![0] ^= 0xff

      const result = hybridVerify(message, sig, hybridPublicKey)

      expect(result.valid).toBe(false)
      expect(result.details.ed25519?.verified).toBe(true)
      expect(result.details.mlDsa?.verified).toBe(false)
    })

    it('passes if one valid (permissive - Ed25519 valid)', () => {
      const sig = hybridSign(message, hybridKey, 1)
      // Corrupt ML-DSA signature
      sig.mlDsa![0] ^= 0xff

      const result = hybridVerify(message, sig, hybridPublicKey, { policy: 'permissive' })

      expect(result.valid).toBe(true) // Ed25519 still valid
      expect(result.details.ed25519?.verified).toBe(true)
      expect(result.details.mlDsa?.verified).toBe(false)
    })

    it('passes if one valid (permissive - ML-DSA valid)', () => {
      const sig = hybridSign(message, hybridKey, 1)
      // Corrupt Ed25519 signature
      sig.ed25519![0] ^= 0xff

      const result = hybridVerify(message, sig, hybridPublicKey, { policy: 'permissive' })

      expect(result.valid).toBe(true) // ML-DSA still valid
      expect(result.details.ed25519?.verified).toBe(false)
      expect(result.details.mlDsa?.verified).toBe(true)
    })

    it('fails if both invalid (permissive)', () => {
      const sig = hybridSign(message, hybridKey, 1)
      sig.ed25519![0] ^= 0xff
      sig.mlDsa![0] ^= 0xff

      const result = hybridVerify(message, sig, hybridPublicKey, { policy: 'permissive' })

      expect(result.valid).toBe(false)
    })

    it('fails without ML-DSA public key', () => {
      const sig = hybridSign(message, hybridKey, 1)
      const result = hybridVerify(message, sig, { ed25519: hybridPublicKey.ed25519 })

      expect(result.valid).toBe(false)
      expect(result.details.mlDsa?.error).toContain('No ML-DSA public key')
    })
  })

  describe('Level 2 verification', () => {
    it('verifies valid Level 2 signature', () => {
      const sig = hybridSign(message, hybridKey, 2)
      const result = hybridVerify(message, sig, hybridPublicKey)

      expect(result.valid).toBe(true)
      expect(result.level).toBe(2)
      expect(result.details.mlDsa?.verified).toBe(true)
      expect(result.details.ed25519).toBeUndefined()
    })

    it('rejects corrupted signature', () => {
      const sig = hybridSign(message, hybridKey, 2)
      sig.mlDsa![0] ^= 0xff

      const result = hybridVerify(message, sig, hybridPublicKey)

      expect(result.valid).toBe(false)
    })

    it('rejects wrong public key', () => {
      const sig = hybridSign(message, hybridKey, 2)
      const otherKeys = ml_dsa65.keygen()
      const result = hybridVerify(message, sig, {
        ed25519: hybridPublicKey.ed25519,
        mlDsa: otherKeys.publicKey
      })

      expect(result.valid).toBe(false)
    })

    it('works without Ed25519 public key (not needed for Level 2)', () => {
      const sig = hybridSign(message, hybridKey, 2)
      // Level 2 doesn't need ed25519, but our type requires it
      // In practice, it just won't be verified
      const result = hybridVerify(message, sig, {
        ed25519: new Uint8Array(32),
        mlDsa: hybridPublicKey.mlDsa
      })

      expect(result.valid).toBe(true)
    })
  })

  describe('minLevel option', () => {
    it('rejects signature below minLevel', () => {
      const sig = hybridSign(message, { ed25519: hybridKey.ed25519 }, 0)
      const result = hybridVerify(message, sig, hybridPublicKey, { minLevel: 1 })

      expect(result.valid).toBe(false)
      expect(result.details.ed25519?.error).toContain('below minimum')
    })

    it('accepts signature at minLevel', () => {
      const sig = hybridSign(message, hybridKey, 1)
      const result = hybridVerify(message, sig, hybridPublicKey, { minLevel: 1 })

      expect(result.valid).toBe(true)
    })

    it('accepts signature above minLevel', () => {
      const sig = hybridSign(message, hybridKey, 2)
      const result = hybridVerify(message, sig, hybridPublicKey, { minLevel: 1 })

      expect(result.valid).toBe(true)
    })

    it('rejects Level 1 when minLevel is 2', () => {
      const sig = hybridSign(message, hybridKey, 1)
      const result = hybridVerify(message, sig, hybridPublicKey, { minLevel: 2 })

      expect(result.valid).toBe(false)
    })
  })
})

// ─── hybridVerifyQuick Tests ─────────────────────────────────────

describe('hybridVerifyQuick', () => {
  it('returns true for valid signature', () => {
    const ed25519PrivateKey = new Uint8Array(32).fill(42)
    const ed25519PublicKey = ed25519.getPublicKey(ed25519PrivateKey)
    const message = new TextEncoder().encode('test')
    const sig = hybridSign(message, { ed25519: ed25519PrivateKey }, 0)

    const valid = hybridVerifyQuick(message, sig, { ed25519: ed25519PublicKey })
    expect(valid).toBe(true)
  })

  it('returns false for invalid signature', () => {
    const ed25519PrivateKey = new Uint8Array(32).fill(42)
    const ed25519PublicKey = ed25519.getPublicKey(ed25519PrivateKey)
    const message = new TextEncoder().encode('test')
    const sig = hybridSign(message, { ed25519: ed25519PrivateKey }, 0)
    sig.ed25519![0] ^= 0xff

    const valid = hybridVerifyQuick(message, sig, { ed25519: ed25519PublicKey })
    expect(valid).toBe(false)
  })

  it('accepts options', () => {
    const ed25519PrivateKey = new Uint8Array(32).fill(42)
    const ed25519PublicKey = ed25519.getPublicKey(ed25519PrivateKey)
    const message = new TextEncoder().encode('test')
    const sig = hybridSign(message, { ed25519: ed25519PrivateKey }, 0)

    const valid = hybridVerifyQuick(message, sig, { ed25519: ed25519PublicKey }, { minLevel: 1 })
    expect(valid).toBe(false) // Level 0 signature rejected due to minLevel 1
  })
})

// ─── Batch Operations Tests ──────────────────────────────────────

describe('Batch operations', () => {
  let hybridKey: HybridSigningKey
  let hybridPublicKey: HybridPublicKey
  const messages = [
    new TextEncoder().encode('msg1'),
    new TextEncoder().encode('msg2'),
    new TextEncoder().encode('msg3')
  ]

  beforeAll(() => {
    const ed25519PrivateKey = new Uint8Array(32).fill(42)
    const ed25519PublicKey = ed25519.getPublicKey(ed25519PrivateKey)
    const mlDsaKeys = ml_dsa65.keygen()

    hybridKey = {
      ed25519: ed25519PrivateKey,
      mlDsa: mlDsaKeys.secretKey
    }
    hybridPublicKey = {
      ed25519: ed25519PublicKey,
      mlDsa: mlDsaKeys.publicKey
    }
  })

  describe('hybridSignBatch', () => {
    it('signs multiple messages at Level 0', () => {
      const sigs = hybridSignBatch(messages, { ed25519: hybridKey.ed25519 }, 0)

      expect(sigs).toHaveLength(3)
      sigs.forEach((sig) => {
        expect(sig.level).toBe(0)
        expect(sig.ed25519).toBeDefined()
        expect(sig.mlDsa).toBeUndefined()
      })
    })

    it('signs multiple messages at Level 1', () => {
      const sigs = hybridSignBatch(messages, hybridKey, 1)

      expect(sigs).toHaveLength(3)
      sigs.forEach((sig) => {
        expect(sig.level).toBe(1)
        expect(sig.ed25519).toBeDefined()
        expect(sig.mlDsa).toBeDefined()
      })
    })

    it('produces different signatures for different messages', () => {
      const sigs = hybridSignBatch(messages, { ed25519: hybridKey.ed25519 }, 0)

      expect(sigs[0].ed25519).not.toEqual(sigs[1].ed25519)
      expect(sigs[1].ed25519).not.toEqual(sigs[2].ed25519)
    })
  })

  describe('hybridVerifyBatch', () => {
    it('verifies multiple signatures', () => {
      const sigs = hybridSignBatch(messages, hybridKey, 1)
      const items = messages.map((msg, i) => ({
        message: msg,
        signature: sigs[i],
        publicKeys: hybridPublicKey
      }))

      const results = hybridVerifyBatch(items)

      expect(results).toHaveLength(3)
      results.forEach((r) => expect(r.valid).toBe(true))
    })

    it('returns individual results for mixed valid/invalid', () => {
      const sigs = hybridSignBatch(messages, { ed25519: hybridKey.ed25519 }, 0)
      // Corrupt second signature
      sigs[1].ed25519![0] ^= 0xff

      const items = messages.map((msg, i) => ({
        message: msg,
        signature: sigs[i],
        publicKeys: hybridPublicKey
      }))

      const results = hybridVerifyBatch(items)

      expect(results[0].valid).toBe(true)
      expect(results[1].valid).toBe(false)
      expect(results[2].valid).toBe(true)
    })
  })

  describe('hybridVerifyBatchAsync', () => {
    it('verifies multiple signatures asynchronously', async () => {
      const sigs = hybridSignBatch(messages, hybridKey, 1)
      const items = messages.map((msg, i) => ({
        message: msg,
        signature: sigs[i],
        publicKeys: hybridPublicKey
      }))

      const results = await hybridVerifyBatchAsync(items)

      expect(results).toHaveLength(3)
      results.forEach((r) => expect(r.valid).toBe(true))
    })
  })

  describe('hybridVerifyAll', () => {
    it('returns true when all signatures valid', () => {
      const sigs = hybridSignBatch(messages, { ed25519: hybridKey.ed25519 }, 0)
      const items = messages.map((msg, i) => ({
        message: msg,
        signature: sigs[i],
        publicKeys: hybridPublicKey
      }))

      const valid = hybridVerifyAll(items)
      expect(valid).toBe(true)
    })

    it('returns false when any signature invalid', () => {
      const sigs = hybridSignBatch(messages, { ed25519: hybridKey.ed25519 }, 0)
      sigs[1].ed25519![0] ^= 0xff

      const items = messages.map((msg, i) => ({
        message: msg,
        signature: sigs[i],
        publicKeys: hybridPublicKey
      }))

      const valid = hybridVerifyAll(items)
      expect(valid).toBe(false)
    })
  })

  describe('hybridVerifyAllAsync', () => {
    it('returns true when all signatures valid', async () => {
      const sigs = hybridSignBatch(messages, { ed25519: hybridKey.ed25519 }, 0)
      const items = messages.map((msg, i) => ({
        message: msg,
        signature: sigs[i],
        publicKeys: hybridPublicKey
      }))

      const valid = await hybridVerifyAllAsync(items)
      expect(valid).toBe(true)
    })

    it('returns false when any signature invalid', async () => {
      const sigs = hybridSignBatch(messages, { ed25519: hybridKey.ed25519 }, 0)
      sigs[1].ed25519![0] ^= 0xff

      const items = messages.map((msg, i) => ({
        message: msg,
        signature: sigs[i],
        publicKeys: hybridPublicKey
      }))

      const valid = await hybridVerifyAllAsync(items)
      expect(valid).toBe(false)
    })
  })
})

// ─── Helper Functions Tests ──────────────────────────────────────

describe('Helper functions', () => {
  describe('requiredKeysForLevel', () => {
    it('Level 0 requires only Ed25519', () => {
      const required = requiredKeysForLevel(0)
      expect(required).toEqual({ ed25519: true, mlDsa: false })
    })

    it('Level 1 requires both', () => {
      const required = requiredKeysForLevel(1)
      expect(required).toEqual({ ed25519: true, mlDsa: true })
    })

    it('Level 2 requires only ML-DSA', () => {
      const required = requiredKeysForLevel(2)
      expect(required).toEqual({ ed25519: false, mlDsa: true })
    })

    it('invalid level returns neither', () => {
      // @ts-expect-error testing invalid level
      const required = requiredKeysForLevel(5)
      expect(required).toEqual({ ed25519: false, mlDsa: false })
    })
  })

  describe('canSignAtLevel', () => {
    it('Ed25519 only can sign at Level 0', () => {
      const keys = { ed25519: new Uint8Array(32) }
      expect(canSignAtLevel(keys, 0)).toBe(true)
      expect(canSignAtLevel(keys, 1)).toBe(false)
      expect(canSignAtLevel(keys, 2)).toBe(false)
    })

    it('hybrid keys can sign at all levels', () => {
      const keys = { ed25519: new Uint8Array(32), mlDsa: new Uint8Array(4032) }
      expect(canSignAtLevel(keys, 0)).toBe(true)
      expect(canSignAtLevel(keys, 1)).toBe(true)
      expect(canSignAtLevel(keys, 2)).toBe(true)
    })
  })

  describe('canVerifyAtLevel', () => {
    it('Ed25519 only can verify Level 0', () => {
      const keys: HybridPublicKey = { ed25519: new Uint8Array(32) }
      expect(canVerifyAtLevel(keys, 0)).toBe(true)
      expect(canVerifyAtLevel(keys, 1)).toBe(false)
      expect(canVerifyAtLevel(keys, 2)).toBe(false)
    })

    it('hybrid keys can verify all levels', () => {
      const keys: HybridPublicKey = { ed25519: new Uint8Array(32), mlDsa: new Uint8Array(1952) }
      expect(canVerifyAtLevel(keys, 0)).toBe(true)
      expect(canVerifyAtLevel(keys, 1)).toBe(true)
      expect(canVerifyAtLevel(keys, 2)).toBe(true)
    })
  })

  describe('maxSecurityLevel', () => {
    it('returns 0 for Ed25519 only', () => {
      expect(maxSecurityLevel({ ed25519: new Uint8Array(32) })).toBe(0)
    })

    it('returns 2 for hybrid keys', () => {
      expect(maxSecurityLevel({ ed25519: new Uint8Array(32), mlDsa: new Uint8Array(4032) })).toBe(2)
    })
  })
})

// ─── Edge Cases ──────────────────────────────────────────────────

describe('Edge cases', () => {
  it('handles verification with empty details gracefully', () => {
    const ed25519PrivateKey = new Uint8Array(32).fill(42)
    const ed25519PublicKey = ed25519.getPublicKey(ed25519PrivateKey)
    const message = new TextEncoder().encode('test')
    const sig = hybridSign(message, { ed25519: ed25519PrivateKey }, 0)

    // This should work normally
    const result = hybridVerify(message, sig, { ed25519: ed25519PublicKey })
    expect(result.valid).toBe(true)
  })

  it('empty batch returns empty results', () => {
    const sigs = hybridSignBatch([], { ed25519: new Uint8Array(32).fill(1) }, 0)
    expect(sigs).toHaveLength(0)

    const results = hybridVerifyBatch([])
    expect(results).toHaveLength(0)
  })

  it('single item batch works', () => {
    const ed25519PrivateKey = new Uint8Array(32).fill(42)
    const ed25519PublicKey = ed25519.getPublicKey(ed25519PrivateKey)
    const message = new TextEncoder().encode('single')

    const sigs = hybridSignBatch([message], { ed25519: ed25519PrivateKey }, 0)
    expect(sigs).toHaveLength(1)

    const results = hybridVerifyBatch([
      { message, signature: sigs[0], publicKeys: { ed25519: ed25519PublicKey } }
    ])
    expect(results).toHaveLength(1)
    expect(results[0].valid).toBe(true)
  })
})

// ─── Performance Sanity Tests ────────────────────────────────────

describe('Performance sanity', () => {
  it('Level 0 sign/verify is fast', () => {
    const ed25519PrivateKey = new Uint8Array(32).fill(42)
    const ed25519PublicKey = ed25519.getPublicKey(ed25519PrivateKey)
    const message = new TextEncoder().encode('benchmark message')

    const signStart = performance.now()
    const sigs = []
    for (let i = 0; i < 100; i++) {
      sigs.push(hybridSign(message, { ed25519: ed25519PrivateKey }, 0))
    }
    const signElapsed = performance.now() - signStart

    const verifyStart = performance.now()
    for (const sig of sigs) {
      hybridVerify(message, sig, { ed25519: ed25519PublicKey })
    }
    const verifyElapsed = performance.now() - verifyStart

    // 100 Level 0 operations should complete quickly
    expect(signElapsed).toBeLessThan(1000)
    expect(verifyElapsed).toBeLessThan(1000)
  })
})
