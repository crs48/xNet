# Implementation Handoff: Schema-First Architecture

> Use this document to resume implementation in a new session

## What Was Decided

The xNet data model is being consolidated around a **schema-first, Node-based architecture**:

1. **Everything is a Node** - Universal container type (replaces Document)
2. **Schema defines type** - What properties, behaviors, constraints
3. **Code-first schemas** - `defineSchema()` with TypeScript inference
4. **Global namespace** - IRIs like `xnet://xnet.dev/Page`, `xnet://did:key:.../Recipe`
5. **JSON-LD native** - Schemas ARE JSON-LD type definitions
6. **Unified package** - `@xnet/data` absorbs `@xnet/records`

## Key Architectural Decisions

### Lamport Timestamps (Not Vector Clocks)

For ordering changes in the append-only log, we use **Lamport timestamps + author DID** instead of vector clocks:

```typescript
interface LamportTimestamp {
  time: number // Logical time (increments on each change)
  author: DID // For deterministic tie-breaking
}
```

**Why Lamport over Vector Clocks:**

- **Simplicity**: Single integer vs. map of all participants
- **No coordination**: Just `max(local, received) + 1` on tick
- **Total ordering**: Time + author gives deterministic global order
- **Sufficient for CRDTs**: Don't need to detect "concurrent" - just need deterministic merge order

**Ordering rule:**

1. Compare by `time` (lower = earlier)
2. Tie-break by `author` DID string comparison

### Node IDs vs Change IDs

- **Node IDs**: Just need uniqueness (NanoID - 21 chars, URL-safe)
- **Change IDs**: Need ordering (Lamport timestamp) - stored in `lamport` field

### Change Structure

```typescript
interface Change<T> {
  id: string // Unique ID (nanoid)
  type: string // 'yjs-update', 'set-property', etc.
  payload: T // The actual change data
  hash: ContentId // Content-addressed hash
  parentHash: ContentId // Previous change (hash chain)
  authorDID: DID // Who made it
  signature: Uint8Array // Ed25519 signature
  wallTime: number // Wall clock (for display only)
  lamport: LamportTimestamp // For ordering
}
```

## Implementation Status

### Phase 1: Foundation - COMPLETE

```bash
# @xnet/sync package
packages/sync/
├── src/
│   ├── index.ts
│   ├── change.ts      # Change<T>, signChange, verifyChange
│   ├── clock.ts       # Lamport clock utilities
│   ├── chain.ts       # Hash chain utilities
│   └── provider.ts    # SyncProvider interface, SyncStatus
```

**Tests:** 78 passing

### Phase 2: Schema System - COMPLETE

```bash
# Schema infrastructure in @xnet/data
packages/data/src/schema/
├── node.ts            # Node type, createNodeId() (nanoid)
├── types.ts           # Schema, PropertyBuilder types
├── define.ts          # defineSchema() function
├── registry.ts        # SchemaRegistry for runtime lookup
├── index.ts           # Main exports
├── schema.test.ts     # Tests (22 passing)
├── properties/        # 16 property helpers
│   ├── index.ts
│   ├── text.ts
│   ├── number.ts
│   ├── checkbox.ts
│   ├── select.ts
│   ├── multiSelect.ts
│   ├── date.ts
│   ├── dateRange.ts
│   ├── person.ts
│   ├── relation.ts
│   ├── url.ts
│   ├── email.ts
│   ├── phone.ts
│   ├── file.ts
│   ├── created.ts      # Auto-populated
│   ├── updated.ts      # Auto-populated
│   └── createdBy.ts    # Auto-populated
└── schemas/           # Built-in schemas
    ├── index.ts
    ├── page.ts        # PageSchema
    ├── database.ts    # DatabaseSchema
    └── task.ts        # TaskSchema
```

**Tests:** 62 passing (22 schema + 8 document + 8 updates + 24 store)

## What's Exported from @xnet/data

```typescript
// Schema system
import {
  // Node type
  Node,
  SchemaIRI,
  DID,
  isNode,
  createNodeId,

  // Schema definition
  defineSchema,

  // Property helpers (16 total)
  text,
  number,
  checkbox,
  date,
  dateRange,
  select,
  multiSelect,
  person,
  relation,
  url,
  email,
  phone,
  file,
  created,
  updated,
  createdBy,

  // Built-in schemas
  PageSchema,
  Page,
  DatabaseSchema,
  Database,
  TaskSchema,
  Task,

  // Schema registry
  SchemaRegistry,
  schemaRegistry
} from '@xnet/data'
```

## Usage Example

```typescript
import { defineSchema, text, select, date, person, TaskSchema } from '@xnet/data'

// Use built-in schema
const task = TaskSchema.create(
  {
    title: 'Fix the bug',
    status: 'in-progress',
    priority: 'high'
  },
  { createdBy: 'did:key:z6Mk...' }
)

// Or define your own
const RecipeSchema = defineSchema({
  name: 'Recipe',
  namespace: 'xnet://did:key:z6Mk.../',
  properties: {
    title: text({ required: true }),
    difficulty: select({
      options: [
        { id: 'easy', name: 'Easy' },
        { id: 'medium', name: 'Medium' },
        { id: 'hard', name: 'Hard' }
      ] as const
    }),
    prepTime: number({ min: 0 }),
    author: person({})
  },
  hasContent: true, // Rich text instructions
  hasChildren: false,
  isCollection: false,
  icon: '🍳'
})

type Recipe = InferNode<(typeof RecipeSchema)['_properties']>
```

