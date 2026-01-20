# @xnet/identity

DID:key identity and UCAN authorization.

## Installation

```bash
pnpm add @xnet/identity
```

## Usage

```typescript
import {
  generateIdentity,
  generateKeyBundle,
  createDID,
  createUCAN
} from '@xnet/identity'

// Generate identity
const identity = generateIdentity()
console.log(identity.did) // did:key:z6Mk...

// Generate full key bundle
const bundle = generateKeyBundle()

// Create UCAN token
const ucan = createUCAN({
  issuer: identity.did,
  audience: otherDid,
  capabilities: [{ resource: 'doc/*', action: 'write' }]
})
```

## Features

- DID:key generation and parsing
- UCAN token creation and verification
- Key bundle management
