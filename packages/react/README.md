# @xnet/react

React hooks for xNet.

## Installation

```bash
pnpm add @xnet/react
```

## Usage

```tsx
import { NodeStoreProvider, useQuery, useMutate, useDocument } from '@xnet/react'
import { MemoryNodeStorageAdapter } from '@xnet/data'

// Wrap app with provider
function App() {
  return (
    <NodeStoreProvider
      storage={new MemoryNodeStorageAdapter()}
      authorDID={identity.did}
      signingKey={privateKey}
    >
      <MyApp />
    </NodeStoreProvider>
  )
}

// Read data
function TaskList() {
  const { data: tasks, loading } = useQuery(TaskSchema)

  if (loading) return <p>Loading...</p>

  return (
    <ul>
      {tasks.map(task => (
        <li key={task.id}>{task.title}</li>  {/* Direct property access */}
      ))}
    </ul>
  )
}

// Write data
function CreateTask() {
  const { create, isPending } = useMutate()

  return (
    <button
      disabled={isPending}
      onClick={() => create(TaskSchema, { title: 'New Task', status: 'todo' })}
    >
      Create Task
    </button>
  )
}

// Edit documents with Y.Doc
function DocumentEditor({ pageId }) {
  const { data, doc, update, syncStatus, remoteUsers } = useDocument(PageSchema, pageId, {
    createIfMissing: { title: 'Untitled' }
  })

  if (!data) return <p>Loading...</p>

  return (
    <div>
      <input value={data.title} onChange={e => update({ title: e.target.value })} />
      <Editor doc={doc} />
    </div>
  )
}
```

## Core Hooks

| Hook          | Purpose                                            |
| ------------- | -------------------------------------------------- |
| `useQuery`    | Read nodes (list, single by ID, filtered)          |
| `useMutate`   | Write nodes (create, update, delete, transactions) |
| `useDocument` | Y.Doc for rich text + sync + presence              |

## Additional Hooks

- `useIdentity` - Current user identity
- `useNodeStore` - Direct access to NodeStore (escape hatch)
