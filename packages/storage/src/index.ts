/**
 * @xnet/storage - IndexedDB/SQLite adapters, snapshots, and persistence
 */

// Types
export type { StorageAdapter, DocumentData, DocumentMetadata, StorageStats } from './types'

// Adapters
export { IndexedDBAdapter } from './adapters/indexeddb'
export { IndexedDBBatchAdapter, createIndexedDBBatchAdapter } from './adapters/indexeddb-batch'
export { MemoryAdapter } from './adapters/memory'
// export { SQLiteAdapter } from './adapters/sqlite' // Native only

// Batch utilities
export { BatchWriter, createBatchWriter } from './adapters/batch-writer'

// Blob storage
export { BlobStore } from './blob-store'
export { ChunkManager, CHUNK_SIZE, CHUNK_THRESHOLD } from './chunk-manager'
export type { ChunkManifest, StoreResult } from './chunk-manager'

// Snapshot management
export { SnapshotManager, type SnapshotManagerOptions } from './snapshots/manager'
