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

## Key Documents

Read these in order for full context:

1. `docs/planStep02_1DataModelConsolidation/README.md` - **Master plan with phases**
2. `docs/planStep02_1DataModelConsolidation/12-code-first-schemas.md` - **defineSchema() API design**
3. `docs/planStep02_1DataModelConsolidation/09-schema-first-architecture.md` - Node/Schema concepts
4. `docs/planStep02_1DataModelConsolidation/11-global-schema-namespacing.md` - IRI namespace design
5. `docs/planStep02_1DataModelConsolidation/01-xnet-sync-package.md` - Change<T> sync primitives

## Implementation Order

### Phase 1: Foundation (Start Here)

```bash
# 1.1 Create @xnet/sync package
packages/sync/
├── src/
│   ├── index.ts
│   ├── change.ts      # Change<T>, signChange, verifyChange
│   ├── clock.ts       # Vector clock utilities
│   ├── chain.ts       # Hash chain utilities
│   └── provider.ts    # SyncProvider interface, SyncStatus
├── package.json
└── tsconfig.json
```

Key types from `01-xnet-sync-package.md`:

- `Change<T>` - Replaces `SignedUpdate` and `RecordOperation`
- `UnsignedChange<T>` - Before signing
- `signChange()`, `verifyChange()` - Crypto operations
- `SyncStatus` - `'disconnected' | 'connecting' | 'synced' | 'syncing' | 'error'`

### Phase 2: Schema System

```bash
# 2.1 Create schema infrastructure in @xnet/data
packages/data/src/schema/
├── define.ts          # defineSchema() function
├── registry.ts        # Schema registry
├── validation.ts      # Runtime validation
├── infer.ts           # TypeScript type inference helpers
└── properties/        # Property helper functions
    ├── index.ts
    ├── text.ts
    ├── number.ts
    ├── select.ts
    ├── date.ts
    └── ... (18 total)
```

Key API from `12-code-first-schemas.md`:

```typescript
// Each property helper returns: definition + validator + coercer + type hint
export function text(options: TextOptions = {}) {
  return {
    definition: { type: 'text', required: options.required ?? false, ... },
    validate(value: unknown): value is string { ... },
    coerce(value: unknown): string | null { ... },
    _type: '' as string  // For TypeScript inference
  }
}

// defineSchema combines property helpers into a full schema
export function defineSchema<P extends Record<string, PropertyBuilder>>(
  options: SchemaOptions<P>
): DefinedSchema<P> {
  // Returns: schema object + validate() + create() + is() type guard
}

// Type inference
type InferNode<S> = { schemaId: S['_schemaId'], properties: InferProperties<S['_properties']>, ... }
```

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
pnpm --filter @xnet/sync test    # New sync package
pnpm --filter @xnet/data test    # Data package
pnpm test:coverage               # Coverage check
```

## Implementation Progress

### Phase 1.1: @xnet/sync Package - COMPLETE

The `@xnet/sync` package has been implemented with:

- **change.ts**: `Change<T>`, `UnsignedChange<T>`, `signChange()`, `verifyChange()`, `verifyChangeHash()`
- **clock.ts**: Vector clock utilities (create, increment, merge, compare, happenedBefore, etc.)
- **chain.ts**: Hash chain validation, fork detection, topological sort
- **provider.ts**: `SyncProvider` interface, `SyncStatus`, `BaseSyncProvider` abstract class

**Tests:** 85 passing tests across all modules.

### Next Steps

1. **Phase 1.2**: Consolidate hash functions in `@xnet/crypto`
2. **Phase 1.3**: Simplify PropertyValue to JSON-only
3. **Phase 2.1**: Implement `defineSchema()` API in `@xnet/data`

## Commits Made

```
fab5baf Ratify schema-first, Node-based architecture
01b7ef8 Add code-first schema definition with TypeScript inference
87e2aaf Add schema-first architecture with TypeScript codegen and global namespacing
b28c198 Add package merge, naming research, and JSON-LD integration plans
58888da Apply naming conventions: Operation→Change, PageDocument→Page, etc.
56de5d3 Add codebase review and data model consolidation plan
(pending) Implement @xnet/sync package
```

## Prompt to Continue

```
I'm implementing the schema-first architecture for xNet. Read the handoff document at docs/planStep02_1DataModelConsolidation/HANDOFF.md and the README.md in the same directory.

Phase 1.1 (@xnet/sync) is complete. Continue with Phase 1.2: Consolidate hash functions in @xnet/crypto, or Phase 2: Begin the schema system with defineSchema() API.
```

---

_Last updated: January 21, 2026_
