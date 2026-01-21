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

## Implementation Status - ALL PHASES COMPLETE

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
└── schemas/           # Built-in schemas (Page, Database, Task)
```

### Phase 3: NodeStore - COMPLETE

```bash
packages/data/src/store/
├── types.ts           # NodePayload, NodeState, NodeStorageAdapter
├── store.ts           # NodeStore class (CRUD, LWW, sync support)
├── memory-adapter.ts  # In-memory storage adapter
├── store.test.ts      # 24 tests passing
└── index.ts           # Exports
```

**@xnet/records package REMOVED** (not published, no backward compat needed)

### Phase 4: React Integration - COMPLETE

```bash
packages/react/src/hooks/
├── useNodeStore.ts    # NodeStoreProvider context, useNodeStore hook
├── useNodeSync.ts     # P2P sync for NodeStore (replaces useRecordSync)
└── useNode.ts         # useNode and useNodes hooks for CRUD
```

**Total Tests:** 140 passing (78 sync + 62 data)

## What's Exported

### From @xnet/data

```typescript
import {
  // Schema system
  defineSchema,
  Node,
  SchemaIRI,
  isNode,
  createNodeId,

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
  DatabaseSchema,
  TaskSchema,

  // NodeStore
  NodeStore,
  MemoryNodeStorageAdapter,
  type NodeState,
  type NodeChange,
  type NodeStorageAdapter
} from '@xnet/data'
```

### From @xnet/react

```typescript
import {
  // NodeStore context
  NodeStoreProvider,
  useNodeStore,

  // Node hooks
  useNode, // Single node CRUD
  useNodes, // List nodes with schema filtering

  // Sync
  useNodeSync // P2P sync for NodeStore
} from '@xnet/react'
```

## Usage Examples

### Define a Schema

```typescript
import { defineSchema, text, select, number } from '@xnet/data'

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
    prepTime: number({ min: 0 })
  }
})
```

### Use NodeStore

```typescript
import { NodeStore, MemoryNodeStorageAdapter } from '@xnet/data'

const store = new NodeStore({
  storage: new MemoryNodeStorageAdapter(),
  authorDID: 'did:key:z6Mk...',
  signingKey: privateKey
})
await store.initialize()

// Create
const task = await store.create({
  schemaId: 'xnet://xnet.dev/Task',
  properties: { title: 'My Task', status: 'todo' }
})

// Update (sparse)
await store.update(task.id, { properties: { status: 'done' } })

// List with filtering
const tasks = await store.list({ schemaId: 'xnet://xnet.dev/Task' })
```

### React Hooks

```tsx
import { NodeStoreProvider, useNode, useNodes, useNodeSync } from '@xnet/react'

// Wrap app with provider
;<NodeStoreProvider authorDID={did} signingKey={key}>
  <App />
</NodeStoreProvider>

// Use hooks
function TaskList() {
  const { nodes, create } = useNodes({ schemaId: 'xnet://xnet.dev/Task' })

  return (
    <div>
      {nodes.map((task) => (
        <TaskItem key={task.id} taskId={task.id} />
      ))}
      <button onClick={() => create('xnet://xnet.dev/Task', { title: 'New' })}>Add Task</button>
    </div>
  )
}

function TaskItem({ taskId }) {
  const { node, update, remove } = useNode(taskId)

  return (
    <div>
      <span>{node?.properties.title}</span>
      <button onClick={() => update({ status: 'done' })}>Done</button>
      <button onClick={remove}>Delete</button>
    </div>
  )
}
```

## Future Work

### CRDT Extensibility (Automerge Support)

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

## Test Commands

```bash
pnpm vitest run packages/sync packages/data  # Run 140 tests
pnpm --filter @xnet/react build              # Build React package
```

## Commits

```
0bbe4fb Add useNode and useNodes hooks for React
027d896 Add NodeStore and remove @xnet/records package
75bc0c7 Update HANDOFF.md with completed Phase 1-2 status
d03083c Complete schema system with built-in schemas and registry
5b670b6 Refactor @xnet/sync to use Lamport timestamps instead of vector clocks
b54d49e Add schema system with defineSchema() and property helpers
```

## Prompt to Continue

```
The schema-first architecture for xNet is COMPLETE. Read docs/planStep02_1DataModelConsolidation/HANDOFF.md.

Completed:
- @xnet/sync: Lamport timestamps, Change<T>, hash chains (78 tests)
- @xnet/data: Schema system + NodeStore with LWW conflict resolution (62 tests)
- @xnet/react: NodeStoreProvider, useNode, useNodes, useNodeSync hooks
- @xnet/records: REMOVED

Total: 140 tests passing

Future work:
- Add Automerge support for pluggable CRDT content
```

---

_Last updated: January 21, 2026_
