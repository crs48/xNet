# @xnet/storage

Storage adapters, blob management, and snapshot persistence for xNet.

## Installation

```bash
pnpm add @xnet/storage
```

## Features

- **IndexedDB adapter** -- Browser-native persistent storage via `idb`
- **Memory adapter** -- In-memory storage for testing
- **Blob store** -- Large binary object storage with content addressing
- **Chunk manager** -- Chunked blob storage for large files (streaming upload/download)
- **Snapshot manager** -- Point-in-time state snapshots with compression (pako)

## Usage

```typescript
import { IndexedDBAdapter, MemoryAdapter } from '@xnet/storage'

// Browser storage
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

| Adapter            | Platform | Backing store |
| ------------------ | -------- | ------------- |
| `IndexedDBAdapter` | Browser  | IndexedDB     |
| `MemoryAdapter`    | Any      | In-memory Map |

## Modules

| Module                  | Description                    |
| ----------------------- | ------------------------------ |
| `adapters/indexeddb.ts` | IndexedDB storage adapter      |
| `adapters/memory.ts`    | In-memory storage adapter      |
| `blob-store.ts`         | Content-addressed blob storage |
| `chunk-manager.ts`      | Chunked large file storage     |
| `snapshots/manager.ts`  | Compressed snapshot management |
| `types.ts`              | StorageAdapter interface       |

## Dependencies

- `@xnet/core` -- Core types
- `@xnet/crypto` -- Content hashing
- `idb` -- IndexedDB wrapper
- `pako` -- Compression

## Testing

```bash
pnpm --filter @xnet/storage test
```
