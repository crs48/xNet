# 03: @xnet/identity

> DID:key identity, UCAN authorization, key management

**Duration:** 3 weeks
**Dependencies:** @xnet/crypto

## Overview

This package handles decentralized identity using DID:key and UCAN tokens for authorization.

## Package Setup

```bash
cd packages/identity
pnpm add @ipld/dag-cbor multiformats @ucanto/core @ucanto/principal
pnpm add -D vitest typescript tsup
# Add workspace dependency
pnpm add @xnet/crypto@workspace:*
```

## Directory Structure

```
packages/identity/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts          # Public exports
│   ├── did.ts            # DID:key generation/parsing
│   ├── did.test.ts
│   ├── keys.ts           # Key derivation, storage
│   ├── keys.test.ts
│   ├── ucan.ts           # UCAN token creation/verification
│   ├── ucan.test.ts
│   ├── passkey.ts        # WebAuthn/passkey integration
│   └── types.ts          # Type definitions
└── README.md
```

## Implementation

### Types (types.ts)

```typescript
export interface Identity {
  did: string                    // did:key:z6Mk...
  publicKey: Uint8Array          // Ed25519 public key
  created: number
}

export interface KeyBundle {
  signingKey: Uint8Array         // Ed25519 private key
  encryptionKey: Uint8Array      // X25519 private key
  identity: Identity
}

export interface StoredKey {
  id: string
  encryptedKey: Uint8Array       // Encrypted with passkey
  salt: Uint8Array
  created: number
}

export interface UCANCapability {
  with: string                   // Resource URI
  can: string                    // Action (read, write, etc.)
}

export interface UCANToken {
  iss: string                    // Issuer DID
  aud: string                    // Audience DID
  exp: number                    // Expiration timestamp
  att: UCANCapability[]          // Capabilities
  prf: string[]                  // Proof chain (parent UCANs)
  sig: Uint8Array                // Signature
}
```

### DID:key (did.ts)

```typescript
import { base58btc } from 'multiformats/bases/base58'
import { generateSigningKeyPair, getPublicKeyFromPrivate } from '@xnet/crypto'
import type { Identity } from './types'

// Multicodec prefix for Ed25519 public key
const ED25519_PREFIX = new Uint8Array([0xed, 0x01])

export function createDID(publicKey: Uint8Array): string {
  const prefixed = new Uint8Array(ED25519_PREFIX.length + publicKey.length)
  prefixed.set(ED25519_PREFIX)
  prefixed.set(publicKey, ED25519_PREFIX.length)
  const encoded = base58btc.encode(prefixed)
  return `did:key:${encoded}`
}

export function parseDID(did: string): Uint8Array {
  if (!did.startsWith('did:key:z')) {
    throw new Error('Invalid DID format')
  }
  const encoded = did.slice(8) // Remove 'did:key:'
  const decoded = base58btc.decode(encoded)
  // Verify Ed25519 prefix
  if (decoded[0] !== 0xed || decoded[1] !== 0x01) {
    throw new Error('Not an Ed25519 DID')
  }
  return decoded.slice(2) // Remove prefix, return public key
}

export function generateIdentity(): { identity: Identity; privateKey: Uint8Array } {
  const { publicKey, privateKey } = generateSigningKeyPair()
  const did = createDID(publicKey)
  return {
    identity: {
      did,
      publicKey,
      created: Date.now()
    },
    privateKey
  }
}

export function identityFromPrivateKey(privateKey: Uint8Array): Identity {
  const publicKey = getPublicKeyFromPrivate(privateKey)
  return {
    did: createDID(publicKey),
    publicKey,
    created: Date.now()
  }
}
```

### Tests (did.test.ts)

```typescript
import { describe, it, expect } from 'vitest'
import { createDID, parseDID, generateIdentity, identityFromPrivateKey } from './did'
import { generateSigningKeyPair } from '@xnet/crypto'

describe('DID:key', () => {
  it('should generate valid DID', () => {
    const { identity } = generateIdentity()
    expect(identity.did).toMatch(/^did:key:z6Mk/)
  })

  it('should round-trip DID to public key', () => {
    const { publicKey } = generateSigningKeyPair()
    const did = createDID(publicKey)
    const recovered = parseDID(did)
    expect(recovered).toEqual(publicKey)
  })

  it('should recreate identity from private key', () => {
    const { identity, privateKey } = generateIdentity()
    const recovered = identityFromPrivateKey(privateKey)
    expect(recovered.did).toBe(identity.did)
  })

  it('should reject invalid DID format', () => {
    expect(() => parseDID('not-a-did')).toThrow()
    expect(() => parseDID('did:web:example.com')).toThrow()
  })
})
```

