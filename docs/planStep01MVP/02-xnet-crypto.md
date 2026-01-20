# 02: @xnet/crypto

> Encryption, signing, and hashing primitives

**Duration:** 2 weeks
**Dependencies:** Phase 0 foundations

## Overview

This package provides all cryptographic primitives. Uses libsodium via `@noble/ciphers` and `@noble/curves` for portability.

## Package Setup

```bash
cd packages/crypto
pnpm add @noble/hashes @noble/ciphers @noble/curves
pnpm add -D vitest typescript tsup
```

## Directory Structure

```
packages/crypto/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts          # Public exports
│   ├── hashing.ts        # BLAKE3, SHA-256
│   ├── hashing.test.ts
│   ├── symmetric.ts      # XChaCha20-Poly1305
│   ├── symmetric.test.ts
│   ├── asymmetric.ts     # X25519 key exchange
│   ├── asymmetric.test.ts
│   ├── signing.ts        # Ed25519 signatures
│   ├── signing.test.ts
│   ├── random.ts         # Secure random
│   └── utils.ts          # Base64, hex encoding
└── README.md
```

## Implementation

### Hashing (hashing.ts)

```typescript
import { blake3 } from '@noble/hashes/blake3'
import { sha256 } from '@noble/hashes/sha256'

export function hash(data: Uint8Array, algorithm: 'blake3' | 'sha256' = 'blake3'): Uint8Array {
  switch (algorithm) {
    case 'blake3':
      return blake3(data)
    case 'sha256':
      return sha256(data)
  }
}

export function hashHex(data: Uint8Array, algorithm: 'blake3' | 'sha256' = 'blake3'): string {
  return Buffer.from(hash(data, algorithm)).toString('hex')
}

export function hashBase64(data: Uint8Array, algorithm: 'blake3' | 'sha256' = 'blake3'): string {
  return Buffer.from(hash(data, algorithm)).toString('base64url')
}
```

### Tests (hashing.test.ts)

```typescript
import { describe, it, expect } from 'vitest'
import { hash, hashHex } from './hashing'

describe('Hashing', () => {
  it('should produce 32-byte BLAKE3 hash', () => {
    const data = new TextEncoder().encode('test')
    const result = hash(data)
    expect(result).toBeInstanceOf(Uint8Array)
    expect(result.length).toBe(32)
  })

  it('should be deterministic', () => {
    const data = new TextEncoder().encode('hello')
    expect(hashHex(data)).toBe(hashHex(data))
  })

  it('should produce different hashes for different inputs', () => {
    const a = hashHex(new TextEncoder().encode('a'))
    const b = hashHex(new TextEncoder().encode('b'))
    expect(a).not.toBe(b)
  })

  it('should hash 1MB in under 10ms', () => {
    const data = new Uint8Array(1024 * 1024)
    const start = performance.now()
    hash(data)
    expect(performance.now() - start).toBeLessThan(10)
  })
})
```

### Symmetric Encryption (symmetric.ts)

```typescript
import { xchacha20poly1305 } from '@noble/ciphers/chacha'
import { randomBytes } from '@noble/ciphers/webcrypto'

export const NONCE_SIZE = 24
export const KEY_SIZE = 32
export const TAG_SIZE = 16

export interface EncryptedData {
  nonce: Uint8Array
  ciphertext: Uint8Array
}

export function generateKey(): Uint8Array {
  return randomBytes(KEY_SIZE)
}

export function encrypt(plaintext: Uint8Array, key: Uint8Array): EncryptedData {
  if (key.length !== KEY_SIZE) {
    throw new Error(`Key must be ${KEY_SIZE} bytes`)
  }
  const nonce = randomBytes(NONCE_SIZE)
  const cipher = xchacha20poly1305(key, nonce)
  const ciphertext = cipher.encrypt(plaintext)
  return { nonce, ciphertext }
}

export function decrypt(encrypted: EncryptedData, key: Uint8Array): Uint8Array {
  if (key.length !== KEY_SIZE) {
    throw new Error(`Key must be ${KEY_SIZE} bytes`)
  }
  const cipher = xchacha20poly1305(key, encrypted.nonce)
  return cipher.decrypt(encrypted.ciphertext)
}

export function encryptWithNonce(
  plaintext: Uint8Array,
  key: Uint8Array,
  nonce: Uint8Array
): Uint8Array {
  const cipher = xchacha20poly1305(key, nonce)
  return cipher.encrypt(plaintext)
}
```

### Tests (symmetric.test.ts)

```typescript
import { describe, it, expect } from 'vitest'
import { generateKey, encrypt, decrypt, KEY_SIZE } from './symmetric'

describe('Symmetric Encryption', () => {
  it('should generate 32-byte key', () => {
    const key = generateKey()
    expect(key.length).toBe(KEY_SIZE)
  })

  it('should encrypt and decrypt', () => {
    const key = generateKey()
    const plaintext = new TextEncoder().encode('secret message')
    const encrypted = encrypt(plaintext, key)
    const decrypted = decrypt(encrypted, key)
    expect(new TextDecoder().decode(decrypted)).toBe('secret message')
  })

  it('should fail with wrong key', () => {
    const key1 = generateKey()
    const key2 = generateKey()
    const encrypted = encrypt(new TextEncoder().encode('test'), key1)
    expect(() => decrypt(encrypted, key2)).toThrow()
  })

  it('should produce different ciphertext for same plaintext', () => {
    const key = generateKey()
    const plaintext = new TextEncoder().encode('same')
    const a = encrypt(plaintext, key)
    const b = encrypt(plaintext, key)
    expect(a.ciphertext).not.toEqual(b.ciphertext)
  })
})
```

