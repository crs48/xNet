# xNet Implementation Plan - Step 02.1: Data Model Consolidation

> Unifying xNet around a schema-first, Node-based architecture with JSON-LD support

## Executive Summary

This plan consolidates xNet's data model around a single, powerful abstraction:

**Everything is a Node. A Schema defines what the Node is.**

```typescript
// The entire data model in one concept
const task = TaskSchema.create({
  title: 'Fix the bug',
  status: 'todo',
  priority: 'high'
})

// TaskSchema is defined in code with full TypeScript inference
const TaskSchema = defineSchema({
  name: 'Task',
  namespace: 'xnet://xnet.dev/',
  properties: {
    title: text({ required: true }),
    status: select({ options: STATUS_OPTIONS }),
    priority: select({ options: PRIORITY_OPTIONS })
  },
  hasContent: true
})

type Task = InferNode<typeof TaskSchema> // Fully typed!
```

## Architecture Decisions (Ratified)

| Decision              | Choice                            | Rationale                                                    |
| --------------------- | --------------------------------- | ------------------------------------------------------------ |
| **Base type**         | `Node`                            | Universal container, graph-native, no conflict with subtypes |
| **Type system**       | Schema-defined                    | Flexible, user-extensible, JSON-LD native                    |
| **Schema definition** | Code-first via `defineSchema()`   | TypeScript inference, co-located validation                  |
| **TypeScript**        | Inferred from schema              | No codegen for dev schemas, full type safety                 |
| **Global namespace**  | IRIs: `xnet://<authority>/<path>` | No collisions, federation-ready                              |
| **Package structure** | Unified `@xnetjs/data`            | Single mental model for "where data lives"                   |
| **Sync primitives**   | `Change<T>` in `@xnetjs/sync`     | Unified across Yjs and event-sourcing                        |

## Target Architecture

```mermaid
flowchart TD
    subgraph data["@xnetjs/data"]
        subgraph schema["Schema System"]
            DS["defineSchema()"]
            PH["Property Helpers<br/>text(), select(), date()..."]
            SR["Schema Registry"]
            VAL["Validation"]
        end

        subgraph types["Node Types"]
            NODE["Node (base)"]
            PAGE["Page"]
            DB["Database"]
            ITEM["Item"]
            CANVAS["Canvas"]
        end

        subgraph builtin["Built-in Schemas"]
            PS["PageSchema"]
            DBS["DatabaseSchema"]
            IS["ItemSchema"]
            CS["CanvasSchema"]
            TS["TaskSchema"]
        end
    end

    subgraph sync["@xnetjs/sync"]
        CHANGE["Change&lt;T&gt;"]
        CLOCK["VectorClock"]
        CHAIN["Hash Chain"]
        PROV["SyncProvider"]
    end

    DS --> PH
    DS --> VAL
    DS --> builtin
    builtin --> types
    NODE --> PAGE
    NODE --> DB
    NODE --> ITEM
    NODE --> CANVAS

    sync --> data
```

## Implementation Phases

### Phase 1: Foundation (Week 1-2)

| Task | Document                                                                     | Description                                           |
| ---- | ---------------------------------------------------------------------------- | ----------------------------------------------------- |
| 1.1  | [01-xnet-sync-package.md](./01-xnet-sync-package.md)                         | Create `@xnetjs/sync` with `Change<T>`, vector clocks |
| 1.2  | [04-hash-function-consolidation.md](./04-hash-function-consolidation.md)     | Single source for hashing in `@xnetjs/crypto`         |
| 1.3  | [02-property-value-simplification.md](./02-property-value-simplification.md) | JSON-only PropertyValue types                         |

**Validation Gate:**

- [ ] `Change<T>` replaces `SignedUpdate` and `RecordOperation`
- [ ] All hash functions come from `@xnetjs/crypto`
- [ ] PropertyValue is JSON-serializable
- [ ] All existing tests pass

### Phase 2: Schema System (Week 2-3)

| Task | Document                                                             | Description                                |
| ---- | -------------------------------------------------------------------- | ------------------------------------------ |
| 2.1  | [12-code-first-schemas.md](./12-code-first-schemas.md)               | `defineSchema()` API with property helpers |
| 2.2  | [09-schema-first-architecture.md](./09-schema-first-architecture.md) | `Node` base type, `Schema` as Node         |
| 2.3  | [11-global-schema-namespacing.md](./11-global-schema-namespacing.md) | IRI-based schema identifiers               |

**Validation Gate:**

