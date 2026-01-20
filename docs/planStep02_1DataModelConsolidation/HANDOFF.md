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

- **Node IDs**: Just need uniqueness (NanoID)
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

## Key Documents

Read these in order for full context:

1. `docs/planStep02_1DataModelConsolidation/README.md` - **Master plan with phases**
2. `docs/planStep02_1DataModelConsolidation/12-code-first-schemas.md` - **defineSchema() API design**
3. `docs/planStep02_1DataModelConsolidation/09-schema-first-architecture.md` - Node/Schema concepts
4. `docs/planStep02_1DataModelConsolidation/11-global-schema-namespacing.md` - IRI namespace design
5. `docs/planStep02_1DataModelConsolidation/01-xnet-sync-package.md` - Change<T> sync primitives

## Implementation Order

### Phase 1: Foundation - COMPLETE

```bash
# 1.1 @xnet/sync package - DONE
packages/sync/
├── src/
│   ├── index.ts
│   ├── change.ts      # Change<T>, signChange, verifyChange
│   ├── clock.ts       # Lamport clock utilities
│   ├── chain.ts       # Hash chain utilities
│   └── provider.ts    # SyncProvider interface, SyncStatus
```

Key types:

- `Change<T>` - Universal sync unit with Lamport ordering
- `LamportTimestamp` - `{ time: number, author: DID }`
- `LamportClock` - Mutable clock state for an author
- `tick()`, `receive()` - Clock operations
- `compareLamportTimestamps()` - Total ordering function

### Phase 2: Schema System - IN PROGRESS

```bash
# 2.1 Schema infrastructure in @xnet/data - PARTIAL
packages/data/src/schema/
├── node.ts            # Node type, createNodeId() - DONE
├── types.ts           # Schema, PropertyBuilder types - DONE
├── define.ts          # defineSchema() function - DONE
├── schema.test.ts     # Tests (21 passing) - DONE
└── properties/        # Property helpers
    ├── index.ts       # Exports
    ├── text.ts        # DONE
    ├── number.ts      # DONE
    ├── checkbox.ts    # DONE
    ├── select.ts      # DONE (with literal types)
    ├── date.ts        # DONE
    ├── multiSelect.ts # DONE
    ├── url.ts         # DONE
    ├── email.ts       # DONE
    ├── phone.ts       # DONE
    ├── person.ts      # DONE
    ├── relation.ts    # DONE
    ├── file.ts        # DONE
    ├── dateRange.ts   # DONE
    └── ...            # TODO: created, updated, createdBy (auto-fields)
```

### Phase 2 Next Steps

1. **Add auto-populated property helpers**: `created()`, `updated()`, `createdBy()`
2. **Update property index exports** to include all new helpers
3. **Create built-in schemas**: PageSchema, DatabaseSchema, ItemSchema, TaskSchema
4. **Add schema registry** for runtime lookup
5. **Export schema system** from `@xnet/data` main index
6. **Switch createNodeId()** to use NanoID

### Phase 3: Built-in Schemas

```typescript
// packages/data/src/schemas/page.ts
export const PageSchema = defineSchema({
  name: 'Page',
  namespace: 'xnet://xnet.dev/',
  properties: {
    title: text({ required: true }),
    icon: text({}),
    cover: file({ accept: ['image/*'] })
  },
  hasContent: true,
  hasChildren: true,
  icon: '📄'
})

export type Page = InferNode<typeof PageSchema>
```

Built-in schemas to create:

- `PageSchema` - Rich text document
- `DatabaseSchema` - Schema container (collection)
- `ItemSchema` - Row in a database
- `CanvasSchema` - Spatial layout
- `TaskSchema` - Built-in task type

### Phase 4: Package Consolidation

1. Move `@xnet/records` code into `@xnet/data/record/`
2. Update imports across codebase
3. Create re-exports in `@xnet/records` for backward compat
4. Update React hooks

## The Node Interface (Minimal)

A Node has only 4 universal fields. Everything else is schema-defined:

```typescript
interface Node {
  // Identity (required)
  id: string // Unique identifier
  schemaId: string // IRI: 'xnet://xnet.dev/Task'

  // Provenance (required - set once at creation)
  createdAt: number // Unix timestamp (ms)
  createdBy: string // DID of creator

  // All other fields come from the schema
  [key: string]: unknown
}
```

