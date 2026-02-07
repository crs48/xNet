# Plan Step 03.4: Expo/Mobile Storage Durability

## Status: COMPLETE ✅

> **Superseded by [plan03_9_5IndexedDBToSQLite](../plan03_9_5IndexedDBToSQLite/)** - Unified SQLite storage across all platforms.

| Component                   | Status   | Notes                                                 |
| --------------------------- | -------- | ----------------------------------------------------- |
| `expo-sqlite` dependency    | ✅ Done  | v15.0.0 in `apps/expo/package.json`                   |
| `ExpoSQLiteAdapter`         | ✅ Done  | `@xnet/sqlite/expo` - unified adapter                 |
| `SQLiteNodeStorageAdapter`  | ✅ Done  | `@xnet/data` - shared across all platforms            |
| Mobile lifecycle (AppState) | Deferred | Can be added later if needed for battery optimization |

**Resolution:** The unified SQLite migration (plan03_9_5) implemented `@xnet/sqlite` package with platform-specific adapters:

- `ExpoSQLiteAdapter` in `packages/sqlite/src/adapters/expo.ts`
- `SQLiteNodeStorageAdapter` in `packages/data/src/store/sqlite-adapter.ts`
- Expo app updated in `apps/expo/src/context/XNetProvider.tsx` to use these adapters

Data is now persisted to SQLite on mobile - no more data loss on restart.

## Problem

Mobile platforms evict IndexedDB data:

- **iOS**: 7-day eviction via ITP, storage pressure eviction
- **Android**: Memory pressure cleanup, user data clearing

Solution: Use native SQLite via `expo-sqlite`.

## Reference: How Web and Electron Do It

### Web App (`apps/web/src/App.tsx`)

```typescript
// Storage singletons at module level
const nodeStorage = new IndexedDBNodeStorageAdapter()
const storageAdapter = new IndexedDBAdapter()
const blobStore = new BlobStore(storageAdapter)

// XNetProvider config
<XNetProvider
  config={{
    nodeStorage,                    // IndexedDBNodeStorageAdapter
    authorDID: identity.did,
    signingKey: keyBundle.signingKey,
    blobStore,
    hubUrl: HUB_URL,
    platform: 'web'
  }}
>
```

**Pattern:** Storage adapters created as singletons, passed to `XNetProvider`. SyncManager created internally by provider when `hubUrl` is provided.

### Electron App (`apps/electron/`)

```
Renderer Process          Main Process           Data Utility Process
─────────────────         ────────────           ────────────────────
IndexedDB (nodes)    ──▶  IPC routing      ──▶  SQLite (blobs)
IPCBlobStore                                     Y.Doc pool
IPCSyncManager       ◀──  MessagePort      ◀──  WebSocket sync
```

```typescript
// Renderer: apps/electron/src/renderer/main.tsx
const nodeStorage = new IndexedDBNodeStorageAdapter({ dbName })
const ipcBlobStore = createIPCBlobStore()
const ipcSyncManager = createIPCSyncManager()

<XNetProvider
  config={{
    nodeStorage,
    authorDID,
    signingKey,
    blobStore: ipcBlobStore,       // IPC to main process
    syncManager: ipcSyncManager,   // IPC to data utility process
    platform: 'electron'
  }}
>
```

**Pattern:** When `syncManager` is provided, XNetProvider uses it directly instead of creating one internally.

## Target Architecture for Expo

Expo is simpler than Electron — single JS thread, no IPC needed:

```
┌─────────────────────────────────────┐
│         Expo App (single thread)    │
│                                     │
│  ┌─────────────┐  ┌──────────────┐  │
│  │ React UI    │  │ SyncManager  │  │
│  │ (components)│  │ (internal)   │  │
│  └──────┬──────┘  └──────┬───────┘  │
│         │                │          │
│         ▼                ▼          │
│  ┌─────────────────────────────────┐│
│  │   SQLiteNodeStorageAdapter      ││
│  │   (implements NodeStorageAdapter)│
│  └──────────────┬──────────────────┘│
│                 ▼                   │
│          ┌───────────┐              │
│          │  SQLite   │              │
│          │  xnet.db  │              │
│          └───────────┘              │
└─────────────────────────────────────┘
```

Follow the **web pattern**: storage adapter as singleton, SyncManager created internally.

## Implementation

### Step 1: Create `SQLiteNodeStorageAdapter`

Create `apps/expo/src/storage/SQLiteNodeStorageAdapter.ts`:

