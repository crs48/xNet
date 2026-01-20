# CLAUDE.md - AI Agent Context

## What This Is

**xNet** = Decentralized data infrastructure SDK. Local-first, P2P-synced, user-owned data.  
**xNotes** = Notion-like productivity app built on xNet. Wiki + databases + tasks.

## Data Model (Critical)

> **Architecture Update in Progress:** See `docs/planStep02_1DataModelConsolidation/README.md`
>
> We are moving to a **schema-first, Node-based architecture** where:
>
> - Everything is a `Node` (universal container)
> - A `Schema` defines what the Node is (Page, Database, Item, Task, etc.)
> - Schemas are defined in code via `defineSchema()` with TypeScript inference
> - Schemas use globally unique IRIs: `xnet://xnet.dev/Page`, `xnet://did:key:.../Recipe`

### Current State (Being Consolidated)

Two sync strategies for different data types:

| Data Type              | Package         | Sync Mechanism    | Conflict Resolution   |
| ---------------------- | --------------- | ----------------- | --------------------- |
| Rich text (wiki pages) | `@xnet/data`    | Yjs CRDT          | Character-level merge |
| Tabular (databases)    | `@xnet/records` | Event-sourced ops | Field-level LWW       |

This is intentional (see `docs/TRADEOFFS.md`). Rich text needs fine-grained CRDT; tables work better with last-writer-wins per field.

### Target State (After Consolidation)

```typescript
// Everything is a Node with a Schema
const task = TaskSchema.create({
  title: 'Fix the bug',
  status: 'todo'
})

// Schemas defined in code with full TypeScript inference
const TaskSchema = defineSchema({
  name: 'Task',
  namespace: 'xnet://xnet.dev/',
  properties: {
    title: text({ required: true }),
    status: select({ options: [...] as const })
  },
  hasContent: true
})

type Task = InferNode<typeof TaskSchema>  // Fully typed!
```

## Package Map

```
packages/
  core/       # Types, content addressing (CIDs), vector clocks, permissions
  crypto/     # BLAKE3 hashing, Ed25519 signing, XChaCha20 encryption
  identity/   # DID:key generation, UCAN tokens, key management
  storage/    # IndexedDB adapter, snapshot management
  data/       # Yjs CRDT wrapper, signed updates, document operations
  records/    # Database schema, 18 property types, event-sourced sync
  network/    # libp2p node, y-webrtc provider, DID resolution
  query/      # Local query engine, full-text search (Lunr.js)
  react/      # useDocument, useQuery, useSync, useRecordSync hooks
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
crypto ──> identity ──> storage ──> data ──────> network ──> query
                │           │           │
                │           └───────────┴──> records (parallel sync)
                │
                └──────────────────────────────> react ──> sdk
```

## ID Formats

```typescript
type DID = `did:key:z6Mk...` // User identity
type ContentId = `cid:blake3:${hex}` // Content-addressed hash
type DatabaseId = `db:${uuid}` // Database
type ItemId = `item:${uuid}` // Database row
type PropertyId = `prop:${uuid}` // Database column
type DocumentPath = `xnet://${DID}/workspace/${id}/doc/${id}`
```

## Common Operations

### Create/load a document (rich text)

```typescript
import { createDocument, loadDocument } from '@xnet/data'
const doc = createDocument({ id, workspace, type: 'page', title, createdBy: did, signingKey })
```

### Create a database record

```typescript
import { RecordStore } from '@xnet/records'
const store = new RecordStore(adapter, { authorDID, signingKey })
const db = await store.createDatabase('Tasks', [{ name: 'Title', type: 'text', ... }])
const item = await store.createItem(db.id, { [propId]: 'My Task' })
```

### React hooks

```typescript
import { useDocument, useQuery, useSync, useRecordSync } from '@xnet/react'
const { data, update } = useDocument(docId)           // Rich text
const { status, peers } = useSync()                   // Sync status
const { results } = useQuery({ type: 'page', ... })   // Query docs
```

## Property Types (18 total)

Basic: `text`, `number`, `checkbox`  
Temporal: `date`, `dateRange`  
Selection: `select`, `multiSelect`  
References: `person`, `relation`, `rollup`  
Computed: `formula`  
Rich: `url`, `email`, `phone`, `file`  
Auto: `created`, `updated`, `createdBy`

## Where Things Live

| Need to...         | Look in                              |
| ------------------ | ------------------------------------ |
| Hash data          | `@xnet/crypto/hashing.ts`            |
| Sign/verify        | `@xnet/crypto/signing.ts`            |
| Create DID         | `@xnet/identity/did.ts`              |
| Create UCAN        | `@xnet/identity/ucan.ts`             |
| Store documents    | `@xnet/storage/adapters/`            |
| Wrap Yjs doc       | `@xnet/data/document.ts`             |
| Database schema    | `@xnet/records/schema/`              |
| Property handlers  | `@xnet/records/properties/`          |
| Event-sourced sync | `@xnet/records/sync/store.ts`        |
| P2P connection     | `@xnet/network/node.ts`              |
| y-webrtc setup     | `@xnet/network/providers/ywebrtc.ts` |
| React hooks        | `@xnet/react/hooks/`                 |

## Testing

```bash
pnpm test                          # All tests (352+ total)
pnpm --filter @xnet/records test   # Single package
pnpm test:coverage                 # With coverage (>80% required)
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

- `docs/TRADEOFFS.md` - Why hybrid sync (Yjs + event-sourcing)
- `docs/PERSISTENCE_ARCHITECTURE.md` - Storage durability tiers
- `docs/planStep01MVP/01-phase0-foundations.md` - Core architecture
- `docs/planStep02DatabasePlatform/01-property-types.md` - Property system
- `docs/planStep02_1DataModelConsolidation/README.md` - **Schema-first architecture plan**
- `docs/plan/12-react-integration.md` - React hooks design
