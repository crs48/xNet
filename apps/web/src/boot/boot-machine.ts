/**
 * Web boot state machine — the app-level boot state union plus the pure
 * transition helpers App.tsx and the boot hooks share. No React in here.
 */
import type { BootFailure } from '../lib/boot-diagnostics'
import type { BlobService, BlobTransferQueue, NodeStorageAdapter } from '@xnetjs/data'
import type { Identity, KeyBundle } from '@xnetjs/identity'
import type { XNetRuntimeConfig } from '@xnetjs/react'
import type { PersistentStorageStatus, SQLiteAdapter } from '@xnetjs/sqlite'
import type { BlobStore, SQLiteStorageAdapter } from '@xnetjs/storage'
import { getDefaultDataWorkerUrl } from '@xnetjs/data-bridge'
import { isWorkerRuntimeEnabled } from '../lib/data-runtime'

// Cold start can legitimately take 10–20s on a slow first load (SQLite WASM
// download + OPFS), so the watchdog waits past that before declaring a hang
// (exploration 0210). A late success still replaces the timeout screen.
export const BOOT_TIMEOUT_MS = 25_000

// ─── Types ──────────────────────────────────────────────────────
export type AppState =
  | { status: 'initializing' }
  | { status: 'unsupported'; reason: string }
  | { status: 'loading' }
  | { status: 'needs-onboarding'; storageWarning?: string; storageStatus?: PersistentStorageStatus }
  | { status: 'unlocking'; storageWarning?: string; storageStatus?: PersistentStorageStatus }
  | { status: 'storage-corrupt'; error: Error }
  | { status: 'boot-timeout'; failure: BootFailure }
  | {
      status: 'authenticated'
      identity: Identity
      keyBundle: KeyBundle
      storageWarning?: string
      storageStatus?: PersistentStorageStatus
    }
  | { status: 'error'; error: Error }

// ─── Storage Context ────────────────────────────────────────────
export interface StorageContext {
  sqliteAdapter: SQLiteAdapter
  nodeStorage: NodeStorageAdapter
  storageAdapter: SQLiteStorageAdapter
  blobStore: BlobStore
  blobService: BlobService
  /** Moves attachment bytes to/from the hub (exploration 0385 W3) */
  blobTransfers: BlobTransferQueue
  /** SQLite worker port for the data worker (worker runtime flag only) */
  dataWorkerStoragePort?: MessagePort
}

export function resolveWebRuntime(storage: StorageContext): XNetRuntimeConfig {
  if (isWorkerRuntimeEnabled()) {
    return {
      mode: 'worker',
      fallback: 'main-thread',
      diagnostics: import.meta.env.DEV,
      worker: {
        url: getDefaultDataWorkerUrl(),
        storagePort: storage.dataWorkerStoragePort
      }
    }
  }
  return {
    mode: 'main-thread',
    fallback: 'main-thread',
    diagnostics: import.meta.env.DEV
  }
}

export function updateAppStorageStatus(
  current: AppState,
  storageStatus: PersistentStorageStatus
): AppState {
  switch (current.status) {
    case 'needs-onboarding':
    case 'unlocking':
    case 'authenticated':
      return { ...current, storageStatus }
    default:
      return current
  }
}
