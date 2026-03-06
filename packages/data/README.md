# @xnetjs/data

Schema system, NodeStore, and Yjs CRDT engine for xNet. This is the central data package -- it defines how structured data and rich text documents are created, stored, and synced.

> **Status:** Mixed
> Stable entrypoints: `@xnetjs/data/schema`, `@xnetjs/data/store`, `@xnetjs/data/updates`, `@xnetjs/data/awareness`
> Experimental entrypoints: `@xnetjs/data/database`, `@xnetjs/data/auth`

The root `@xnetjs/data` barrel remains supported for compatibility, but new code should prefer the narrower entrypoints above. See [`docs/reference/api-lifecycle-matrix.md`](../../docs/reference/api-lifecycle-matrix.md) for the current matrix.

## Installation

```bash
pnpm add @xnetjs/data
```

## Features

- **Schema system** -- `defineSchema()` with 16 typed property helpers
- **NodeStore** -- Event-sourced LWW (Last-Writer-Wins) storage engine
- **Built-in schemas** -- Page, Database, Task, Canvas, Comment
- **Yjs CRDT** -- Y.Doc helpers for signed updates and merge/state-vector workflows
- **Awareness/presence** -- Real-time user presence
- **Blob service** -- File upload/download with content addressing
- **Storage adapters** -- SQLite and in-memory NodeStore adapters
- **Temp ID mapping** -- Optimistic creates with server-assigned IDs

## Usage

### Define a Schema

```typescript
import { defineSchema, text, number, select, date, checkbox, relation } from '@xnetjs/data'

const TaskSchema = defineSchema({
  name: 'Task',
  namespace: 'myapp://',
  document: 'yjs', // Enable rich text body
  properties: {
    title: text({ required: true }),
    priority: number(),
    done: checkbox(),
    dueDate: date(),
    status: select({
      options: [
        { id: 'todo', name: 'To Do' },
        { id: 'in-progress', name: 'In Progress' },
        { id: 'done', name: 'Done' }
      ] as const
    }),
    assignee: relation({ schema: 'myapp://Person' })
  }
})
```

### Property Helpers

| Type          | Import          | Description                 |
| ------------- | --------------- | --------------------------- |
| `text`        | `text()`        | String values               |
| `number`      | `number()`      | Numeric values              |
| `checkbox`    | `checkbox()`    | Boolean toggle              |
| `date`        | `date()`        | Single date                 |
| `dateRange`   | `dateRange()`   | Start + end date            |
| `select`      | `select()`      | Single choice               |
| `multiSelect` | `multiSelect()` | Multiple choices            |
| `person`      | `person()`      | DID reference               |
| `relation`    | `relation()`    | Link to another node        |
| `url`         | `url()`         | URL string                  |
| `email`       | `email()`       | Email address               |
| `phone`       | `phone()`       | Phone number                |
| `file`        | `file()`        | File attachment             |
| `created`     | `created()`     | Auto-set creation timestamp |
| `updated`     | `updated()`     | Auto-set update timestamp   |
| `createdBy`   | `createdBy()`   | Auto-set author DID         |

### NodeStore

```typescript
import { NodeStore, MemoryNodeStorageAdapter } from '@xnetjs/data'

const store = new NodeStore({
  storage: new MemoryNodeStorageAdapter(),
  authorDID: identity.did,
  signingKey: privateKey
})

// Create
const task = await store.create(TaskSchema, { title: 'Buy milk', status: 'todo' })

// Read
const loaded = await store.get(TaskSchema, task.id)

// Update
await store.update(TaskSchema, task.id, { status: 'done' })

// List
const tasks = await store.list(TaskSchema)

// Delete (soft)
await store.remove(task.id)
```

### Yjs Documents

```typescript
import { YDoc, captureUpdate, applySignedUpdate, signUpdate, mergeDocuments } from '@xnetjs/data'

const authorDID = identity.did
const signingKey = keyBundle.signingKey

const docA = new YDoc()
const docB = new YDoc()

// Edit rich text content
docA.getText('content').insert(0, 'Hello world')

// Capture and sign update bytes
const update = captureUpdate(docA)
const signed = signUpdate(update, { authorDID, signingKey })

// Verify/apply to another replica
applySignedUpdate(docB, signed)

// Merge full state from one doc into another
mergeDocuments(docA, docB)
```

