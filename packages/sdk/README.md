# @xnetjs/sdk

Unified SDK bundle for xNet.

## Installation

```bash
pnpm add @xnetjs/sdk
```

## Usage

```typescript
import {
  generateIdentity,
  createSearchIndex,
  createLocalQueryEngine,
  MemoryAdapter
} from '@xnetjs/sdk'

const { identity } = generateIdentity()
const storage = new MemoryAdapter()
const index = createSearchIndex()
const engine = createLocalQueryEngine(
  async () => [],
  async () => null
)

console.log(identity.did, storage, index, engine)
```

## What This Package Exports

- Identity helpers from `@xnetjs/identity`
- Query helpers from `@xnetjs/query`
- Blob storage adapter from `@xnetjs/storage`
- Core hashing/content helpers from `@xnetjs/core`
- Shared type re-exports from core/network/query/storage/identity

## Re-exports

The SDK re-exports commonly used types and utilities from:

- `@xnetjs/core` -- Types, CIDs, permissions
- `@xnetjs/crypto` -- Hashing, signing
- `@xnetjs/identity` -- DID, UCAN, key bundles
- `@xnetjs/storage` -- Blob storage adapter
- `@xnetjs/network` -- Network node
- `@xnetjs/query` -- Query engine, search

For app bootstrap, use `createClient()` from `@xnetjs/sdk`.

## Modules

| Module     | Description                    |
| ---------- | ------------------------------ |
| `index.ts` | Re-export surface for xNet SDK |

## Testing

```bash
pnpm --filter @xnetjs/sdk test
```
