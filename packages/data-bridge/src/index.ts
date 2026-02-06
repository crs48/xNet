/**
 * @xnet/data-bridge - DataBridge abstraction for off-main-thread data access
 *
 * This package provides the DataBridge interface and implementations for
 * accessing NodeStore data. The abstraction allows moving storage, sync,
 * and crypto off the main thread while keeping the React API unchanged.
 *
 * Phase 0: MainThreadBridge (direct NodeStore access)
 * Phase 1: WorkerBridge (Web Worker via Comlink) - future
 * Phase 2: IPCBridge (Electron utility process) - future
 * Phase 5: NativeBridge (React Native Turbo Module) - future
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export type {
  DataBridge,
  QuerySubscription,
  QueryOptions,
  SortDirection,
  SystemOrderField,
  CreateResult,
  UpdateResult,
  AcquiredDoc,
  SyncStatus,
  DataBridgeConfig
} from './types'

// ─── Implementations ─────────────────────────────────────────────────────────

export { MainThreadBridge, createMainThreadBridge } from './main-thread-bridge'

// ─── Utilities ───────────────────────────────────────────────────────────────

export { QueryCache } from './query-cache'