## Architecture

```mermaid
flowchart TD
    Schema["defineSchema()<br/><small>16 property helpers</small>"]
    Store["NodeStore<br/><small>Event-sourced LWW</small>"]
    Doc["Yjs Documents<br/><small>CRDT rich text</small>"]
    Blob["BlobService<br/><small>File attachments</small>"]
    Builtin["Built-in Schemas<br/><small>Page, Database, Task,<br/>Canvas, Comment</small>"]

    Schema --> Store
    Schema --> Builtin
    Store --> Doc
    Store --> Blob
    Builtin --> Store

    subgraph Adapters["Storage Adapters"]
        SQLite["SQLite<br/>Adapter"]
        Mem["Memory<br/>Adapter"]
    end

    Store --> Adapters
```

### Storage Adapters

| Adapter                    | Platform | Description                            |
| -------------------------- | -------- | -------------------------------------- |
| `SQLiteNodeStorageAdapter` | All      | Primary adapter using `@xnetjs/sqlite` |
| `MemoryNodeStorageAdapter` | All      | In-memory storage for testing          |

**Recommended:** Use `SQLiteNodeStorageAdapter` with the appropriate `@xnetjs/sqlite` adapter for your platform:

```typescript
import { NodeStore, SQLiteNodeStorageAdapter } from '@xnetjs/data'
import { ElectronSQLiteAdapter } from '@xnetjs/sqlite/electron' // or /web, /expo

const sqliteAdapter = new ElectronSQLiteAdapter()
await sqliteAdapter.open({ path: 'xnet.db' })

const storage = new SQLiteNodeStorageAdapter(sqliteAdapter)
await storage.open()

const store = new NodeStore({
  storage,
  authorDID: identity.did,
  signingKey: privateKey
})
```

### Telemetry Integration

NodeStore supports optional telemetry for tracking CRUD operations, performance, and errors:

```typescript
import { NodeStore } from '@xnetjs/data'
import { TelemetryCollector, ConsentManager } from '@xnetjs/telemetry'

const consent = new ConsentManager()
const telemetry = new TelemetryCollector({ consent })

const store = new NodeStore({
  storage,
  authorDID: identity.did,
  signingKey: privateKey,
  telemetry // <-- Add telemetry collector
})
```

When telemetry is enabled, NodeStore automatically reports:

- **Performance metrics**: `data.create`, `data.update`, `data.delete`, `data.list`, `data.applyRemoteChange`
- **Usage metrics**: Operation counts
- **Security events**: Hash/signature verification failures, unauthorized remote changes
- **Crash reports**: Errors with context

All telemetry respects user consent settings and privacy buckets (no exact values, no PII).

## Modules

| Module                    | Description                            |
| ------------------------- | -------------------------------------- |
| `schema/define.ts`        | `defineSchema()` factory               |
| `schema/node.ts`          | FlatNode type (flattened properties)   |
| `schema/registry.ts`      | Schema registry                        |
| `store/store.ts`          | NodeStore engine                       |
| `store/sqlite-adapter.ts` | SQLite NodeStore adapter (recommended) |
| `store/memory-adapter.ts` | In-memory NodeStore adapter            |
| `store/tempids.ts`        | Temp ID mapping for optimistic creates |
| `updates.ts`              | Signed update and merge utilities      |
| `blob/blob-service.ts`    | File blob storage                      |
| `sync/awareness.ts`       | Presence awareness                     |
| `blocks/registry.ts`      | Block type registry                    |

## Dependencies

- `@xnetjs/core`, `@xnetjs/crypto`, `@xnetjs/identity`, `@xnetjs/storage`, `@xnetjs/sync`, `@xnetjs/sqlite`
- `yjs`, `y-protocols` -- CRDT engine
- `nanoid` -- ID generation

## Testing

```bash
pnpm --filter @xnetjs/data test
```

10 test files covering schema system, NodeStore, comments, and blob service.
