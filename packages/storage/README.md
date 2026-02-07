# @xnet/storage

Storage adapters, blob management, and snapshot persistence for xNet.

## Installation

```bash
pnpm add @xnet/storage
```

## Features

- **SQLite adapter** -- High-performance cross-platform storage via `@xnet/sqlite` (recommended)
- **IndexedDB adapter** -- Browser-native persistent storage via `idb` (deprecated)
- **Memory adapter** -- In-memory storage for testing
- **Blob store** -- Large binary object storage with content addressing
- **Chunk manager** -- Chunked blob storage for large files (streaming upload/download)
- **Snapshot manager** -- Point-in-time state snapshots with compression (pako)

## Usage

### SQLite Storage (Recommended)

```typescript
import { SQLiteStorageAdapter } from '@xnet/storage'
import { createMemorySQLiteAdapter } from '@xnet/sqlite/memory'

// Create SQLite adapter (use appropriate adapter for platform)
const sqliteDb = await createMemorySQLiteAdapter()
const storage = new SQLiteStorageAdapter(sqliteDb)

// Document operations
await storage.setDocument(id, data)
const doc = await storage.getDocument(id)
const ids = await storage.listDocuments()
```

### Platform-Specific SQLite Adapters

```typescript
// Electron (better-sqlite3)
import { createElectronSQLiteAdapter } from '@xnet/sqlite/electron'
const db = await createElectronSQLiteAdapter({ filename: 'xnet.db' })

// Web (sqlite-wasm + OPFS)
import { createWebSQLiteAdapter } from '@xnet/sqlite/web'
const db = await createWebSQLiteAdapter({ filename: 'xnet.db' })

// Expo (expo-sqlite)
import { createExpoSQLiteAdapter } from '@xnet/sqlite/expo'
const db = await createExpoSQLiteAdapter({ filename: 'xnet.db' })
```

### Legacy IndexedDB Storage (Deprecated)

```typescript
import { IndexedDBAdapter, MemoryAdapter } from '@xnet/storage'

// Browser storage (deprecated - use SQLiteStorageAdapter instead)
const storage = new IndexedDBAdapter()
await storage.open()

// In-memory for testing
const memory = new MemoryAdapter()
await memory.open()

// Document operations
await storage.setDocument(id, data)
const doc = await storage.getDocument(id)
const ids = await storage.listDocuments()
```

```typescript
import { BlobStore } from '@xnet/storage'

// Store and retrieve binary data
const blobStore = new BlobStore(adapter)
const blobId = await blobStore.put(data)
const blob = await blobStore.get(blobId)
```

```typescript
import { ChunkManager } from '@xnet/storage'

// Chunked storage for large files
const chunks = new ChunkManager(adapter)
await chunks.store(fileId, largeBuffer)
const restored = await chunks.retrieve(fileId)
```

```typescript
import { SnapshotManager } from '@xnet/storage'

// Compressed state snapshots
const snapshots = new SnapshotManager(adapter)
await snapshots.save(docId, state)
const snapshot = await snapshots.load(docId)
```

## Adapters

| Adapter                 | Platform | Backing store | Status       |
| ----------------------- | -------- | ------------- | ------------ |
| `SQLiteStorageAdapter`  | All      | SQLite        | Recommended  |
| `IndexedDBAdapter`      | Browser  | IndexedDB     | Deprecated   |
| `IndexedDBBatchAdapter` | Browser  | IndexedDB     | Deprecated   |
| `MemoryAdapter`         | Any      | In-memory Map | Testing only |

## Modules

| Module                  | Description                            |
| ----------------------- | -------------------------------------- |
| `adapters/sqlite.ts`    | SQLite storage adapter (recommended)   |
| `adapters/indexeddb.ts` | IndexedDB storage adapter (deprecated) |
| `adapters/memory.ts`    | In-memory storage adapter              |
| `blob-store.ts`         | Content-addressed blob storage         |
| `chunk-manager.ts`      | Chunked large file storage             |
| `snapshots/manager.ts`  | Compressed snapshot management         |
| `types.ts`              | StorageAdapter interface               |

## Dependencies

- `@xnet/core` -- Core types
- `@xnet/crypto` -- Content hashing
- `@xnet/sqlite` -- SQLite adapters (for SQLiteStorageAdapter)
- `idb` -- IndexedDB wrapper (deprecated, will be removed)
- `pako` -- Compression

## Testing

```bash
pnpm --filter @xnet/storage test
```