- [ ] `defineSchema()` works with TypeScript inference
- [ ] Property helpers: `text()`, `select()`, `date()`, `relation()`, etc.
- [ ] `Node` is the universal base type
- [ ] Schemas are Nodes (self-describing)
- [ ] Schema IRIs: `xnet://xnet.dev/Page`, `xnet://did:key:.../Recipe`

### Phase 3: Package Consolidation (Week 3-4)

| Task | Document                                                         | Description                                 |
| ---- | ---------------------------------------------------------------- | ------------------------------------------- |
| 3.1  | [06-package-naming-proposal.md](./06-package-naming-proposal.md) | Merge `@xnetjs/records` into `@xnetjs/data` |
| 3.2  | [03-unified-document-model.md](./03-unified-document-model.md)   | Migrate to Node-based model                 |
| 3.3  | -                                                                | Update React hooks for schema-aware usage   |

**Validation Gate:**

- [ ] `@xnetjs/data` contains all data functionality
- [ ] `@xnetjs/records` re-exports for backward compatibility
- [ ] Built-in schemas: Page, Database, Item, Canvas, Task
- [ ] React hooks work with Node/Schema model

### Phase 4: JSON-LD & Polish (Week 4-5)

| Task | Document                                               | Description                     |
| ---- | ------------------------------------------------------ | ------------------------------- |
| 4.1  | [08-jsonld-integration.md](./08-jsonld-integration.md) | JSON-LD context, export/import  |
| 4.2  | -                                                      | Schema.org mappings for interop |
| 4.3  | -                                                      | Update CLAUDE.md, documentation |

**Validation Gate:**

- [ ] `toJsonLd()` / `fromJsonLd()` work for all Node types
- [ ] Schema.org mappings via `sameAs` property
- [ ] Export produces valid JSON-LD
- [ ] Documentation reflects new architecture

## Reference Documents

| #   | Document                                                    | Purpose                                        |
| --- | ----------------------------------------------------------- | ---------------------------------------------- |
| 00  | [Overview](./00-overview.md)                                | Original goals (now superseded by this README) |
| 05  | [Timeline](./05-timeline.md)                                | Original timeline (to be updated)              |
| 07  | [Naming Research](./07-naming-research.md)                  | Research on Node vs Document naming            |
| 10  | [Schema + TypeScript](./10-schema-first-with-typescript.md) | Codegen approach (superseded by code-first)    |

## Core Concepts

### Node: The Minimal Universal Container

A Node has only 4 universal fields - everything else is schema-defined:

```typescript
interface Node {
  // Identity (required)
  id: string // Unique identifier
  schemaId: string // What type? e.g., 'xnet://xnet.dev/Task'

  // Provenance (required - set once at creation)
  createdAt: number // Unix timestamp (ms)
  createdBy: string // DID of creator

  // Everything else is schema-defined
  [key: string]: unknown
}
```

**Why these 4 fields?**

- `id` + `schemaId`: Required for identity and type
- `createdAt` + `createdBy`: Essential for sync, attribution, and debugging in P2P systems

**What's NOT universal:**

- `updatedAt`/`updatedBy`: Can be derived from Change history, or added by schemas that need it
- `workspaceId`/`parentId`: Not all nodes have these relationships
- `deleted`: Soft-delete is an application concern
- `content`/`children`: Schema-defined capabilities, not universal

**Example: A Task Node**

```typescript
{
  id: 'task-abc123',
  schemaId: 'xnet://xnet.dev/Task',
  createdAt: 1737500000000,
  createdBy: 'did:key:z6Mk...',

  // Schema-defined fields:
  title: 'Fix the bug',
  status: 'in-progress',
  assignee: 'did:key:z6Mk...',
  dueDate: '2026-01-25'
}
```

**Why minimal?**

- Schemas define ALL domain-specific structure
- JSON-LD fields (`@context`, `@type`) added only on export, not stored
- Content (Yjs doc) and children are schema-defined capabilities

### Schema: The Type Definition

```typescript
interface Schema {
  // JSON-LD identity
  '@id': SchemaIRI // e.g., 'xnet://xnet.dev/Task'
  '@type': 'xnet://xnet.dev/Schema'

  // Definition
  name: string
  namespace: string
  properties: PropertyDefinition[]
  extends?: SchemaIRI
  document?: 'yjs' | 'automerge' // CRDT document type for rich content
}
```

### defineSchema(): Code-First Definition

