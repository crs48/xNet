# @xnet/storage

Storage adapters and blob persistence for xNet.

## Installation

```bash
pnpm add @xnet/storage
```

## Features

- **SQLite adapter** -- Cross-platform blob storage via `@xnet/sqlite`
- **Memory adapter** -- In-memory blob storage for tests and local flows
- **Blob store** -- Content-addressed binary storage
- **Chunk manager** -- Chunk and reassemble large payloads
- **Batch writer** -- Buffered blob writes for higher throughput

## Usage

### SQLite Storage (Recommended)

```typescript
import { SQLiteStorageAdapter } from '@xnet/storage'
import { createMemorySQLiteAdapter } from '@xnet/sqlite/memory'

// Create SQLite adapter (use appropriate adapter for platform)
const sqliteDb = await createMemorySQLiteAdapter()
const storage = new SQLiteStorageAdapter(sqliteDb)

await storage.open()

// Blob operations
await storage.setBlob(cid, bytes)
const loaded = await storage.getBlob(cid)
const exists = await storage.hasBlob(cid)
```

### Platform-Specific SQLite Adapters

```typescript
// Electron (better-sqlite3)
import { createElectronSQLiteAdapter } from '@xnet/sqlite/electron'
const db = await createElectronSQLiteAdapter({ path: 'xnet.db' })

// Web (sqlite-wasm + OPFS)
import { createWebSQLiteAdapter } from '@xnet/sqlite/web'
const db = await createWebSQLiteAdapter({ path: 'xnet.db' })

// Expo (expo-sqlite)
import { createExpoSQLiteAdapter } from '@xnet/sqlite/expo'
const db = await createExpoSQLiteAdapter({ path: 'xnet.db' })
```

### Telemetry Integration

Storage adapters support optional telemetry for tracking read/write operations and performance:

```typescript
import { SQLiteStorageAdapter } from '@xnet/storage'
import { TelemetryCollector, ConsentManager } from '@xnet/telemetry'

const consent = new ConsentManager()
const telemetry = new TelemetryCollector({ consent })

const storage = new SQLiteStorageAdapter(sqliteDb, {
  telemetry // <-- Add telemetry collector
})

// Same for MemoryAdapter
const memoryStorage = new MemoryAdapter({ telemetry })
```

When telemetry is enabled, storage adapters automatically report:

- **Performance metrics**: `storage.getBlob`, `storage.setBlob`, `storage.hasBlob`
- **Usage metrics**: `storage.read`, `storage.write`
- **Crash reports**: All errors with context

All telemetry respects user consent settings and privacy buckets.

### Memory Adapter

```typescript
import { MemoryAdapter } from '@xnet/storage'

const storage = new MemoryAdapter()
await storage.open()

await storage.setBlob(cid, bytes)
const loaded = await storage.getBlob(cid)
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

## Adapters

| Adapter                | Platform | Backing store | Status      |
| ---------------------- | -------- | ------------- | ----------- |
| `SQLiteStorageAdapter` | All      | SQLite        | Recommended |
| `MemoryAdapter`        | Any      | In-memory Map | Lightweight |

## Modules

| Module                     | Description                    |
| -------------------------- | ------------------------------ |
| `adapters/sqlite.ts`       | SQLite-backed storage adapter  |
| `adapters/memory.ts`       | In-memory storage adapter      |
| `adapters/batch-writer.ts` | Buffered write utilities       |
| `blob-store.ts`            | Content-addressed blob storage |
| `chunk-manager.ts`         | Chunked large-file storage     |
| `types.ts`                 | Storage adapter interfaces     |

## Dependencies

- `@xnet/core` -- Core types
- `@xnet/crypto` -- Content hashing
- `@xnet/sqlite` -- SQLite adapters (for SQLiteStorageAdapter)

## Testing

```bash
pnpm --filter @xnet/storage test
```