**Example Task node:**

```typescript
{
  id: 'task-123',
  schemaId: 'xnet://xnet.dev/Task',
  createdAt: 1737500000000,
  createdBy: 'did:key:z6Mk...',

  // Schema-defined fields:
  title: 'Fix the bug',
  status: 'in-progress',
  assignee: 'did:key:z6Mk...'
}
```

**Why these 4 universal fields?**

- `id` + `schemaId`: Identity and type
- `createdAt` + `createdBy`: Essential for P2P sync and attribution

**What's NOT universal:**

- `updatedAt`/`updatedBy`: Derived from Change history or schema-defined
- `workspaceId`/`parentId`/`deleted`: Application/schema concerns
- `content`/`children`: Schema-defined capabilities

## Schema IRI Format

```
xnet://xnet.dev/Page              # Built-in
xnet://xnet.dev/Task              # Built-in
xnet://acme-corp.com/Project      # Organization
xnet://did:key:z6Mk.../Recipe     # Personal
```

## Test Commands

```bash
pnpm test                        # All tests
pnpm --filter @xnet/sync test    # Sync package (78 tests)
pnpm --filter @xnet/data test    # Data package
pnpm test:coverage               # Coverage check
```

## Implementation Progress

### Phase 1.1: @xnet/sync Package - COMPLETE

The `@xnet/sync` package has been implemented with:

- **change.ts**: `Change<T>`, `UnsignedChange<T>`, `signChange()`, `verifyChange()`, `verifyChangeHash()`
- **clock.ts**: Lamport clock utilities (createLamportClock, tick, receive, compare, serialize/parse)
- **chain.ts**: Hash chain validation, fork detection, topological sort
- **provider.ts**: `SyncProvider` interface, `SyncStatus`, `BaseSyncProvider` abstract class

**Tests:** 78 passing tests across all modules.

### Phase 2.1: Schema System - IN PROGRESS

Core schema system implemented:

- **node.ts**: `Node` type, `createNodeId()`
- **types.ts**: `Schema`, `PropertyBuilder`, `DefinedSchema`, type inference helpers
- **define.ts**: `defineSchema()` with full TypeScript inference
- **properties/**: 13 of 18 property helpers implemented

**Tests:** 21 passing tests for schema system.

### Next Steps

1. Add remaining property helpers (created, updated, createdBy)
2. Update property exports
3. Create built-in schemas (PageSchema, TaskSchema, etc.)
4. Add schema registry
5. Export from @xnet/data main index
6. Switch createNodeId() to NanoID

## Commits Made

```
b54d49e Add schema system with defineSchema() and property helpers
c34a476 Update docs: minimal Node interface and append-only architecture
0b830af Add @xnet/sync package with Change<T>, vector clocks, and SyncProvider
fab5baf Ratify schema-first, Node-based architecture
```

## Prompt to Continue

```
I'm implementing the schema-first architecture for xNet. Read the handoff document at docs/planStep02_1DataModelConsolidation/HANDOFF.md and the README.md in the same directory.

Current status:
- @xnet/sync: COMPLETE (78 tests, uses Lamport timestamps)
- Schema system: IN PROGRESS (21 tests)
  - defineSchema() with TypeScript inference working
  - 13 of 18 property helpers implemented
  - Missing: created, updated, createdBy (auto-fields)

Files staged but not committed:
- packages/data/src/schema/properties/multiSelect.ts
- packages/data/src/schema/properties/url.ts
- packages/data/src/schema/properties/email.ts
- packages/data/src/schema/properties/phone.ts
- packages/data/src/schema/properties/person.ts
- packages/data/src/schema/properties/relation.ts
- packages/data/src/schema/properties/file.ts
- packages/data/src/schema/properties/dateRange.ts

Next steps:
1. Add auto-field property helpers (created, updated, createdBy)
2. Update property index exports
3. Create built-in schemas
4. Add schema registry
5. Export from @xnet/data
6. Switch createNodeId() to NanoID

The @xnet/sync package now uses Lamport timestamps instead of vector clocks.
Changes have a `lamport: LamportTimestamp` field (not `vectorClock`).
```

---

_Last updated: January 21, 2026_
