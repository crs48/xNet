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

## Documentation

See [docs/planStep01MVP](./docs/planStep01MVP) for implementation details.

## License

MIT
