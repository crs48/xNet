# @xnet/sdk

Unified SDK client for xNet with browser and Node.js presets.

## Installation

```bash
pnpm add @xnet/sdk
```

## Usage

```typescript
import { createXNetClient } from '@xnet/sdk'

// Create client with auto-configuration
const client = await createXNetClient({
  storage: new IndexedDBAdapter(),
  enableNetwork: false
})

await client.start()

// Create a document
const doc = await client.createDocument({
  workspace: 'default',
  type: 'page',
  title: 'My Note'
})

// Get a document
const loaded = await client.getDocument(doc.id)

// Query
const results = await client.query({
  type: 'page',
  sort: [{ field: 'updated', direction: 'desc' }]
})

// Full-text search
const matches = await client.search('hello')

// Cleanup
await client.stop()
```

### Platform Presets

```typescript
import { createBrowserClient } from '@xnet/sdk'

// Browser preset (IndexedDB + WebRTC)
const browser = await createBrowserClient()
```

```typescript
import { createNodeClient } from '@xnet/sdk'

// Node.js preset (filesystem + WebSocket)
const node = await createNodeClient({ dataDir: './data' })
```

## Re-exports

The SDK re-exports commonly used types and utilities from:

- `@xnet/core` -- Types, CIDs, permissions
- `@xnet/crypto` -- Hashing, signing
- `@xnet/identity` -- DID, UCAN, key bundles
- `@xnet/storage` -- Storage adapters
- `@xnet/data` -- Schemas, NodeStore, property types
- `@xnet/network` -- Network node
- `@xnet/query` -- Query engine, search

## Modules

| Module               | Description                             |
| -------------------- | --------------------------------------- |
| `client.ts`          | `createXNetClient` factory              |
| `presets/browser.ts` | Browser preset (IndexedDB + WebRTC)     |
| `presets/node.ts`    | Node.js preset (filesystem + WebSocket) |

## Testing

```bash
pnpm --filter @xnet/sdk test
```
