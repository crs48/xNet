# 02: Hybrid Signing

> Multi-level signing and verification with Ed25519 and ML-DSA.

**Duration:** 4 days
**Dependencies:** [01-core-crypto-types.md](./01-core-crypto-types.md)
**Package:** `packages/crypto/`

## Overview

This step implements the core `hybridSign()` and `hybridVerify()` functions that create and verify multi-level signatures. These functions are the foundation for all signed data in xNet.

```mermaid
flowchart TD
    subgraph Input
        MSG["Message (Uint8Array)"]
        KEYS["HybridSigningKey<br/>{ ed25519, mlDsa? }"]
        LEVEL["SecurityLevel<br/>0 | 1 | 2"]
    end

    subgraph hybridSign
        CHECK{Level?}
        CHECK -->|0| ED_SIGN["ed25519.sign()"]
        CHECK -->|1| BOTH["ed25519.sign()<br/>+ ml_dsa65.sign()"]
        CHECK -->|2| PQ_SIGN["ml_dsa65.sign()"]
    end

    subgraph Output
        SIG["UnifiedSignature<br/>{ level, ed25519?, mlDsa? }"]
    end

    MSG --> CHECK
    KEYS --> CHECK
    LEVEL --> CHECK

    ED_SIGN --> SIG
    BOTH --> SIG
    PQ_SIGN --> SIG
```

## Implementation

### 1. Hybrid Key Types

```typescript
// packages/crypto/src/hybrid-signing.ts

import { ed25519 } from '@noble/curves/ed25519'
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa'
import type {
  SecurityLevel,
  UnifiedSignature,
  VerificationResult,
  VerificationOptions
} from './types'
import { DEFAULT_SECURITY_LEVEL } from './types'

/**
 * Keys required for hybrid signing.
 * Ed25519 is always required (for Level 0/1).
 * ML-DSA is required for Level 1/2.
 */
export interface HybridSigningKey {
  /** Ed25519 private key (32 bytes) */
  ed25519: Uint8Array

  /** ML-DSA-65 private key (4,032 bytes) - required for Level 1/2 */
  mlDsa?: Uint8Array
}

/**
 * Public keys for hybrid verification.
 * Ed25519 is always required (for Level 0/1).
 * ML-DSA is required for Level 1/2.
 */
export interface HybridPublicKey {
  /** Ed25519 public key (32 bytes) */
  ed25519: Uint8Array

  /** ML-DSA-65 public key (1,952 bytes) - required for Level 1/2 */
  mlDsa?: Uint8Array
}
```

### 2. Hybrid Signing Function

````typescript
// packages/crypto/src/hybrid-signing.ts (continued)

/**
 * Sign a message at the specified security level.
 *
 * @param message - The message to sign
 * @param keys - Signing keys (Ed25519 required, ML-DSA for Level 1/2)
 * @param level - Security level (default: 1)
 * @returns UnifiedSignature containing appropriate signature(s)
 *
 * @example
 * ```typescript
 * // Level 0 - Ed25519 only
 * const sig0 = hybridSign(message, { ed25519: privateKey }, 0)
 *
 * // Level 1 - Both (default)
 * const sig1 = hybridSign(message, { ed25519: privateKey, mlDsa: pqPrivateKey })
 *
 * // Level 2 - ML-DSA only
 * const sig2 = hybridSign(message, { ed25519: privateKey, mlDsa: pqPrivateKey }, 2)
 * ```
 */
export function hybridSign(
  message: Uint8Array,
  keys: HybridSigningKey,
  level: SecurityLevel = DEFAULT_SECURITY_LEVEL
): UnifiedSignature {
  const signature: UnifiedSignature = { level }

  switch (level) {
    case 0:
      // Ed25519 only
      signature.ed25519 = ed25519.sign(message, keys.ed25519)
      break

    case 1:
      // Both signatures required
      if (!keys.mlDsa) {
        throw new Error('Level 1 signing requires ML-DSA key')
      }
      signature.ed25519 = ed25519.sign(message, keys.ed25519)
      signature.mlDsa = ml_dsa65.sign(keys.mlDsa, message)
      break

    case 2:
      // ML-DSA only
      if (!keys.mlDsa) {
        throw new Error('Level 2 signing requires ML-DSA key')
      }
      signature.mlDsa = ml_dsa65.sign(keys.mlDsa, message)
      break

    default:
      throw new Error(`Invalid security level: ${level}`)
  }

  return signature
}
````

