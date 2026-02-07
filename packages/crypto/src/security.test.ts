/**
 * Security-focused tests for multi-level cryptography.
 *
 * Tests cover:
 * - Downgrade attack resistance
 * - Key substitution attack resistance
 * - Signature tampering detection
 * - Policy enforcement
 * - Edge cases and error handling
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { generateHybridKeyPair, deriveHybridKeyPair, type HybridKeyPair } from './hybrid-keygen'
import {
  hybridSign,
  hybridVerify,
  hybridVerifyQuick,
  type HybridSigningKey,
  type HybridPublicKey
} from './hybrid-signing'
import { isSecurityLevel } from './security-level'
import { isUnifiedSignature, validateSignature } from './unified-signature'

// ─── Test Fixtures ───────────────────────────────────────────────

describe('Security Hardening', () => {
  let keys: HybridKeyPair
  let signingKey: HybridSigningKey
  let publicKey: HybridPublicKey
  const message = new TextEncoder().encode('important security message')

  beforeAll(() => {
    keys = generateHybridKeyPair()
    signingKey = {
      ed25519: keys.ed25519.privateKey,
      mlDsa: keys.mlDsa!.privateKey
    }
    publicKey = {
      ed25519: keys.ed25519.publicKey,
      mlDsa: keys.mlDsa!.publicKey
    }
  })

  // ─── Downgrade Attack Resistance ─────────────────────────────────

  describe('Downgrade Attack Resistance', () => {
    it('strict policy blocks Level 1 signature missing ML-DSA', () => {
      // Sign at Level 1
      const sig = hybridSign(message, signingKey, 1)

      // Attacker strips ML-DSA signature (downgrade attempt)
      const stripped = {
        level: 1 as const,
        ed25519: sig.ed25519
        // mlDsa intentionally missing
      }

      // Should fail verification even though ed25519 is valid
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = hybridVerify(message, stripped as any, publicKey, { policy: 'strict' })
      expect(result.valid).toBe(false)
      // ML-DSA is missing so it's not verified (undefined or verified=false)
      expect(result.details.mlDsa?.verified).not.toBe(true)
    })

    it('minLevel prevents accepting lower-level signatures', () => {
      // Valid Level 0 signature
      const sig = hybridSign(message, { ed25519: signingKey.ed25519 }, 0)

      // Verification with minLevel=1 rejects it
      const result = hybridVerify(message, sig, publicKey, { minLevel: 1 })

      expect(result.valid).toBe(false)
      expect(result.details.ed25519?.error).toContain('below minimum')
    })

    it('minLevel=2 rejects Level 1 signatures', () => {
      const sig = hybridSign(message, signingKey, 1)
      const result = hybridVerify(message, sig, publicKey, { minLevel: 2 })

      expect(result.valid).toBe(false)
    })

    it('cannot forge Level 1 from Level 0 signature', () => {
      // Create Level 0 signature
      const sig0 = hybridSign(message, { ed25519: signingKey.ed25519 }, 0)

      // Attacker tries to upgrade to Level 1 by adding fake ML-DSA
      const forged = {
        level: 1 as const,
        ed25519: sig0.ed25519,
        mlDsa: new Uint8Array(3309).fill(0) // Garbage ML-DSA signature
      }

      const result = hybridVerify(message, forged, publicKey, { policy: 'strict' })
      expect(result.valid).toBe(false)
      expect(result.details.mlDsa?.verified).toBe(false)
    })

    it('detects level field tampering', () => {
      // Create Level 0 signature
      const sig = hybridSign(message, { ed25519: signingKey.ed25519 }, 0)

      // Attacker changes level field to 1 without adding ML-DSA
      const tampered = { ...sig, level: 1 as const }

      // Validation should catch missing mlDsa for Level 1
      const validation = validateSignature(tampered)
      expect(validation.valid).toBe(false)
      expect(validation.errors.some((e) => e.includes('Level 1') || e.includes('mlDsa'))).toBe(true)
    })
  })

  // ─── Key Substitution Attack Resistance ──────────────────────────

  describe('Key Substitution Attack Resistance', () => {
    it('rejects signature made with different Ed25519 key', () => {
      const attacker = generateHybridKeyPair()

      // Sign with attacker's key
      const sig = hybridSign(message, { ed25519: attacker.ed25519.privateKey }, 0)

      // Try to verify against victim's public key
      const result = hybridVerify(message, sig, publicKey)
      expect(result.valid).toBe(false)
    })

    it('rejects signature made with different ML-DSA key at Level 1', () => {
      const attacker = generateHybridKeyPair()

      // Sign with mixed keys: victim's Ed25519, attacker's ML-DSA
      const mixedSig = hybridSign(
        message,
        {
          ed25519: signingKey.ed25519,
          mlDsa: attacker.mlDsa!.privateKey
        },
        1
      )

      // Strict verification should fail (ML-DSA mismatch)
      const result = hybridVerify(message, mixedSig, publicKey, { policy: 'strict' })
      expect(result.valid).toBe(false)
      expect(result.details.ed25519?.verified).toBe(true) // Ed25519 is verified
      expect(result.details.mlDsa?.verified).toBe(false) // ML-DSA is not verified
    })

    it('rejects swapped public keys', () => {
      const attacker = generateHybridKeyPair()

      // Sign with victim's keys
      const sig = hybridSign(message, signingKey, 1)

      // Try to verify with attacker's public keys
      const result = hybridVerify(message, sig, {
        ed25519: attacker.ed25519.publicKey,
        mlDsa: attacker.mlDsa!.publicKey
      })
      expect(result.valid).toBe(false)
    })

    it('rejects mixed public keys from different entities', () => {
      const other = generateHybridKeyPair()

      // Sign with victim's keys
      const sig = hybridSign(message, signingKey, 1)

      // Try to verify with victim's Ed25519 but other's ML-DSA public key
      const result = hybridVerify(
        message,
        sig,
        {
          ed25519: publicKey.ed25519,
          mlDsa: other.mlDsa!.publicKey
        },
        { policy: 'strict' }
      )
      expect(result.valid).toBe(false)
    })
  })

  // ─── Signature Tampering Detection ───────────────────────────────

  describe('Signature Tampering Detection', () => {
    it('detects single bit flip in Ed25519 signature', () => {
      const sig = hybridSign(message, { ed25519: signingKey.ed25519 }, 0)

      // Flip one bit in signature
      const tampered = { ...sig }
      tampered.ed25519 = new Uint8Array(sig.ed25519!)
      tampered.ed25519[0] ^= 0x01

      const result = hybridVerify(message, tampered, publicKey)
      expect(result.valid).toBe(false)
    })

    it('detects single bit flip in ML-DSA signature', () => {
      const sig = hybridSign(message, signingKey, 1)

      // Flip one bit in ML-DSA signature
      const tampered = { ...sig }
      tampered.mlDsa = new Uint8Array(sig.mlDsa!)
      tampered.mlDsa[100] ^= 0x01

      const result = hybridVerify(message, tampered, publicKey, { policy: 'strict' })
      expect(result.valid).toBe(false)
    })

    it('detects message tampering', () => {
      const sig = hybridSign(message, signingKey, 1)

      const tampered = new TextEncoder().encode('tampered security message')
      const result = hybridVerify(tampered, sig, publicKey)
      expect(result.valid).toBe(false)
    })

    it('detects appended data to message', () => {
      const sig = hybridSign(message, signingKey, 1)

      const extended = new Uint8Array(message.length + 1)
      extended.set(message)
      extended[message.length] = 0x00

      const result = hybridVerify(extended, sig, publicKey)
      expect(result.valid).toBe(false)
    })

    it('detects truncated message', () => {
      const sig = hybridSign(message, signingKey, 1)

      const truncated = message.slice(0, -1)
      const result = hybridVerify(truncated, sig, publicKey)
      expect(result.valid).toBe(false)
    })

    it('rejects completely zeroed signatures', () => {
      const zeroed = {
        level: 0 as const,
        ed25519: new Uint8Array(64)
      }

      const result = hybridVerify(message, zeroed, publicKey)
      expect(result.valid).toBe(false)
    })

    it('rejects signature with wrong size', () => {
      const wrongSize = {
        level: 0 as const,
        ed25519: new Uint8Array(63) // Should be 64
      }

      const validation = validateSignature(wrongSize)
      expect(validation.valid).toBe(false)
      expect(validation.errors.some((e) => e.includes('64 bytes'))).toBe(true)
    })
  })

  // ─── Policy Enforcement ──────────────────────────────────────────

  describe('Policy Enforcement', () => {
    describe('strict policy', () => {
      it('requires both signatures valid at Level 1', () => {
        const sig = hybridSign(message, signingKey, 1)

        // Corrupt ML-DSA signature
        const corrupted = { ...sig, mlDsa: new Uint8Array(sig.mlDsa!) }
        corrupted.mlDsa![0] ^= 0xff

        const result = hybridVerify(message, corrupted, publicKey, { policy: 'strict' })
        expect(result.valid).toBe(false)
      })

      it('is the default policy', () => {
        const sig = hybridSign(message, signingKey, 1)
        const corrupted = { ...sig, mlDsa: new Uint8Array(sig.mlDsa!) }
        corrupted.mlDsa![0] ^= 0xff

        // Default (no policy specified) should behave like strict
        const result = hybridVerify(message, corrupted, publicKey)
        expect(result.valid).toBe(false)
      })
    })

    describe('permissive policy', () => {
      it('accepts one valid signature at Level 1', () => {
        const sig = hybridSign(message, signingKey, 1)

        // Corrupt ML-DSA signature
        const corrupted = { ...sig, mlDsa: new Uint8Array(sig.mlDsa!) }
        corrupted.mlDsa![0] ^= 0xff

        const result = hybridVerify(message, corrupted, publicKey, { policy: 'permissive' })
        expect(result.valid).toBe(true) // Ed25519 still valid
        expect(result.details.ed25519?.verified).toBe(true)
        expect(result.details.mlDsa?.verified).toBe(false)
      })

      it('still requires at least one valid signature', () => {
        const sig = hybridSign(message, signingKey, 1)

        // Corrupt both signatures
        const corrupted = {
          ...sig,
          ed25519: new Uint8Array(64),
          mlDsa: new Uint8Array(3309)
        }

        const result = hybridVerify(message, corrupted, publicKey, { policy: 'permissive' })
        expect(result.valid).toBe(false)
      })
    })
  })

  // ─── Edge Cases ──────────────────────────────────────────────────

  describe('Edge Cases', () => {
    it('handles empty message', () => {
      const emptyMsg = new Uint8Array(0)
      const sig = hybridSign(emptyMsg, signingKey, 1)

      const result = hybridVerify(emptyMsg, sig, publicKey)
      expect(result.valid).toBe(true)
    })

    it('handles very large message', () => {
      const largeMsg = new Uint8Array(1024 * 1024) // 1MB
      for (let i = 0; i < largeMsg.length; i++) {
        largeMsg[i] = i % 256
      }

      const sig = hybridSign(largeMsg, signingKey, 1)
      const result = hybridVerify(largeMsg, sig, publicKey)
      expect(result.valid).toBe(true)
    })

    it('handles message with all zeros', () => {
      const zeroMsg = new Uint8Array(100)
      const sig = hybridSign(zeroMsg, signingKey, 1)

      const result = hybridVerify(zeroMsg, sig, publicKey)
      expect(result.valid).toBe(true)
    })

    it('handles message with all ones', () => {
      const oneMsg = new Uint8Array(100).fill(0xff)
      const sig = hybridSign(oneMsg, signingKey, 1)

      const result = hybridVerify(oneMsg, sig, publicKey)
      expect(result.valid).toBe(true)
    })

    it('different messages produce different signatures', () => {
      const msg1 = new TextEncoder().encode('message 1')
      const msg2 = new TextEncoder().encode('message 2')

      const sig1 = hybridSign(msg1, signingKey, 1)
      const sig2 = hybridSign(msg2, signingKey, 1)

      expect(sig1.ed25519).not.toEqual(sig2.ed25519)
      expect(sig1.mlDsa).not.toEqual(sig2.mlDsa)
    })
  })

  // ─── Type Guards ─────────────────────────────────────────────────

  describe('Type Guards', () => {
    it('isSecurityLevel validates correctly', () => {
      expect(isSecurityLevel(0)).toBe(true)
      expect(isSecurityLevel(1)).toBe(true)
      expect(isSecurityLevel(2)).toBe(true)
      expect(isSecurityLevel(3)).toBe(false)
      expect(isSecurityLevel(-1)).toBe(false)
      expect(isSecurityLevel(0.5)).toBe(false)
      expect(isSecurityLevel(NaN)).toBe(false)
      expect(isSecurityLevel(Infinity)).toBe(false)
      expect(isSecurityLevel('1')).toBe(false)
      expect(isSecurityLevel(null)).toBe(false)
      expect(isSecurityLevel(undefined)).toBe(false)
      expect(isSecurityLevel({})).toBe(false)
    })

    it('isUnifiedSignature validates Level 0 correctly', () => {
      const valid = { level: 0 as const, ed25519: new Uint8Array(64) }
      expect(isUnifiedSignature(valid)).toBe(true)

      const missingEd25519 = { level: 0 as const }
      expect(isUnifiedSignature(missingEd25519)).toBe(false)
    })

    it('isUnifiedSignature validates Level 1 correctly', () => {
      const valid = {
        level: 1 as const,
        ed25519: new Uint8Array(64),
        mlDsa: new Uint8Array(3309)
      }
      expect(isUnifiedSignature(valid)).toBe(true)

      const missingMlDsa = { level: 1 as const, ed25519: new Uint8Array(64) }
      expect(isUnifiedSignature(missingMlDsa)).toBe(false)
    })

    it('isUnifiedSignature validates Level 2 correctly', () => {
      const valid = { level: 2 as const, mlDsa: new Uint8Array(3309) }
      expect(isUnifiedSignature(valid)).toBe(true)

      const missingMlDsa = { level: 2 as const }
      expect(isUnifiedSignature(missingMlDsa)).toBe(false)
    })
  })

  // ─── Deterministic Key Derivation ────────────────────────────────

  describe('Deterministic Key Derivation Security', () => {
    it('same seed produces identical keys', () => {
      const seed = new Uint8Array(32).fill(42)
      const keys1 = deriveHybridKeyPair(seed)
      const keys2 = deriveHybridKeyPair(seed)

      expect(keys1.ed25519.privateKey).toEqual(keys2.ed25519.privateKey)
      expect(keys1.ed25519.publicKey).toEqual(keys2.ed25519.publicKey)
      expect(keys1.mlDsa?.privateKey).toEqual(keys2.mlDsa?.privateKey)
      expect(keys1.mlDsa?.publicKey).toEqual(keys2.mlDsa?.publicKey)
    })

    it('different seeds produce different keys', () => {
      const seed1 = new Uint8Array(32).fill(1)
      const seed2 = new Uint8Array(32).fill(2)

      const keys1 = deriveHybridKeyPair(seed1)
      const keys2 = deriveHybridKeyPair(seed2)

      expect(keys1.ed25519.privateKey).not.toEqual(keys2.ed25519.privateKey)
      expect(keys1.mlDsa?.privateKey).not.toEqual(keys2.mlDsa?.privateKey)
    })

    it('different version strings produce different keys', () => {
      const seed = new Uint8Array(32).fill(42)
      const keys1 = deriveHybridKeyPair(seed, { version: 'v1' })
      const keys2 = deriveHybridKeyPair(seed, { version: 'v2' })

      expect(keys1.ed25519.privateKey).not.toEqual(keys2.ed25519.privateKey)
    })

    it('derived keys work for signing', () => {
      const seed = new Uint8Array(32).fill(99)
      const derivedKeys = deriveHybridKeyPair(seed)

      const sig = hybridSign(
        message,
        {
          ed25519: derivedKeys.ed25519.privateKey,
          mlDsa: derivedKeys.mlDsa!.privateKey
        },
        1
      )

      const result = hybridVerify(message, sig, {
        ed25519: derivedKeys.ed25519.publicKey,
        mlDsa: derivedKeys.mlDsa!.publicKey
      })

      expect(result.valid).toBe(true)
    })
  })

  // ─── Quick Verification ──────────────────────────────────────────

  describe('Quick Verification', () => {
    it('hybridVerifyQuick returns boolean', () => {
      const sig = hybridSign(message, signingKey, 1)
      const valid = hybridVerifyQuick(message, sig, publicKey)

      expect(typeof valid).toBe('boolean')
      expect(valid).toBe(true)
    })

    it('hybridVerifyQuick rejects invalid signatures', () => {
      const sig = hybridSign(message, signingKey, 1)
      sig.ed25519![0] ^= 0xff

      const valid = hybridVerifyQuick(message, sig, publicKey)
      expect(valid).toBe(false)
    })

    it('hybridVerifyQuick respects minLevel', () => {
      const sig = hybridSign(message, { ed25519: signingKey.ed25519 }, 0)
      const valid = hybridVerifyQuick(message, sig, publicKey, { minLevel: 1 })

      expect(valid).toBe(false)
    })
  })
})
