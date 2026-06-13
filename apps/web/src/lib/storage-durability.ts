/**
 * Durability transition log + status bus (exploration 0172).
 *
 * Every durable-storage state transition is recorded with the lever that
 * triggered it (startup auto-request, banner button, install, notification
 * opt-in, permission change) so denied grants can be diagnosed after the
 * fact — browsers decide persist() silently, and the log is the only
 * record of which signal finally flipped an origin to granted.
 *
 * The bus half lets surfaces deep in the workbench tree (the notification
 * opt-in) hand a fresh PersistentStorageStatus back to App.tsx, which owns
 * the banner state, without threading callbacks through the router.
 */
import type { PersistentStorageStatus } from '@xnetjs/sqlite'

export type DurabilityLever =
  | 'startup'
  | 'banner'
  | 'install'
  | 'notifications'
  | 'permission-change'

export interface DurabilityLogEntry {
  at: number
  lever: DurabilityLever
  state: PersistentStorageStatus['state']
  persisted: boolean | null
  granted: boolean | null
}

const STORAGE_STATUS_EVENT = 'xnet:storage-status'
const LOG_LIMIT = 50

type StorageStatusEventDetail = { status: PersistentStorageStatus }

function durabilityLogKey(): string {
  // Preview deploys share production's origin; scope-aware stores suffix
  // their keys (see lib/storage-scope.ts).
  const scope = (globalThis as { __XNET_STORAGE_SCOPE__?: string }).__XNET_STORAGE_SCOPE__
  return scope ? `xnet:durability-log:${scope}` : 'xnet:durability-log'
}

export function readDurabilityLog(): DurabilityLogEntry[] {
  try {
    const raw = localStorage.getItem(durabilityLogKey())
    const parsed = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(parsed) ? (parsed as DurabilityLogEntry[]) : []
  } catch {
    return []
  }
}

/**
 * Append a transition to the log. Repeated identical states from the same
 * lever are skipped so startup retries don't fill the buffer.
 */
export function recordDurabilityTransition(
  lever: DurabilityLever,
  status: PersistentStorageStatus
): void {
  try {
    const log = readDurabilityLog()
    const last = log[log.length - 1]
    if (
      last &&
      last.lever === lever &&
      last.state === status.state &&
      last.persisted === status.persisted &&
      last.granted === status.granted
    ) {
      return
    }

    log.push({
      at: Date.now(),
      lever,
      state: status.state,
      persisted: status.persisted,
      granted: status.granted
    })
    localStorage.setItem(durabilityLogKey(), JSON.stringify(log.slice(-LOG_LIMIT)))
  } catch {
    // Logging must never break the storage flow itself.
  }
}

/**
 * Record a transition and notify subscribers (App.tsx) so the banner
 * reflects a status produced outside its own handlers.
 */
export function publishStorageStatus(
  lever: DurabilityLever,
  status: PersistentStorageStatus
): void {
  recordDurabilityTransition(lever, status)
  window.dispatchEvent(
    new CustomEvent<StorageStatusEventDetail>(STORAGE_STATUS_EVENT, { detail: { status } })
  )
}

export function subscribeStorageStatus(
  onStatus: (status: PersistentStorageStatus) => void
): () => void {
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<StorageStatusEventDetail>).detail
    if (detail?.status) onStatus(detail.status)
  }
  window.addEventListener(STORAGE_STATUS_EVENT, listener)
  return () => window.removeEventListener(STORAGE_STATUS_EVENT, listener)
}