### Key Exchange (asymmetric.ts)

```typescript
import { x25519 } from '@noble/curves/ed25519'
import { randomBytes } from '@noble/ciphers/webcrypto'
import { hkdf } from '@noble/hashes/hkdf'
import { sha256 } from '@noble/hashes/sha256'

export interface KeyPair {
  publicKey: Uint8Array
  privateKey: Uint8Array
}

export function generateKeyPair(): KeyPair {
  const privateKey = randomBytes(32)
  const publicKey = x25519.getPublicKey(privateKey)
  return { publicKey, privateKey }
}

export function deriveSharedSecret(
  privateKey: Uint8Array,
  publicKey: Uint8Array
): Uint8Array {
  const shared = x25519.getSharedSecret(privateKey, publicKey)
  // Derive symmetric key using HKDF
  return hkdf(sha256, shared, undefined, 'xnet-key-exchange', 32)
}
```

### Tests (asymmetric.test.ts)

```typescript
import { describe, it, expect } from 'vitest'
import { generateKeyPair, deriveSharedSecret } from './asymmetric'

describe('Key Exchange', () => {
  it('should generate valid key pair', () => {
    const kp = generateKeyPair()
    expect(kp.publicKey.length).toBe(32)
    expect(kp.privateKey.length).toBe(32)
  })

  it('should derive same shared secret', () => {
    const alice = generateKeyPair()
    const bob = generateKeyPair()

    const aliceShared = deriveSharedSecret(alice.privateKey, bob.publicKey)
    const bobShared = deriveSharedSecret(bob.privateKey, alice.publicKey)

    expect(aliceShared).toEqual(bobShared)
  })
})
```

### Signing (signing.ts)

```typescript
import { ed25519 } from '@noble/curves/ed25519'
import { randomBytes } from '@noble/ciphers/webcrypto'

export interface SigningKeyPair {
  publicKey: Uint8Array
  privateKey: Uint8Array
}

export function generateSigningKeyPair(): SigningKeyPair {
  const privateKey = randomBytes(32)
  const publicKey = ed25519.getPublicKey(privateKey)
  return { publicKey, privateKey }
}

export function sign(message: Uint8Array, privateKey: Uint8Array): Uint8Array {
  return ed25519.sign(message, privateKey)
}

export function verify(
  message: Uint8Array,
  signature: Uint8Array,
  publicKey: Uint8Array
): boolean {
  try {
    return ed25519.verify(signature, message, publicKey)
  } catch {
    return false
  }
}

export function getPublicKeyFromPrivate(privateKey: Uint8Array): Uint8Array {
  return ed25519.getPublicKey(privateKey)
}
```

### Tests (signing.test.ts)

```typescript
import { describe, it, expect } from 'vitest'
import { generateSigningKeyPair, sign, verify } from './signing'

describe('Signing', () => {
  it('should sign and verify', () => {
    const kp = generateSigningKeyPair()
    const message = new TextEncoder().encode('sign this')
    const signature = sign(message, kp.privateKey)
    expect(verify(message, signature, kp.publicKey)).toBe(true)
  })

  it('should reject tampered message', () => {
    const kp = generateSigningKeyPair()
    const message = new TextEncoder().encode('original')
    const signature = sign(message, kp.privateKey)
    const tampered = new TextEncoder().encode('modified')
    expect(verify(tampered, signature, kp.publicKey)).toBe(false)
  })

  it('should reject wrong public key', () => {
    const kp1 = generateSigningKeyPair()
    const kp2 = generateSigningKeyPair()
    const message = new TextEncoder().encode('test')
    const signature = sign(message, kp1.privateKey)
    expect(verify(message, signature, kp2.publicKey)).toBe(false)
  })

  it('should produce 64-byte signatures', () => {
    const kp = generateSigningKeyPair()
    const signature = sign(new TextEncoder().encode('test'), kp.privateKey)
    expect(signature.length).toBe(64)
  })

  it('should verify 1000 signatures per second', () => {
    const kp = generateSigningKeyPair()
    const messages = Array.from({ length: 1000 }, (_, i) =>
      new TextEncoder().encode(`message ${i}`)
    )
    const signatures = messages.map(m => sign(m, kp.privateKey))

    const start = performance.now()
    for (let i = 0; i < 1000; i++) {
      verify(messages[i], signatures[i], kp.publicKey)
    }
    const elapsed = performance.now() - start
    expect(elapsed).toBeLessThan(1000)
  })
})
```

### Public Exports (index.ts)

```typescript
// Hashing
export { hash, hashHex, hashBase64 } from './hashing'

// Symmetric encryption
export {
  generateKey,
  encrypt,
  decrypt,
  encryptWithNonce,
  KEY_SIZE,
  NONCE_SIZE,
  type EncryptedData
} from './symmetric'

// Key exchange
export {
  generateKeyPair,
  deriveSharedSecret,
  type KeyPair
} from './asymmetric'

// Signing
export {
  generateSigningKeyPair,
  sign,
  verify,
  getPublicKeyFromPrivate,
  type SigningKeyPair
} from './signing'

// Utilities
export { randomBytes } from './random'
export { toHex, fromHex, toBase64, fromBase64 } from './utils'
```

## Validation Checklist

- [ ] `pnpm test` passes with >90% coverage
- [ ] BLAKE3 hashes 1MB in <10ms
- [ ] Ed25519 verifies 1000 signatures/second
- [ ] XChaCha20-Poly1305 encrypts/decrypts correctly
- [ ] X25519 key exchange derives same shared secret
- [ ] All functions work in browser and Node.js
- [ ] Package exports are properly typed

## Next Step

Proceed to [03-xnet-identity.md](./03-xnet-identity.md)