```typescript
import * as SQLite from 'expo-sqlite'
import type {
  NodeStorageAdapter,
  NodeChange,
  NodeState,
  NodeId,
  ContentId,
  ListNodesOptions,
  CountNodesOptions
} from '@xnet/data'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS nodes (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS changes (
  hash TEXT PRIMARY KEY,
  node_id TEXT NOT NULL,
  lamport INTEGER NOT NULL,
  data TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_changes_node ON changes(node_id);
CREATE INDEX IF NOT EXISTS idx_changes_lamport ON changes(lamport);

CREATE TABLE IF NOT EXISTS documents (
  node_id TEXT PRIMARY KEY,
  content BLOB NOT NULL
);

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`

export class SQLiteNodeStorageAdapter implements NodeStorageAdapter {
  private db: SQLite.SQLiteDatabase | null = null

  constructor(private dbName = 'xnet.db') {}

  async open(): Promise<void> {
    this.db = await SQLite.openDatabaseAsync(this.dbName)
    await this.db.execAsync(SCHEMA)
  }

  async close(): Promise<void> {
    await this.db?.closeAsync()
    this.db = null
  }

  // --- Nodes ---

  async getNode(id: NodeId): Promise<NodeState | null> {
    const row = await this.db!.getFirstAsync<{ data: string }>(
      'SELECT data FROM nodes WHERE id = ?',
      [id]
    )
    return row ? JSON.parse(row.data) : null
  }

  async setNode(node: NodeState): Promise<void> {
    await this.db!.runAsync('INSERT OR REPLACE INTO nodes (id, data) VALUES (?, ?)', [
      node.id,
      JSON.stringify(node)
    ])
  }

  async deleteNode(id: NodeId): Promise<void> {
    await this.db!.runAsync('DELETE FROM nodes WHERE id = ?', [id])
  }

  async listNodes(options?: ListNodesOptions): Promise<NodeState[]> {
    // Filter in JS for simplicity (can optimize with SQL later)
    const rows = await this.db!.getAllAsync<{ data: string }>('SELECT data FROM nodes')
    let nodes = rows.map((r) => JSON.parse(r.data) as NodeState)

    if (options?.schemaId) {
      nodes = nodes.filter((n) => n.schemaId === options.schemaId)
    }
    if (!options?.includeDeleted) {
      nodes = nodes.filter((n) => !n.deleted)
    }
    if (options?.offset) {
      nodes = nodes.slice(options.offset)
    }
    if (options?.limit) {
      nodes = nodes.slice(0, options.limit)
    }
    return nodes
  }

  async countNodes(options?: CountNodesOptions): Promise<number> {
    const nodes = await this.listNodes(options)
    return nodes.length
  }

  // --- Changes ---

  async appendChange(change: NodeChange): Promise<void> {
    await this.db!.runAsync(
      'INSERT OR IGNORE INTO changes (hash, node_id, lamport, data) VALUES (?, ?, ?, ?)',
      [change.hash, change.payload.nodeId, change.lamport.time, JSON.stringify(change)]
    )
  }

  async getChanges(nodeId: NodeId): Promise<NodeChange[]> {
    const rows = await this.db!.getAllAsync<{ data: string }>(
      'SELECT data FROM changes WHERE node_id = ? ORDER BY lamport',
      [nodeId]
    )
    return rows.map((r) => JSON.parse(r.data))
  }

  async getAllChanges(): Promise<NodeChange[]> {
    const rows = await this.db!.getAllAsync<{ data: string }>(
      'SELECT data FROM changes ORDER BY lamport'
    )
    return rows.map((r) => JSON.parse(r.data))
  }

  async getChangesSince(sinceLamport: number): Promise<NodeChange[]> {
    const rows = await this.db!.getAllAsync<{ data: string }>(
      'SELECT data FROM changes WHERE lamport > ? ORDER BY lamport',
      [sinceLamport]
    )
    return rows.map((r) => JSON.parse(r.data))
  }

  async getChangeByHash(hash: ContentId): Promise<NodeChange | null> {
    const row = await this.db!.getFirstAsync<{ data: string }>(
      'SELECT data FROM changes WHERE hash = ?',
      [hash]
    )
    return row ? JSON.parse(row.data) : null
  }

  async getLastChange(nodeId: NodeId): Promise<NodeChange | null> {
    const row = await this.db!.getFirstAsync<{ data: string }>(
      'SELECT data FROM changes WHERE node_id = ? ORDER BY lamport DESC LIMIT 1',
      [nodeId]
    )
    return row ? JSON.parse(row.data) : null
  }