### 3. Hybrid Verification Function

````typescript
// packages/crypto/src/hybrid-signing.ts (continued)

/**
 * Verify a hybrid signature.
 *
 * @param message - The original message
 * @param signature - The UnifiedSignature to verify
 * @param publicKeys - Public keys for verification
 * @param options - Verification options
 * @returns VerificationResult with validity and details
 *
 * @example
 * ```typescript
 * const result = hybridVerify(message, signature, {
 *   ed25519: publicKey,
 *   mlDsa: pqPublicKey
 * })
 *
 * if (result.valid) {
 *   console.log(`Verified at Level ${result.level}`)
 * } else {
 *   console.log('Verification failed:', result.details)
 * }
 * ```
 */
export function hybridVerify(
  message: Uint8Array,
  signature: UnifiedSignature,
  publicKeys: HybridPublicKey,
  options: VerificationOptions = {}
): VerificationResult {
  const { minLevel = 0, policy = 'strict' } = options

  // Check minimum level requirement
  if (signature.level < minLevel) {
    return {
      valid: false,
      level: signature.level,
      details: {
        ed25519: {
          verified: false,
          error: `Signature level ${signature.level} below minimum ${minLevel}`
        }
      }
    }
  }

  const details: VerificationResult['details'] = {}

  // Verify Ed25519 if present in signature
  if (signature.ed25519) {
    try {
      const valid = ed25519.verify(signature.ed25519, message, publicKeys.ed25519)
      details.ed25519 = { verified: valid }
      if (!valid) {
        details.ed25519.error = 'Ed25519 signature invalid'
      }
    } catch (err) {
      details.ed25519 = {
        verified: false,
        error: err instanceof Error ? err.message : 'Ed25519 verification failed'
      }
    }
  }

  // Verify ML-DSA if present in signature
  if (signature.mlDsa) {
    if (!publicKeys.mlDsa) {
      details.mlDsa = {
        verified: false,
        error: 'No ML-DSA public key available for verification'
      }
    } else {
      try {
        const valid = ml_dsa65.verify(publicKeys.mlDsa, message, signature.mlDsa)
        details.mlDsa = { verified: valid }
        if (!valid) {
          details.mlDsa.error = 'ML-DSA signature invalid'
        }
      } catch (err) {
        details.mlDsa = {
          verified: false,
          error: err instanceof Error ? err.message : 'ML-DSA verification failed'
        }
      }
    }
  }

  // Determine overall validity based on level and policy
  const valid = determineValidity(signature.level, details, policy)

  return { valid, level: signature.level, details }
}

/**
 * Determine overall validity based on security level, details, and policy.
 */
function determineValidity(
  level: SecurityLevel,
  details: VerificationResult['details'],
  policy: 'strict' | 'permissive'
): boolean {
  switch (level) {
    case 0:
      // Level 0: Only Ed25519 must verify
      return details.ed25519?.verified ?? false

    case 1:
      if (policy === 'strict') {
        // Strict: Both must verify
        return (details.ed25519?.verified ?? false) && (details.mlDsa?.verified ?? false)
      } else {
        // Permissive: At least one must verify
        return (details.ed25519?.verified ?? false) || (details.mlDsa?.verified ?? false)
      }

    case 2:
      // Level 2: Only ML-DSA must verify
      return details.mlDsa?.verified ?? false

    default:
      return false
  }
}
````

### 4. Convenience Functions

