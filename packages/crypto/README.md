# @xnet/crypto

Cryptographic primitives using libsodium.

## Installation

```bash
pnpm add @xnet/crypto
```

## Usage

```typescript
import {
  generateSigningKeypair,
  sign,
  verify,
  generateEncryptionKeypair,
  encrypt,
  decrypt
} from '@xnet/crypto'

// Signing
const keypair = generateSigningKeypair()
const signature = sign(message, keypair.privateKey)
const isValid = verify(message, signature, keypair.publicKey)

// Encryption
const encKeypair = generateEncryptionKeypair()
const encrypted = encrypt(data, recipientPublicKey, senderPrivateKey)
const decrypted = decrypt(encrypted, senderPublicKey, recipientPrivateKey)
```

## Features

- Ed25519 signing
- X25519 key exchange
- XChaCha20-Poly1305 encryption
- BLAKE3 hashing