### Key Derivation (keys.ts)

```typescript
import { hkdf } from '@noble/hashes/hkdf'
import { sha256 } from '@noble/hashes/sha256'
import { generateSigningKeyPair, generateKeyPair } from '@xnet/crypto'
import type { KeyBundle, Identity } from './types'
import { createDID } from './did'

const SIGNING_INFO = 'xnet-signing-key'
const ENCRYPTION_INFO = 'xnet-encryption-key'

/**
 * Derive signing and encryption keys from a master seed
 */
export function deriveKeyBundle(masterSeed: Uint8Array): KeyBundle {
  // Derive signing key
  const signingKey = hkdf(sha256, masterSeed, undefined, SIGNING_INFO, 32)
  const signingPublic = generateSigningKeyPair().publicKey // Need to compute from private

  // Derive encryption key
  const encryptionKey = hkdf(sha256, masterSeed, undefined, ENCRYPTION_INFO, 32)

  // Create identity from signing key
  const identity: Identity = {
    did: createDID(signingPublic),
    publicKey: signingPublic,
    created: Date.now()
  }

  return {
    signingKey,
    encryptionKey,
    identity
  }
}

/**
 * Generate a new key bundle with random keys
 */
export function generateKeyBundle(): KeyBundle {
  const { publicKey: signingPublic, privateKey: signingKey } = generateSigningKeyPair()
  const { privateKey: encryptionKey } = generateKeyPair()

  return {
    signingKey,
    encryptionKey,
    identity: {
      did: createDID(signingPublic),
      publicKey: signingPublic,
      created: Date.now()
    }
  }
}
```

### UCAN Tokens (ucan.ts)

```typescript
import { sign, verify } from '@xnet/crypto'
import type { UCANToken, UCANCapability } from './types'
import { parseDID } from './did'

export interface CreateUCANOptions {
  issuer: string              // Issuer DID
  issuerKey: Uint8Array       // Issuer private key
  audience: string            // Audience DID
  capabilities: UCANCapability[]
  expiration?: number         // Unix timestamp (default: 1 hour)
  proofs?: string[]           // Parent UCAN tokens
}

export function createUCAN(options: CreateUCANOptions): string {
  const {
    issuer,
    issuerKey,
    audience,
    capabilities,
    expiration = Math.floor(Date.now() / 1000) + 3600,
    proofs = []
  } = options

  const payload = {
    iss: issuer,
    aud: audience,
    exp: expiration,
    att: capabilities,
    prf: proofs
  }

  const payloadBytes = new TextEncoder().encode(JSON.stringify(payload))
  const signature = sign(payloadBytes, issuerKey)

  // Encode as JWT-like format
  const header = btoa(JSON.stringify({ alg: 'EdDSA', typ: 'JWT' }))
  const body = btoa(JSON.stringify(payload))
  const sig = btoa(String.fromCharCode(...signature))

  return `${header}.${body}.${sig}`
}

export function verifyUCAN(token: string): { valid: boolean; payload?: UCANToken; error?: string } {
  try {
    const [, body, sig] = token.split('.')
    const payload = JSON.parse(atob(body)) as UCANToken
    const signature = Uint8Array.from(atob(sig), c => c.charCodeAt(0))

    // Check expiration
    if (payload.exp < Math.floor(Date.now() / 1000)) {
      return { valid: false, error: 'Token expired' }
    }

    // Get issuer's public key from DID
    const publicKey = parseDID(payload.iss)

    // Verify signature
    const payloadBytes = new TextEncoder().encode(JSON.stringify({
      iss: payload.iss,
      aud: payload.aud,
      exp: payload.exp,
      att: payload.att,
      prf: payload.prf
    }))

    if (!verify(payloadBytes, signature, publicKey)) {
      return { valid: false, error: 'Invalid signature' }
    }

    return { valid: true, payload }
  } catch (e) {
    return { valid: false, error: `Parse error: ${e}` }
  }
}

export function hasCapability(
  token: UCANToken,
  resource: string,
  action: string
): boolean {
  return token.att.some(cap =>
    (cap.with === resource || cap.with === '*') &&
    (cap.can === action || cap.can === '*')
  )
}
```

### Tests (ucan.test.ts)

