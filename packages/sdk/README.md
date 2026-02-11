# @xnet/sdk

Unified SDK bundle for xNet.

## Installation

```bash
pnpm add @xnet/sdk
```

## Usage

```typescript
import {
  generateIdentity,
  createSearchIndex,
  createLocalQueryEngine,
  MemoryAdapter
} from '@xnet/sdk'

const identity = await generateIdentity()
const storage = new MemoryAdapter()
const index = createSearchIndex()
const engine = createLocalQueryEngine(
  async () => [],
  async () => null
)

console.log(identity.did, storage, index, engine)
```

## What This Package Exports

- Identity helpers from `@xnet/identity`
- Query helpers from `@xnet/query`
- Blob storage adapter from `@xnet/storage`
- Core hashing/content helpers from `@xnet/core`
- Shared type re-exports from core/network/query/storage/identity

The legacy high-level SDK client (`createXNetClient`) and platform presets were removed.

## Re-exports

The SDK re-exports commonly used types and utilities from:

- `@xnet/core` -- Types, CIDs, permissions
- `@xnet/crypto` -- Hashing, signing
- `@xnet/identity` -- DID, UCAN, key bundles
- `@xnet/storage` -- Blob storage adapter
- `@xnet/network` -- Network node
- `@xnet/query` -- Query engine, search

## Modules

| Module     | Description                    |
| ---------- | ------------------------------ |
| `index.ts` | Re-export surface for xNet SDK |

## Testing

```bash
pnpm --filter @xnet/sdk test
```