  // --- Documents (Y.Doc binary state) ---

  async getDocumentContent(nodeId: NodeId): Promise<Uint8Array | null> {
    const row = await this.db!.getFirstAsync<{ content: ArrayBuffer }>(
      'SELECT content FROM documents WHERE node_id = ?',
      [nodeId]
    )
    return row ? new Uint8Array(row.content) : null
  }

  async setDocumentContent(nodeId: NodeId, content: Uint8Array): Promise<void> {
    await this.db!.runAsync('INSERT OR REPLACE INTO documents (node_id, content) VALUES (?, ?)', [
      nodeId,
      content
    ])
  }

  // --- Sync state ---

  async getLastLamportTime(): Promise<number> {
    const row = await this.db!.getFirstAsync<{ value: string }>(
      "SELECT value FROM meta WHERE key = 'lastLamportTime'"
    )
    return row ? parseInt(row.value, 10) : 0
  }

  async setLastLamportTime(time: number): Promise<void> {
    const current = await this.getLastLamportTime()
    if (time > current) {
      await this.db!.runAsync(
        "INSERT OR REPLACE INTO meta (key, value) VALUES ('lastLamportTime', ?)",
        [String(time)]
      )
    }
  }
}
```

### Step 2: Delete Old Adapters

Delete these files (wrong interface, superseded):

- `apps/expo/src/storage/ExpoSQLiteAdapter.ts`
- `apps/expo/src/storage/ExpoStorageAdapter.ts`

### Step 3: Update XNetProvider

Update `apps/expo/src/context/XNetProvider.tsx` to match web pattern:

```typescript
import { SQLiteNodeStorageAdapter } from '../storage/SQLiteNodeStorageAdapter'

// Storage singleton (like web app)
const nodeStorage = new SQLiteNodeStorageAdapter('xnet.db')

export function XNetProvider({ children, config = {} }: XNetProviderProps) {
  // ... existing identity loading ...

  useEffect(() => {
    async function init() {
      // Open storage
      await nodeStorage.open()

      // Create NodeStore (like web app)
      const nodeStore = new NodeStore({
        authorDID: identity.did as `did:key:${string}`,
        signingKey,
        storage: nodeStorage
      })
      await nodeStore.initialize()

      // ... rest of initialization ...
    }
    init()

    return () => {
      nodeStorage.close()
    }
  }, [])
}
```

### Step 4: Add Mobile Lifecycle Handling

Create `apps/expo/src/hooks/useSyncLifecycle.ts`:

```typescript
import { useEffect, useRef } from 'react'
import { AppState, type AppStateStatus } from 'react-native'
import type { SyncManager } from '@xnet/react'

export function useSyncLifecycle(syncManager: SyncManager | null) {
  const prevState = useRef<AppStateStatus>('active')

  useEffect(() => {
    if (!syncManager) return

    const subscription = AppState.addEventListener('change', async (nextState) => {
      const wasActive = prevState.current === 'active'
      const isBackground = /inactive|background/.test(nextState)
      const isActive = nextState === 'active'
      const wasBackground = /inactive|background/.test(prevState.current)

      if (wasActive && isBackground) {
        // Flush and disconnect
        await syncManager.stop()
      }
      if (wasBackground && isActive) {
        // Reconnect and sync
        await syncManager.start()
      }

      prevState.current = nextState
    })

    return () => subscription.remove()
  }, [syncManager])
}
```

Use in XNetProvider or app root:

```typescript
const { syncManager } = useXNetContext()
useSyncLifecycle(syncManager)
```

## Schema Notes

Simplified schema stores full JSON in `data` columns:

- **Pros:** Simple implementation, forward-compatible with new fields
- **Cons:** Can't query individual fields in SQL

For prerelease this is fine. Optimize later if needed by extracting queryable columns.

## Priority

**Medium** - Required before mobile production release.

Next steps:

1. Implement `SQLiteNodeStorageAdapter`
2. Delete old adapters
3. Update `XNetProvider`
4. Add `useSyncLifecycle` hook
5. Test on iOS and Android

## References

- [expo-sqlite docs](https://docs.expo.dev/versions/latest/sdk/sqlite/)
- [IndexedDBNodeStorageAdapter](../../packages/data/src/store/indexeddb-adapter.ts) — reference implementation
- [Web App storage setup](../../apps/web/src/App.tsx) — pattern to follow