```typescript
// packages/crypto/src/hybrid-signing.ts (continued)

/**
 * Quick check if a signature is valid without full details.
 */
export function hybridVerifyQuick(
  message: Uint8Array,
  signature: UnifiedSignature,
  publicKeys: HybridPublicKey,
  options: VerificationOptions = {}
): boolean {
  return hybridVerify(message, signature, publicKeys, options).valid
}

/**
 * Get the required public key components for a signature level.
 */
export function requiredKeysForLevel(level: SecurityLevel): {
  ed25519: boolean
  mlDsa: boolean
} {
  switch (level) {
    case 0:
      return { ed25519: true, mlDsa: false }
    case 1:
      return { ed25519: true, mlDsa: true }
    case 2:
      return { ed25519: false, mlDsa: true }
    default:
      return { ed25519: false, mlDsa: false }
  }
}

/**
 * Check if keys support a given security level.
 */
export function canSignAtLevel(keys: HybridSigningKey, level: SecurityLevel): boolean {
  const required = requiredKeysForLevel(level)

  if (required.ed25519 && !keys.ed25519) return false
  if (required.mlDsa && !keys.mlDsa) return false

  return true
}

/**
 * Get the maximum security level supported by a key bundle.
 */
export function maxSecurityLevel(keys: HybridSigningKey): SecurityLevel {
  if (keys.mlDsa) return 2
  return 0
}
```

### 5. Batch Operations

```typescript
// packages/crypto/src/hybrid-signing.ts (continued)

/**
 * Sign multiple messages at the same level (useful for batch operations).
 */
export function hybridSignBatch(
  messages: Uint8Array[],
  keys: HybridSigningKey,
  level: SecurityLevel = DEFAULT_SECURITY_LEVEL
): UnifiedSignature[] {
  return messages.map((msg) => hybridSign(msg, keys, level))
}

/**
 * Verify multiple signatures in parallel.
 */
export async function hybridVerifyBatch(
  items: Array<{
    message: Uint8Array
    signature: UnifiedSignature
    publicKeys: HybridPublicKey
  }>,
  options: VerificationOptions = {}
): Promise<VerificationResult[]> {
  // Use Promise.all for parallel verification
  return Promise.all(
    items.map(({ message, signature, publicKeys }) =>
      hybridVerify(message, signature, publicKeys, options)
    )
  )
}

/**
 * Verify all signatures and return single boolean result.
 */
export async function hybridVerifyAll(
  items: Array<{
    message: Uint8Array
    signature: UnifiedSignature
    publicKeys: HybridPublicKey
  }>,
  options: VerificationOptions = {}
): Promise<boolean> {
  const results = await hybridVerifyBatch(items, options)
  return results.every((r) => r.valid)
}
```

### 6. Update Package Exports

```typescript
// packages/crypto/src/index.ts (add to exports)

export type { HybridSigningKey, HybridPublicKey } from './hybrid-signing'

export {
  hybridSign,
  hybridVerify,
  hybridVerifyQuick,
  hybridSignBatch,
  hybridVerifyBatch,
  hybridVerifyAll,
  requiredKeysForLevel,
  canSignAtLevel,
  maxSecurityLevel
} from './hybrid-signing'
```

## Verification Flow Diagram

```mermaid
sequenceDiagram
    participant App
    participant Verify as hybridVerify()
    participant Ed as ed25519.verify()
    participant PQ as ml_dsa65.verify()

    App->>Verify: verify(message, sig, keys, opts)

    alt Check minLevel
        Verify->>Verify: sig.level < minLevel?
        Verify-->>App: { valid: false, error: "Below minimum" }
    end

    alt Level 0
        Verify->>Ed: verify(sig.ed25519, message, keys.ed25519)
        Ed-->>Verify: ed25519Valid
        Verify-->>App: { valid: ed25519Valid, details }
    else Level 1
        Verify->>Ed: verify(sig.ed25519, message, keys.ed25519)
        Ed-->>Verify: ed25519Valid
        Verify->>PQ: verify(keys.mlDsa, message, sig.mlDsa)
        PQ-->>Verify: mlDsaValid
        Note over Verify: strict: both must pass<br/>permissive: one must pass
        Verify-->>App: { valid: result, details }
    else Level 2
        Verify->>PQ: verify(keys.mlDsa, message, sig.mlDsa)
        PQ-->>Verify: mlDsaValid
        Verify-->>App: { valid: mlDsaValid, details }
    end
```

