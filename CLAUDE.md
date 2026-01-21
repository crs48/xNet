# CLAUDE.md - AI Agent Context

## What This Is

**xNet** = Decentralized data infrastructure for the internet. Local-first, P2P-synced, user-owned data.  
**xNotes** = Notion-like productivity app built on xNet. The interface that seeds the global namespace.

> **The Big Picture**: xNet is not just an SDK — it's infrastructure for a new internet where data is user-owned, globally addressable, and works from personal notes to planetary-scale indexes (decentralized search, federated social, etc.). See `docs/VISION.md` for the full vision.

## Data Model (Current)

The xNet data model uses a **schema-first, Node-based architecture**:

- Everything is a `Node` (universal container)
- A `Schema` defines what the Node is (Page, Database, Task, etc.)
- Schemas are defined in code via `defineSchema()` with TypeScript inference
- Schemas use globally unique IRIs: `xnet://xnet.dev/Page`, `xnet://did:key:.../Recipe`

### Sync Strategies

| Data Type              | Package      | Sync Mechanism      | Conflict Resolution   |
| ---------------------- | ------------ | ------------------- | --------------------- |
| Rich text (wiki pages) | `@xnet/data` | Yjs CRDT            | Character-level merge |
| Structured data        | `@xnet/data` | NodeStore + Lamport | Field-level LWW       |

Rich text uses Yjs CRDT for fine-grained character merging. Structured data (Nodes) uses event-sourced changes with Lamport timestamps and last-writer-wins per property.

### Example Usage

```typescript
// Define a schema
const TaskSchema = defineSchema({
  name: 'Task',
  namespace: 'xnet://xnet.dev/',
  properties: {
    title: text({ required: true }),
    status: select({ options: ['todo', 'in-progress', 'done'] as const })
  },
  hasContent: true
})

// Use NodeStore for persistence
const store = new NodeStore({
  storage: new MemoryNodeStorageAdapter(),
  authorDID: 'did:key:z6Mk...',
  signingKey: privateKey
})
await store.initialize()

const task = await store.create({
  schemaId: 'xnet://xnet.dev/Task',
  properties: { title: 'Fix bug', status: 'todo' }
})

// React hooks
const { node, update } = useNode(task.id)
const { nodes } = useNodes({ schemaId: 'xnet://xnet.dev/Task' })
```

## Package Map

```
packages/
  core/       # Types, content addressing (CIDs), permissions
  crypto/     # BLAKE3 hashing, Ed25519 signing, XChaCha20 encryption
  identity/   # DID:key generation, UCAN tokens, key management
  storage/    # IndexedDB adapter, snapshot management
  sync/       # Lamport timestamps, Change<T>, hash chains, SyncProvider
  data/       # Schema system, NodeStore, Yjs CRDT, document operations
  network/    # libp2p node, y-webrtc provider, DID resolution
  query/      # Local query engine, full-text search (Lunr.js)
  react/      # useNode, useNodes, useNodeSync, useDocument hooks
  sdk/        # Unified client, browser/node presets
  editor/     # TipTap-based collaborative editor
  ui/         # Shared components
  views/      # Table/Board view components (WIP)
  vectors/    # Embeddings (placeholder)
  canvas/     # Infinite canvas (placeholder)
  formula/    # Formula engine (placeholder)
```

## Key Relationships

```
crypto ──> identity ──> storage ──> sync ──> data ──> network ──> query
                                      │
                                      └──────────────> react ──> sdk
```

## ID Formats

```typescript
type DID = `did:key:z6Mk...` // User identity
type ContentId = `cid:blake3:${hex}` // Content-addressed hash
type SchemaIRI = `xnet://${string}/${string}` // Schema identifier
type NodeId = string // NanoID (21 chars)
type DocumentPath = `xnet://${DID}/workspace/${id}/doc/${id}`
```

## Common Operations

### Create a Node (structured data)

```typescript
import { NodeStore, MemoryNodeStorageAdapter } from '@xnet/data'

const store = new NodeStore({
  storage: new MemoryNodeStorageAdapter(),
  authorDID: did,
  signingKey: key
})
await store.initialize()

const task = await store.create({
  schemaId: 'xnet://xnet.dev/Task',
  properties: { title: 'My Task', status: 'todo' }
})
await store.update(task.id, { properties: { status: 'done' } })
```

### Create a document (rich text)

```typescript
import { createDocument, loadDocument } from '@xnet/data'
const doc = createDocument({ id, workspace, type: 'page', title, createdBy: did, signingKey })
```

### React hooks

```typescript
import {
  NodeStoreProvider, useNode, useNodes, useNodeSync,
  useDocument, useQuery, useSync
} from '@xnet/react'

// Wrap app with provider
<NodeStoreProvider authorDID={did} signingKey={key}>
  <App />
</NodeStoreProvider>

// Use hooks
const { node, update, remove } = useNode(nodeId)
const { nodes, create } = useNodes({ schemaId: 'xnet://xnet.dev/Task' })
const { status, peers, broadcastChanges } = useNodeSync({ store, peerId })
```

## Property Types (16 total)

Basic: `text`, `number`, `checkbox`  
Temporal: `date`, `dateRange`  
Selection: `select`, `multiSelect`  
References: `person`, `relation`  
Rich: `url`, `email`, `phone`, `file`  
Auto: `created`, `updated`, `createdBy`

## Where Things Live

| Need to...         | Look in                            |
| ------------------ | ---------------------------------- |
| Hash data          | `@xnet/crypto/hashing.ts`          |
| Sign/verify        | `@xnet/crypto/signing.ts`          |
| Create DID         | `@xnet/identity/did.ts`            |
| Create UCAN        | `@xnet/identity/ucan.ts`           |
| Lamport timestamps | `@xnet/sync/clock.ts`              |
| Change<T> type     | `@xnet/sync/change.ts`             |
| Define schema      | `@xnet/data/schema/define.ts`      |
| NodeStore          | `@xnet/data/store/store.ts`        |
| Property helpers   | `@xnet/data/schema/properties/`    |
| Yjs document ops   | `@xnet/data/document.ts`           |
| P2P connection     | `@xnet/network/node.ts`            |
| React Node hooks   | `@xnet/react/hooks/useNode.ts`     |
| React sync hooks   | `@xnet/react/hooks/useNodeSync.ts` |

## Testing

```bash
pnpm vitest run packages/sync packages/data  # Core tests (140 total)
pnpm --filter @xnet/data test                # Single package
pnpm test:coverage                           # With coverage (>80% required)
```

## Apps

```
apps/
  electron/   # Desktop (macOS)
  expo/       # Mobile (iOS)
  web/        # PWA (TanStack Router)
```

## Don't

- Don't add features beyond what's requested
- Don't write UI tests (manual testing only)
- Don't skip unit tests for core packages
- Don't use heavyweight frameworks
- Don't store computed property values (rollup, formula) - compute at read time

## Key Docs

- `docs/VISION.md` - **The big picture: micro-to-macro data sovereignty**
- `docs/planStep02_1DataModelConsolidation/HANDOFF.md` - **Implementation status and examples**
- `docs/planStep02_1DataModelConsolidation/README.md` - Schema-first architecture plan
- `docs/TRADEOFFS.md` - Why hybrid sync (Yjs + event-sourcing)
- `docs/PERSISTENCE_ARCHITECTURE.md` - Storage durability tiers
