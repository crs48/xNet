/**
 * @xnet/storage - IndexedDB/SQLite adapters, snapshots, and persistence
 */

// Types
export type { StorageAdapter, DocumentData, DocumentMetadata, StorageStats } from './types'

// Adapters
export { IndexedDBAdapter } from './adapters/indexeddb'
export { MemoryAdapter } from './adapters/memory'
// export { SQLiteAdapter } from './adapters/sqlite' // Native only

// Snapshot management
export { SnapshotManager, type SnapshotManagerOptions } from './snapshots/manager'