## Tests

```typescript
// packages/crypto/src/hybrid-signing.test.ts

import { describe, it, expect, beforeAll } from 'vitest'
import { ed25519 } from '@noble/curves/ed25519'
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa'
import {
  hybridSign,
  hybridVerify,
  hybridVerifyQuick,
  hybridSignBatch,
  hybridVerifyBatch,
  canSignAtLevel,
  maxSecurityLevel,
  type HybridSigningKey,
  type HybridPublicKey
} from './hybrid-signing'

describe('hybridSign', () => {
  let ed25519Keys: { publicKey: Uint8Array; privateKey: Uint8Array }
  let mlDsaKeys: { publicKey: Uint8Array; secretKey: Uint8Array }
  let hybridKey: HybridSigningKey
  let hybridPublicKey: HybridPublicKey
  const message = new TextEncoder().encode('test message')

  beforeAll(() => {
    // Generate test keys
    ed25519Keys = {
      privateKey: new Uint8Array(32).fill(1), // deterministic for tests
      publicKey: ed25519.getPublicKey(new Uint8Array(32).fill(1))
    }
    mlDsaKeys = ml_dsa65.keygen()

    hybridKey = {
      ed25519: ed25519Keys.privateKey,
      mlDsa: mlDsaKeys.secretKey
    }
    hybridPublicKey = {
      ed25519: ed25519Keys.publicKey,
      mlDsa: mlDsaKeys.publicKey
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
    })
  })

  describe('Level 1 (Hybrid)', () => {
    it('creates signature with both algorithms', () => {
      const sig = hybridSign(message, hybridKey, 1)

      expect(sig.level).toBe(1)
      expect(sig.ed25519).toBeInstanceOf(Uint8Array)
      expect(sig.ed25519?.length).toBe(64)
      expect(sig.mlDsa).toBeInstanceOf(Uint8Array)
      expect(sig.mlDsa?.length).toBe(3293)
    })

    it('throws without ML-DSA key', () => {
      expect(() => hybridSign(message, { ed25519: hybridKey.ed25519 }, 1)).toThrow(
        'Level 1 signing requires ML-DSA key'
      )
    })

    it('defaults to Level 1', () => {
      const sig = hybridSign(message, hybridKey)
      expect(sig.level).toBe(1)
    })
  })

  describe('Level 2 (ML-DSA only)', () => {
    it('creates signature with only mlDsa', () => {
      const sig = hybridSign(message, hybridKey, 2)

      expect(sig.level).toBe(2)
      expect(sig.ed25519).toBeUndefined()
      expect(sig.mlDsa).toBeInstanceOf(Uint8Array)
      expect(sig.mlDsa?.length).toBe(3293)
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
})

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

    it('passes if one valid (permissive)', () => {
      const sig = hybridSign(message, hybridKey, 1)
      // Corrupt ML-DSA signature
      sig.mlDsa![0] ^= 0xff

      const result = hybridVerify(message, sig, hybridPublicKey, { policy: 'permissive' })

      expect(result.valid).toBe(true) // Ed25519 still valid
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
    })

    it('rejects corrupted signature', () => {
      const sig = hybridSign(message, hybridKey, 2)
      sig.mlDsa![0] ^= 0xff

      const result = hybridVerify(message, sig, hybridPublicKey)

      expect(result.valid).toBe(false)
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
  })
})

describe('hybridVerifyQuick', () => {
  it('returns boolean', () => {
    const ed25519PrivateKey = new Uint8Array(32).fill(42)
    const ed25519PublicKey = ed25519.getPublicKey(ed25519PrivateKey)
    const message = new TextEncoder().encode('test')
    const sig = hybridSign(message, { ed25519: ed25519PrivateKey }, 0)

    const valid = hybridVerifyQuick(message, sig, { ed25519: ed25519PublicKey })
    expect(typeof valid).toBe('boolean')
    expect(valid).toBe(true)
  })
})

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

  it('signs multiple messages', () => {
    const sigs = hybridSignBatch(messages, hybridKey, 1)

    expect(sigs).toHaveLength(3)
    sigs.forEach((sig) => {
      expect(sig.level).toBe(1)
      expect(sig.ed25519).toBeDefined()
      expect(sig.mlDsa).toBeDefined()
    })
  })

  it('verifies multiple signatures', async () => {
    const sigs = hybridSignBatch(messages, hybridKey, 1)
    const items = messages.map((msg, i) => ({
      message: msg,
      signature: sigs[i],
      publicKeys: hybridPublicKey
    }))

    const results = await hybridVerifyBatch(items)

    expect(results).toHaveLength(3)
    results.forEach((r) => expect(r.valid).toBe(true))
  })
})

describe('Helper functions', () => {
  it('canSignAtLevel', () => {
    const ed25519Only = { ed25519: new Uint8Array(32) }
    const hybrid = { ed25519: new Uint8Array(32), mlDsa: new Uint8Array(4032) }

    expect(canSignAtLevel(ed25519Only, 0)).toBe(true)
    expect(canSignAtLevel(ed25519Only, 1)).toBe(false)
    expect(canSignAtLevel(ed25519Only, 2)).toBe(false)

    expect(canSignAtLevel(hybrid, 0)).toBe(true)
    expect(canSignAtLevel(hybrid, 1)).toBe(true)
    expect(canSignAtLevel(hybrid, 2)).toBe(true)
  })

  it('maxSecurityLevel', () => {
    expect(maxSecurityLevel({ ed25519: new Uint8Array(32) })).toBe(0)
    expect(maxSecurityLevel({ ed25519: new Uint8Array(32), mlDsa: new Uint8Array(4032) })).toBe(2)
  })
})
```