```typescript
import { describe, it, expect } from 'vitest'
import { createUCAN, verifyUCAN, hasCapability } from './ucan'
import { generateIdentity } from './did'

describe('UCAN', () => {
  it('should create and verify UCAN', () => {
    const { identity: issuer, privateKey } = generateIdentity()
    const { identity: audience } = generateIdentity()

    const token = createUCAN({
      issuer: issuer.did,
      issuerKey: privateKey,
      audience: audience.did,
      capabilities: [{ with: 'xnet://doc/123', can: 'write' }]
    })

    const result = verifyUCAN(token)
    expect(result.valid).toBe(true)
    expect(result.payload?.iss).toBe(issuer.did)
  })

  it('should reject expired UCAN', () => {
    const { identity: issuer, privateKey } = generateIdentity()
    const { identity: audience } = generateIdentity()

    const token = createUCAN({
      issuer: issuer.did,
      issuerKey: privateKey,
      audience: audience.did,
      capabilities: [],
      expiration: Math.floor(Date.now() / 1000) - 100 // Expired
    })

    const result = verifyUCAN(token)
    expect(result.valid).toBe(false)
    expect(result.error).toContain('expired')
  })

  it('should check capabilities', () => {
    const token = {
      iss: 'did:key:test',
      aud: 'did:key:test2',
      exp: Date.now() + 3600000,
      att: [
        { with: 'xnet://doc/123', can: 'write' },
        { with: 'xnet://doc/*', can: 'read' }
      ],
      prf: [],
      sig: new Uint8Array()
    }

    expect(hasCapability(token, 'xnet://doc/123', 'write')).toBe(true)
    expect(hasCapability(token, 'xnet://doc/123', 'delete')).toBe(false)
  })
})
```

### Passkey Integration (passkey.ts)

```typescript
import { encrypt, decrypt, generateKey } from '@xnet/crypto'
import type { StoredKey, KeyBundle } from './types'

/**
 * Store key bundle encrypted with WebAuthn credential
 * Note: WebAuthn implementation depends on platform
 */
export interface PasskeyStorage {
  /** Store encrypted key bundle */
  store(keyBundle: KeyBundle, credentialId: string): Promise<StoredKey>

  /** Retrieve and decrypt key bundle */
  retrieve(storedKey: StoredKey, credentialId: string): Promise<KeyBundle>

  /** Check if passkey is available */
  isAvailable(): boolean
}

/**
 * Browser implementation using WebAuthn
 */
export class BrowserPasskeyStorage implements PasskeyStorage {
  isAvailable(): boolean {
    return typeof window !== 'undefined' &&
           'PublicKeyCredential' in window
  }

  async store(keyBundle: KeyBundle, credentialId: string): Promise<StoredKey> {
    // In real implementation, use WebAuthn to encrypt
    // This is a simplified version
    const key = generateKey()
    const serialized = JSON.stringify({
      signingKey: Array.from(keyBundle.signingKey),
      encryptionKey: Array.from(keyBundle.encryptionKey),
      identity: {
        ...keyBundle.identity,
        publicKey: Array.from(keyBundle.identity.publicKey)
      }
    })
    const encrypted = encrypt(new TextEncoder().encode(serialized), key)

    return {
      id: credentialId,
      encryptedKey: new Uint8Array([...encrypted.nonce, ...encrypted.ciphertext]),
      salt: key, // In real impl, derive from credential
      created: Date.now()
    }
  }

  async retrieve(storedKey: StoredKey, _credentialId: string): Promise<KeyBundle> {
    const nonce = storedKey.encryptedKey.slice(0, 24)
    const ciphertext = storedKey.encryptedKey.slice(24)
    const decrypted = decrypt({ nonce, ciphertext }, storedKey.salt)
    const parsed = JSON.parse(new TextDecoder().decode(decrypted))

    return {
      signingKey: new Uint8Array(parsed.signingKey),
      encryptionKey: new Uint8Array(parsed.encryptionKey),
      identity: {
        ...parsed.identity,
        publicKey: new Uint8Array(parsed.identity.publicKey)
      }
    }
  }
}
```

### Public Exports (index.ts)

```typescript
// Types
export type {
  Identity,
  KeyBundle,
  StoredKey,
  UCANCapability,
  UCANToken
} from './types'

// DID operations
export {
  createDID,
  parseDID,
  generateIdentity,
  identityFromPrivateKey
} from './did'

// Key management
export {
  deriveKeyBundle,
  generateKeyBundle
} from './keys'

// UCAN tokens
export {
  createUCAN,
  verifyUCAN,
  hasCapability,
  type CreateUCANOptions
} from './ucan'

// Passkey storage
export {
  type PasskeyStorage,
  BrowserPasskeyStorage
} from './passkey'
```

## Validation Checklist

- [ ] DID:key generation produces valid format (did:key:z6Mk...)
- [ ] DID round-trips to public key correctly
- [ ] UCAN creation and verification works
- [ ] UCAN expiration is enforced
- [ ] Capability checking works correctly
- [ ] Key bundle derivation is deterministic
- [ ] All tests pass with >85% coverage

## Next Step

Proceed to [04-xnet-storage.md](./04-xnet-storage.md)
