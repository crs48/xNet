# @xnet/react

React hooks for xNet - the primary API for building xNet applications.

## Installation

```bash
pnpm add @xnet/react @xnet/data
```

## Quick Start

```tsx
import { NodeStoreProvider, useQuery, useMutate, useNode } from '@xnet/react'
import { MemoryNodeStorageAdapter, defineSchema, text, select } from '@xnet/data'

// 1. Define your schema
const TaskSchema = defineSchema({
  name: 'Task',
  namespace: 'myapp://',
  properties: {
    title: text({ required: true }),
    status: select({
      options: [
        { id: 'todo', name: 'To Do' },
        { id: 'done', name: 'Done' }
      ] as const
    })
  }
})

// 2. Wrap your app with the provider
function App() {
  return (
    <NodeStoreProvider
      storage={new MemoryNodeStorageAdapter()}
      authorDID={identity.did}
      signingKey={privateKey}
    >
      <TaskApp />
    </NodeStoreProvider>
  )
}
```

## Core Hooks

### `useQuery` - Read Data

Query nodes with automatic real-time updates.

```tsx
import { useQuery } from '@xnet/react'

function TaskList() {
  // List all tasks
  const { data: tasks, loading, error } = useQuery(TaskSchema)

  if (loading) return <p>Loading...</p>
  if (error) return <p>Error: {error.message}</p>

  return (
    <ul>
      {tasks.map((task) => (
        <li key={task.id}>
          {task.title} {/* Direct property access - no .properties needed! */}
          <span>{task.status}</span>
        </li>
      ))}
    </ul>
  )
}
```

**Query by ID:**

```tsx
const { data: task } = useQuery(TaskSchema, taskId)
// task is null if not found
```

**Filtered & Sorted:**

```tsx
const { data: todoTasks } = useQuery(TaskSchema, {
  where: { status: 'todo' },
  orderBy: { createdAt: 'desc' },
  limit: 20
})
```

### `useMutate` - Write Data

Create, update, and delete nodes.

```tsx
import { useMutate } from '@xnet/react'

function CreateTaskButton() {
  const { create, isPending } = useMutate()

  const handleCreate = async () => {
    const task = await create(TaskSchema, {
      title: 'New Task',
      status: 'todo'
    })
    console.log('Created:', task.id)
  }

  return (
    <button onClick={handleCreate} disabled={isPending}>
      {isPending ? 'Creating...' : 'Create Task'}
    </button>
  )
}
```

**Update (untyped):**

```tsx
const { update } = useMutate()
await update(taskId, { status: 'done' })
```

**Update (type-safe):**

```tsx
const { updateTyped } = useMutate()
await updateTyped(TaskSchema, taskId, { status: 'done' }) // Type-checked!
await updateTyped(TaskSchema, taskId, { typo: 'x' }) // Compile error!
```

**Delete:**

```tsx
const { remove } = useMutate()
await remove(taskId) // Soft delete
```

**Transactions (atomic):**

```tsx
const { mutate } = useMutate()

await mutate([
  { type: 'update', id: task1.id, data: { order: 1 } },
  { type: 'update', id: task2.id, data: { order: 2 } },
  { type: 'delete', id: task3.id }
])
// All succeed or all fail
```

### `useNode` - Rich Text Editing

Load a node with its Y.Doc for collaborative rich text editing.

> **Note:** `useDocument` is available as a deprecated alias for `useNode`. Both work identically.