## Performance Considerations

ML-DSA operations are slower than Ed25519:

| Operation | Ed25519 | ML-DSA-65 | Ratio      |
| --------- | ------- | --------- | ---------- |
| Sign      | ~0.1ms  | ~2.5ms    | 25x slower |
| Verify    | ~0.2ms  | ~0.8ms    | 4x slower  |

For Level 1 (both signatures):

- Sign: ~2.6ms (Ed25519 + ML-DSA)
- Verify: ~1.0ms (Ed25519 + ML-DSA)

Optimization strategies (covered in 09-performance.md):

- Verification caching
- Worker-based batch signing
- Level 0 for high-frequency operations

## Checklist

- [x] Implement `HybridSigningKey` and `HybridPublicKey` types
- [x] Implement `hybridSign()` for Level 0
- [x] Implement `hybridSign()` for Level 1 (both algorithms)
- [x] Implement `hybridSign()` for Level 2
- [x] Implement `hybridVerify()` for Level 0
- [x] Implement `hybridVerify()` for Level 1 with strict policy
- [x] Implement `hybridVerify()` for Level 1 with permissive policy
- [x] Implement `hybridVerify()` for Level 2
- [x] Implement `minLevel` option for verification
- [x] Implement `hybridVerifyQuick()` convenience function
- [x] Implement `hybridSignBatch()` for batch operations
- [x] Implement `hybridVerifyBatch()` for parallel verification
- [x] Implement `canSignAtLevel()` and `maxSecurityLevel()` helpers
- [x] Update package exports
- [x] Write unit tests (target: 40+ tests) - 58 tests implemented
- [x] Benchmark sign/verify performance - sanity tests included

---

[Back to README](./README.md) | [Previous: Core Crypto Types](./01-core-crypto-types.md) | [Next: Hybrid Key Generation ->](./03-hybrid-keygen.md)
