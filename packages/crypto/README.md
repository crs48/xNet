# @xnetjs/crypto

Cryptographic primitives for xNet, built on `@noble/hashes` and `@noble/curves`.

## Installation

```bash
pnpm add @xnetjs/crypto
```

## Features

- **BLAKE3 hashing** -- `hash()`, `hashHex()`, `hashBase64()`
- **Ed25519 signing** -- `sign()`, `verify()`, key generation
- **X25519 key exchange** -- `generateKeyPair()`, `deriveSharedSecret()`
- **XChaCha20-Poly1305 encryption** -- `encrypt()`, `decrypt()`, `generateKey()`
- **Random bytes** -- Cryptographically secure `randomBytes()`
- **Encoding utilities** -- hex, base64, base64url conversions

## Usage

```typescript
import { hash, hashHex, hashBase64 } from '@xnetjs/crypto'

// BLAKE3 hashing
const digest = hash(data)
const hex = hashHex(data)
const b64 = hashBase64(data)
```

```typescript
import { sign, verify } from '@xnetjs/crypto'

// Ed25519 signing
const signature = sign(message, privateKey)
const isValid = verify(message, signature, publicKey)
```

```typescript
import { encrypt, decrypt, generateKey } from '@xnetjs/crypto'

// XChaCha20-Poly1305 symmetric encryption
const key = generateKey()
const ciphertext = encrypt(plaintext, key)
const plaintext = decrypt(ciphertext, key)
```

```typescript
import { generateKeyPair, deriveSharedSecret } from '@xnetjs/crypto'

// X25519 key exchange
const alice = generateKeyPair()
const bob = generateKeyPair()
const shared = deriveSharedSecret(alice.privateKey, bob.publicKey)
```

## Modules

| Module          | Description                        |
| --------------- | ---------------------------------- |
| `hashing.ts`    | BLAKE3 hash functions              |
| `signing.ts`    | Ed25519 sign/verify                |
| `asymmetric.ts` | X25519 key exchange                |
| `symmetric.ts`  | XChaCha20-Poly1305 encrypt/decrypt |
| `random.ts`     | Secure random bytes                |
| `utils.ts`      | Hex, base64, base64url encoding    |

## Dependencies

- `@noble/hashes` -- BLAKE3
- `@noble/curves` -- Ed25519, X25519
- `@xnetjs/core` -- Core types

## Testing

```bash
pnpm --filter @xnetjs/crypto test
```
