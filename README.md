# xNet

Decentralized internet infrastructure SDK for building local-first, peer-to-peer applications.

## Getting Started

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test
```

## Monorepo Structure

```
packages/           # Core SDK packages
  @xnet/core/       # Types, schemas, content addressing
  @xnet/crypto/     # Encryption, signing, hashing
  @xnet/identity/   # DID:key, UCAN tokens
  @xnet/storage/    # IndexedDB/SQLite adapters
  @xnet/data/       # Yjs CRDT engine
  @xnet/network/    # libp2p, WebRTC, P2P sync
  @xnet/query/      # Local + federated queries
  @xnet/react/      # React hooks
  @xnet/sdk/        # Unified SDK bundle

apps/               # Platform applications
  electron/         # macOS/Windows/Linux desktop
  expo/             # iOS/Android mobile
  web/              # Web PWA
```

## Key Technologies

- **CRDT**: Yjs for conflict-free collaboration
- **P2P**: libp2p + WebRTC
- **Storage**: IndexedDB (browser), SQLite (native)
- **Identity**: DID:key + UCAN authorization
- **Crypto**: libsodium (Ed25519, X25519, XChaCha20-Poly1305)
- **Hashing**: BLAKE3 for content addressing

## Usage

```typescript
import { createXNetClient, IndexedDBAdapter } from '@xnet/sdk'

// Create client
const client = await createXNetClient({
  storage: new IndexedDBAdapter()
})

// Create document
const doc = await client.createDocument({
  workspace: 'default',
  type: 'page',
  title: 'My Note'
})

// Query documents
const results = await client.query({
  type: 'page',
  sort: [{ field: 'updated', direction: 'desc' }]
})
```

## React Hooks

Two hooks for all data operations:

- **`useQuery`** - All reads (list, single, filtered)
- **`useMutate`** - All writes (create, update, remove, transactions)

```tsx
import { NodeStoreProvider, useQuery, useMutate, useSync, useIdentity } from '@xnet/react'
import { defineSchema, text, select, MemoryNodeStorageAdapter } from '@xnet/data'

// Define a schema (fully typed)
const TaskSchema = defineSchema({
  name: 'Task',
  namespace: 'xnet://myapp/',
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

// Wrap your app with NodeStoreProvider
function App() {
  return (
    <NodeStoreProvider
      storage={new MemoryNodeStorageAdapter()}
      authorDID={identity.did}
      signingKey={identity.signingKey}
    >
      <TaskApp />
    </NodeStoreProvider>
  )
}

// List all tasks
function TaskList() {
  const { data: tasks, loading } = useQuery(TaskSchema)
  const { create } = useMutate()

  if (loading) return <div>Loading...</div>

  return (
    <div>
      <ul>
        {tasks.map((task) => (
          <li key={task.id}>{task.properties.title}</li>
        ))}
      </ul>
      <button onClick={() => create(TaskSchema, { title: 'New Task', status: 'todo' })}>
        Add Task
      </button>
    </div>
  )
}

// Get single task by ID
function TaskDetail({ taskId }: { taskId: string }) {
  const { data: task, loading } = useQuery(TaskSchema, taskId)
  const { update, remove } = useMutate()

  if (loading) return <div>Loading...</div>
  if (!task) return <div>Not found</div>

  return (
    <div>
      <h1>{task.properties.title}</h1>
      <select
        value={task.properties.status}
        onChange={(e) => update(taskId, { status: e.target.value })}
      >
        <option value="todo">To Do</option>
        <option value="done">Done</option>
      </select>
      <button onClick={() => remove(taskId)}>Delete</button>
    </div>
  )
}

// Query with filters
function DoneTasks() {
  const { data: doneTasks } = useQuery(TaskSchema, {
    where: { status: 'done' }
  })

  return <div>{doneTasks.length} completed</div>
}

// Atomic transactions (multiple operations)
function BatchOperations() {
  const { mutate } = useMutate()

  const handleBatchCreate = async () => {
    await mutate([
      { type: 'create', schema: TaskSchema, data: { title: 'Task 1', status: 'todo' } },
      { type: 'create', schema: TaskSchema, data: { title: 'Task 2', status: 'todo' } }
    ])
  }

  return <button onClick={handleBatchCreate}>Create Multiple</button>
}

// Show sync status
function SyncStatus() {
  const { status, peerCount } = useSync()
  return (
    <span>
      {status} ({peerCount} peers)
    </span>
  )
}

// Access current identity
function Profile() {
  const { identity } = useIdentity()
  return <code>{identity?.did}</code>
}
```

## Documentation

See [docs/planStep01MVP](./docs/planStep01MVP) for implementation details.

## License

MIT
