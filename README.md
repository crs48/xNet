# xNet

Decentralized internet infrastructure SDK for building local-first, peer-to-peer applications.

## Getting Started

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test
```

## Monorepo Structure

```
packages/           # Core SDK packages
  @xnet/core/       # Types, schemas, content addressing
  @xnet/crypto/     # Encryption, signing, hashing
  @xnet/identity/   # DID:key, UCAN tokens
  @xnet/storage/    # IndexedDB/SQLite adapters
  @xnet/data/       # Yjs CRDT engine
  @xnet/network/    # libp2p, WebRTC, P2P sync
  @xnet/query/      # Local + federated queries
  @xnet/react/      # React hooks
  @xnet/sdk/        # Unified SDK bundle

apps/               # Platform applications
  electron/         # macOS desktop (xNotes)
  expo/             # iOS mobile (xNotes)
  web/              # Web PWA (xNotes)
```

## Key Technologies

- **CRDT**: Yjs for conflict-free collaboration
- **P2P**: libp2p + WebRTC
- **Storage**: IndexedDB (browser), SQLite (native)
- **Identity**: DID:key + UCAN authorization
- **Crypto**: libsodium (Ed25519, X25519, XChaCha20-Poly1305)
- **Hashing**: BLAKE3 for content addressing

## Usage

```typescript
import { createXNetClient, IndexedDBAdapter } from '@xnet/sdk'

// Create client
const client = await createXNetClient({
  storage: new IndexedDBAdapter()
})

// Create document
const doc = await client.createDocument({
  workspace: 'default',
  type: 'page',
  title: 'My Note'
})

// Query documents
const results = await client.query({
  type: 'page',
  sort: [{ field: 'updated', direction: 'desc' }]
})
```

## React Hooks

```tsx
import { XNetProvider, useDocument, useQuery, useSync, useIdentity } from '@xnet/react'
import { IndexedDBAdapter } from '@xnet/sdk'

// Wrap your app with XNetProvider
function App() {
  return (
    <XNetProvider config={{ storage: new IndexedDBAdapter() }}>
      <NotesApp />
    </XNetProvider>
  )
}

// Load and edit a document
function Editor({ docId }: { docId: string }) {
  const { data: doc, loading, update } = useDocument(docId)

  if (loading) return <div>Loading...</div>

  return (
    <input
      value={doc?.metadata?.title || ''}
      onChange={(e) => update((d) => {
        if (d.metadata) d.metadata.title = e.target.value
      })}
    />
  )
}

// Query documents with pagination
function DocumentList() {
  const { data: docs, loading, hasMore, fetchMore } = useQuery({
    type: 'page',
    sort: [{ field: 'updated', direction: 'desc' }],
    limit: 20
  })

  return (
    <ul>
      {docs.map((doc) => <li key={doc.id}>{doc.title}</li>)}
      {hasMore && <button onClick={fetchMore}>Load more</button>}
    </ul>
  )
}

// Show sync status
function SyncStatus() {
  const { status, peerCount } = useSync()
  return <span>{status} ({peerCount} peers)</span>
}

// Access current identity
function Profile() {
  const { identity } = useIdentity()
  return <code>{identity?.did}</code>
}
```

## Documentation

See [docs/planStep01MVP](./docs/planStep01MVP) for implementation details.

## License

MIT