```tsx
import { useNode } from '@xnet/react'
import { RichTextEditor } from '@xnet/editor/react'

// Define a schema with document support
const PageSchema = defineSchema({
  name: 'Page',
  namespace: 'myapp://',
  properties: {
    title: text({ required: true })
  },
  document: 'yjs' // Enable Y.Doc for rich text
})

function DocumentEditor({ pageId }) {
  const {
    data: page, // FlatNode - page.title works directly
    doc, // Y.Doc for rich text
    update, // Type-safe property updates
    loading,
    error,
    syncStatus, // 'offline' | 'connecting' | 'connected'
    peerCount, // Number of connected peers
    remoteUsers // [{ id, name, color, isActive }]
  } = useNode(PageSchema, pageId, {
    createIfMissing: { title: 'Untitled' }, // Auto-create if not found
    user: { name: 'Alice' } // Presence info
  })

  if (loading) return <p>Loading...</p>
  if (error) return <p>Error: {error.message}</p>
  if (!page || !doc) return <p>Not found</p>

  return (
    <div>
      {/* Title input with type-safe update */}
      <input value={page.title} onChange={(e) => update({ title: e.target.value })} />

      {/* Sync status */}
      <span>
        {syncStatus === 'connected' ? '🟢' : '🔴'}
        {peerCount} peers
      </span>

      {/* Collaborators */}
      {remoteUsers.map((user) => (
        <span key={user.id} style={{ color: user.color }}>
          {user.name}
        </span>
      ))}

      {/* Rich text editor */}
      <RichTextEditor ydoc={doc} />
    </div>
  )
}
```

## Additional Hooks

### `useIdentity`

Access the current user's identity.

```tsx
import { useIdentity } from '@xnet/react'

function UserInfo() {
  const { identity, isAuthenticated, did } = useIdentity()

  if (!isAuthenticated) return <p>Not logged in</p>

  return <p>Logged in as {did}</p>
}
```

### `useNodeStore`

Direct access to the NodeStore (escape hatch for advanced use cases).

```tsx
import { useNodeStore } from '@xnet/react'

function AdvancedComponent() {
  const { store, isReady, error } = useNodeStore()

  // Direct store access
  const doSomething = async () => {
    const nodes = await store.list({ schemaId: 'myapp://Task' })
  }
}
```

## Type Safety with FlatNode

All hooks return `FlatNode<Schema>` which flattens properties to the top level:

```tsx
// Old pattern (don't do this)
const title = page.properties.title as string

// New pattern (just works!)
const title = page.title // Correctly typed as string
```

## API Reference

### `useQuery`

| Parameter     | Type                    | Description               |
| ------------- | ----------------------- | ------------------------- |
| `schema`      | `DefinedSchema<P>`      | The schema to query       |
| `idOrFilter?` | `string \| QueryFilter` | Node ID or filter options |

**QueryFilter options:**

- `where?: Partial<Props>` - Filter by property values
- `orderBy?: { [key]: 'asc' | 'desc' }` - Sort order
- `limit?: number` - Max results
- `offset?: number` - Skip results
- `includeDeleted?: boolean` - Include soft-deleted nodes

### `useMutate`

Returns:

- `create(schema, data, id?)` - Create a node
- `update(id, data)` - Update (untyped)
- `updateTyped(schema, id, data)` - Update (type-safe)
- `remove(id)` - Soft delete
- `restore(id)` - Restore deleted
- `mutate(ops[])` - Transaction
- `isPending` - Any mutation in progress
- `pendingCount` - Number of pending mutations

### `useNode`

| Parameter  | Type               | Description                   |
| ---------- | ------------------ | ----------------------------- |
| `schema`   | `DefinedSchema<P>` | Schema with `document: 'yjs'` |
| `id`       | `string \| null`   | Node ID                       |
| `options?` | `UseNodeOptions`   | Configuration                 |

**UseNodeOptions:**

- `createIfMissing?: Props` - Auto-create defaults
- `user?: { name, color? }` - Presence info
- `signalingServers?: string[]` - WebRTC signaling
- `disableSync?: boolean` - Disable P2P sync
- `persistDebounce?: number` - Save debounce (ms)

## Related Packages

- `@xnet/data` - Schema system and NodeStore
- `@xnet/editor` - Rich text editor components
- `@xnet/storage` - IndexedDB storage adapter
- `@xnet/identity` - DID and key management
