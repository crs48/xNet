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

**Tests:** 38 passing (22 schema + 8 document + 8 updates)

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

### Phase 3: Package Consolidation

1. Move `@xnet/records` code into `@xnet/data/record/`
2. Update imports across codebase
3. Create re-exports in `@xnet/records` for backward compat
4. Update React hooks

### Phase 4: React Integration

1. Update `useDocument` hook to work with Node types
2. Add `useNode` hook for schema-typed nodes
3. Update `useQuery` to filter by schema

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
pnpm vitest run packages/data    # Data package (38 tests)
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

Phase 1 (@xnet/sync) and Phase 2 (schema system) are COMPLETE.

Current state:
- @xnet/sync: Lamport timestamps, Change<T>, hash chains (78 tests)
- @xnet/data schema system: defineSchema(), 16 property helpers, 3 built-in schemas, registry (38 tests)

Next: Phase 3 - Package consolidation (merge @xnet/records into @xnet/data)
```

---

_Last updated: January 21, 2026_