## What's Next: Phase 3-4

### Phase 3: NodeStore Implementation - COMPLETE

Fresh implementation of `NodeStore` using `@xnet/sync` primitives (not porting `@xnet/records`):

```bash
packages/data/src/store/
├── types.ts           # NodePayload, NodeState, NodeStorageAdapter
├── store.ts           # NodeStore class (CRUD, LWW, sync support)
├── memory-adapter.ts  # In-memory storage adapter
├── store.test.ts      # 24 tests passing
└── index.ts           # Exports
```

**Key design:**

- `NodeChange = Change<NodePayload>` - uses @xnet/sync primitives
- Sparse updates (only changed properties stored in payload)
- LWW conflict resolution using `compareLamportTimestamps()`
- Simple CRUD API that creates Changes under the hood

**Usage:**

```typescript
import { NodeStore, MemoryNodeStorageAdapter } from '@xnet/data'

const adapter = new MemoryNodeStorageAdapter()
const store = new NodeStore({
  storage: adapter,
  authorDID: 'did:key:z6Mk...',
  signingKey: privateKey
})

await store.initialize()

// Create a node
const task = await store.create({
  schemaId: 'xnet://xnet.dev/Task',
  properties: { title: 'My Task', status: 'todo' }
})

// Update (sparse - only changed properties)
await store.update(task.id, { properties: { status: 'done' } })

// List with filtering
const tasks = await store.list({ schemaId: 'xnet://xnet.dev/Task' })

// Sync support
const changes = await store.getAllChanges()
await store.applyRemoteChanges(remoteChanges)
```

### Phase 4: React Integration - PARTIALLY COMPLETE

**Completed:**

- `useNodeSync` hook - P2P sync for NodeStore (replaces `useRecordSync`)

**Remaining:**

1. Add `useNode` hook for schema-typed nodes
2. Update `useQuery` to filter by schema
3. Update `useDocument` hook to work with Node types

### Future: CRDT Extensibility

The Node system should support multiple CRDT backends for rich content:

```typescript
const DocSchema = defineSchema({
  name: 'Doc',
  properties: { title: text() },
  content: 'automerge' // or 'yjs' - pluggable CRDT
})
```

This allows users to choose between:

- **Yjs** - Current default, great for rich text
- **Automerge** - Alternative CRDT with different tradeoffs
- **LWW** - Simple last-writer-wins for basic properties (already implemented)

## Key Documents

Read these in order for full context:

1. `docs/planStep02_1DataModelConsolidation/README.md` - **Master plan with phases**
2. `docs/planStep02_1DataModelConsolidation/12-code-first-schemas.md` - **defineSchema() API design**
3. `docs/planStep02_1DataModelConsolidation/09-schema-first-architecture.md` - Node/Schema concepts
4. `docs/planStep02_1DataModelConsolidation/11-global-schema-namespacing.md` - IRI namespace design
5. `docs/planStep02_1DataModelConsolidation/01-xnet-sync-package.md` - Change<T> sync primitives

## Test Commands

```bash
pnpm test                        # All tests
pnpm --filter @xnet/sync test    # Sync package (78 tests)
pnpm vitest run packages/data    # Data package (62 tests)
pnpm test:coverage               # Coverage check
```

## Commits Made

```
d03083c Complete schema system with built-in schemas and registry
5b670b6 Refactor @xnet/sync to use Lamport timestamps instead of vector clocks
b54d49e Add schema system with defineSchema() and property helpers
c34a476 Update docs: minimal Node interface and append-only architecture
0b830af Add @xnet/sync package with Change<T>, vector clocks, and SyncProvider
fab5baf Ratify schema-first, Node-based architecture
```

## Prompt to Continue

```
I'm implementing the schema-first architecture for xNet. Read the handoff document at docs/planStep02_1DataModelConsolidation/HANDOFF.md.

Phases 1-3 are COMPLETE:
- @xnet/sync: Lamport timestamps, Change<T>, hash chains (78 tests)
- @xnet/data schema system: defineSchema(), 16 property helpers, 3 built-in schemas (22 tests)
- @xnet/data NodeStore: Event-sourced storage with LWW conflict resolution (24 tests)
- @xnet/records: REMOVED (no backward compatibility needed)
- @xnet/react: useNodeSync hook replaces useRecordSync

Total tests: 140 (78 sync + 62 data)

Next steps:
1. Phase 4: React Integration - Add useNode hook for schema-typed nodes, update useQuery
2. Future: Add Automerge support for pluggable CRDT content
```

---

_Last updated: January 21, 2026_
