# @xnetjs/identity

DID:key identity, UCAN authorization, and key management for xNet.

## Installation

```bash
pnpm add @xnetjs/identity
```

## Features

- **DID:key** -- Generate and parse `did:key:z6Mk...` identifiers
- **Key bundles** -- Derive signing + encryption keys from a single seed
- **UCAN tokens** -- Create and verify User Controlled Authorization Networks
- **Passkey storage** -- Browser WebAuthn and in-memory passkey adapters
- **Serialization** -- Export/import key bundles for persistence

## Usage

```typescript
import { generateIdentity, createDID, parseDID } from '@xnetjs/identity'

// Generate a new identity
const { identity, privateKey } = generateIdentity()
console.log(identity.did) // did:key:z6Mk...

// Parse an existing DID
const parsed = parseDID(identity.did)
```

```typescript
import { generateKeyBundle, serializeKeyBundle, deserializeKeyBundle } from '@xnetjs/identity'

// Full key bundle (signing + encryption keys)
const bundle = generateKeyBundle()

// Persist and restore
const serialized = serializeKeyBundle(bundle)
const restored = deserializeKeyBundle(serialized)
```

```typescript
import { createUCAN, verifyUCAN, hasCapability } from '@xnetjs/identity'

// Create a UCAN token
const ucan = createUCAN({
  issuer: identity.did,
  issuerKey: privateKey,
  audience: otherDid,
  capabilities: [{ with: 'doc/*', can: 'write' }]
})

// Verify and check capabilities
const verified = verifyUCAN(ucan)
const canWrite = hasCapability(ucan, { with: 'doc/123', can: 'write' })
```

```typescript
import { BrowserPasskeyStorage, MemoryPasskeyStorage } from '@xnetjs/identity'

// Browser passkey storage (WebAuthn)
const storage = new BrowserPasskeyStorage()

// In-memory for testing
const memory = new MemoryPasskeyStorage()
```

## Modules

| Module       | Description                                     |
| ------------ | ----------------------------------------------- |
| `did.ts`     | DID:key creation and parsing                    |
| `keys.ts`    | Key bundle generation, serialization            |
| `ucan.ts`    | UCAN token creation, verification, capabilities |
| `passkey.ts` | Browser and memory passkey storage              |
| `types.ts`   | Shared type definitions                         |

## Dependencies

- `@xnetjs/core` -- Core types
- `@xnetjs/crypto` -- Signing and hashing
- `multiformats` -- Multicodec encoding

## Testing

```bash
pnpm --filter @xnetjs/identity test
```
