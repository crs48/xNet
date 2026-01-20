# CLAUDE.md - AI Agent Context

## Project Overview

**xNet** is a decentralized internet infrastructure SDK. **xNotes** is a collaborative productivity app built on xNet.

## Monorepo Structure

```
packages/
  @xnet/core/        # Types, schemas, content addressing
  @xnet/crypto/      # Encryption, signing, hashing (BLAKE3)
  @xnet/identity/    # DID:key, UCAN tokens, key management
  @xnet/storage/     # IndexedDB/SQLite adapters, snapshots
  @xnet/data/        # Yjs CRDT engine, signed updates
  @xnet/network/     # libp2p, WebRTC, P2P sync
  @xnet/query/       # Local + federated queries
  @xnet/vectors/     # Embeddings, semantic search
  @xnet/react/       # React hooks (@xnet/react)
  @xnet/sdk/         # Unified SDK bundle

apps/
  electron/          # macOS desktop (Electron)
  expo/              # iOS mobile (Expo)
  web/               # PWA SPA (TanStack Router)
```

## Key Technologies

- **CRDT**: Yjs for conflict-free collaboration
- **P2P**: libp2p + WebRTC
- **Storage**: IndexedDB (browser), SQLite (native)
- **Identity**: DID:key + UCAN authorization
- **Crypto**: libsodium (Ed25519, X25519, XChaCha20-Poly1305)
- **Hashing**: BLAKE3 for content addressing

## Implementation Order

See `docs/planV2/` for detailed specs. Order:

1. **Phase 0** (foundations): Content addressing, snapshots, signed updates, DID resolution
2. **Core packages**: crypto → identity → storage → data → network → query → react → sdk
3. **Platform POCs**: Electron macOS → Expo iOS → TanStack PWA
4. **Features**: Wiki/editor → P2P sync → tasks → search
5. **Polish**: Performance, design, documentation

## Testing

- Run `pnpm test` for unit tests (Vitest)
- Core packages have >80% coverage requirement
- UI testing is manual; functionality is modularized for testability

## Commands

```bash
pnpm install          # Install dependencies
pnpm build            # Build all packages
pnpm test             # Run all tests
pnpm test:watch       # Watch mode
pnpm lint             # Lint code
pnpm typecheck        # TypeScript check
```

## Key Patterns

### Document ID Format
```
xnet://{DID}/workspace/{workspaceId}/doc/{docId}
```

### Content ID (CID) Format
```
cid:blake3:{hash}
```

### React Hook Usage
```typescript
import { useDocument, useQuery, useSync } from '@xnet/react'

const { data, update } = useDocument(docId)
const { results } = useQuery({ type: 'page', workspace: wsId })
const { status, peers } = useSync()
```

## Don't

- Don't add features beyond what's requested
- Don't write UI tests (manual testing only)
- Don't skip writing unit tests for core packages
- Don't use heavyweight frameworks when lightweight alternatives exist
