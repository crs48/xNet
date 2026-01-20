/**
 * @xnet/records - Sync module for event-sourced records
 */

// Types
export type {
  RecordOperation,
  RecordOperationType,
  CreateItemOperation,
  UpdateItemOperation,
  DeleteItemOperation,
  RestoreItemOperation,
  AddPropertyOperation,
  UpdatePropertyOperation,
  DeletePropertyOperation,
  AddViewOperation,
  UpdateViewOperation,
  DeleteViewOperation,
  UpdateDatabaseOperation,
  ItemState,
  DatabaseState,
  TimestampedValue,
  SyncRequest,
  SyncResponse,
  OperationPush,
  OperationAck,
  SyncMessage,
  ApplyResult,
  Conflict
} from './types'

// Store
export { RecordStore, RECORD_SCHEMA_SQL } from './store'
export type { RecordStorageAdapter, OperationOptions } from './store'

// Adapters
export { MemoryRecordAdapter } from './memory-adapter'