```typescript
import { defineSchema, text, select, date, person } from '@xnetjs/data/schema'

export const TaskSchema = defineSchema({
  name: 'Task',
  namespace: 'xnet://xnet.dev/',

  properties: {
    title: text({ required: true, maxLength: 500 }),
    status: select({
      options: [
        { id: 'todo', name: 'To Do', color: 'gray' },
        { id: 'in-progress', name: 'In Progress', color: 'blue' },
        { id: 'done', name: 'Done', color: 'green' }
      ] as const,
      default: 'todo'
    }),
    dueDate: date({ includeTime: false }),
    assignee: person({ multiple: false })
  },

  document: 'yjs' // Enable collaborative Y.Doc for rich content
})

// Type is INFERRED from the schema definition
export type Task = InferNode<typeof TaskSchema>

// Full API
TaskSchema.create({ title: 'Fix bug', status: 'todo' }) // Create node
TaskSchema.validate(unknownData) // Runtime validation
TaskSchema.is(someNode) // Type guard
TaskSchema.schema // JSON-LD export
```

### Global Schema Namespace

```
xnet://xnet.dev/Page              # Built-in (ships with xNet)
xnet://xnet.dev/Task              # Built-in task type
xnet://schema.org/Person          # Web standard mapping
xnet://acme-corp.com/Project      # Organization schema
xnet://did:key:z6Mk.../Recipe     # Personal schema
```

## Package Structure (Target)

```
packages/
├── sync/                         # NEW: Unified sync primitives
│   └── src/
│       ├── change.ts             # Change<T> type
│       ├── clock.ts              # Vector clock utils
│       ├── chain.ts              # Hash chain utils
│       └── provider.ts           # SyncProvider interface
│
├── data/                         # EXPANDED: All data types
│   └── src/
│       ├── schema/               # Schema system
│       │   ├── define.ts         # defineSchema()
│       │   ├── registry.ts       # Schema registry
│       │   ├── validation.ts     # Runtime validation
│       │   └── properties/       # Property helpers
│       │       ├── text.ts
│       │       ├── select.ts
│       │       ├── date.ts
│       │       └── ...
│       │
│       ├── schemas/              # Built-in schemas
│       │   ├── page.ts
│       │   ├── database.ts
│       │   ├── item.ts
│       │   ├── canvas.ts
│       │   └── task.ts
│       │
│       ├── types/                # Core types
│       │   ├── node.ts           # Node interface
│       │   └── schema.ts         # Schema interface
│       │
│       ├── sync/                 # Sync implementations
│       │   ├── yjs.ts            # Yjs adapter
│       │   └── event.ts          # Event-sourced adapter
│       │
│       └── jsonld/               # JSON-LD support
│           ├── context.ts
│           ├── export.ts
│           └── import.ts
│
├── records/                      # DEPRECATED: Re-exports from @xnetjs/data
│   └── src/
│       └── index.ts              # export * from '@xnetjs/data/record'
```

## Success Criteria

After completing this plan:

1. **Single mental model** - Everything is a Node with a Schema
2. **Code-first schemas** - `defineSchema()` with TypeScript inference
3. **Co-located validation** - Property helpers include validators
4. **Global namespace** - Schemas identified by unique IRIs
5. **JSON-LD native** - Schemas ARE JSON-LD type definitions
6. **Unified sync** - `Change<T>` for all sync mechanisms
7. **Single data package** - `@xnetjs/data` contains everything
8. **All tests pass** - >80% coverage maintained
9. **Documentation accurate** - CLAUDE.md reflects new architecture

## Migration Notes

### For Existing Code

```typescript
// Before
import { XDocument } from '@xnetjs/data'
import { DatabaseItem, Database } from '@xnetjs/records'

// After
import { Node, Page, Item, Database } from '@xnetjs/data'
import { PageSchema, ItemSchema, DatabaseSchema } from '@xnetjs/data/schemas'

// Type guards
if (PageSchema.is(node)) {
  // TypeScript knows this is a Page
}
```

### Backward Compatibility

- `@xnetjs/records` will re-export from `@xnetjs/data` for 1-2 versions
- Old type names (`XDocument`, `DatabaseItem`) will be deprecated aliases
- Sync mechanisms (Yjs, event-sourcing) unchanged internally

---

## Quick Start for Implementation

1. **Start with Phase 1.1** - Create `@xnetjs/sync` package
2. **Run tests after each change** - `pnpm test`
3. **Update one package at a time** - Don't refactor everything at once
4. **Keep backward compat** - Add aliases before removing old exports

---

[Back to plan02DatabasePlatform](../plan02DatabasePlatform/README.md) | [Start Implementation →](./01-xnet-sync-package.md)
