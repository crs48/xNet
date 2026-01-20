# @xnet/sdk

Unified SDK bundle for xNet.

## Installation

```bash
pnpm add @xnet/sdk
```

## Usage

```typescript
import { createXNetClient, IndexedDBAdapter } from '@xnet/sdk'

// Create client
const client = await createXNetClient({
  storage: new IndexedDBAdapter(),
  enableNetwork: false // Enable when ready for P2P
})

await client.start()

// Create document
const doc = await client.createDocument({
  workspace: 'default',
  type: 'page',
  title: 'My Note'
})

// Get document
const loaded = await client.getDocument(doc.id)

// Query
const results = await client.query({
  type: 'page',
  sort: [{ field: 'updated', direction: 'desc' }]
})

// Search
const matches = await client.search('hello')

// Cleanup
await client.stop()
```

## Re-exports

The SDK re-exports commonly used types and utilities from all packages.
