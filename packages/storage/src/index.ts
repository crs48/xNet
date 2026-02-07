/**
 * @xnet/storage - SQLite adapters, snapshots, and persistence
 */

// Types
export type { StorageAdapter, DocumentData, DocumentMetadata, StorageStats } from './types'

// Adapters
export { MemoryAdapter } from './adapters/memory'
export { SQLiteStorageAdapter, createStorageAdapterFromSQLite } from './adapters/sqlite'

// Batch utilities
export { BatchWriter, createBatchWriter } from './adapters/batch-writer'

// Blob storage
export { BlobStore } from './blob-store'
export { ChunkManager, CHUNK_SIZE, CHUNK_THRESHOLD } from './chunk-manager'
export type { ChunkManifest, StoreResult } from './chunk-manager'

// Snapshot management
export { SnapshotManager, type SnapshotManagerOptions } from './snapshots/manager'
