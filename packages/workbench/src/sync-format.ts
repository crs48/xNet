/**
 * Pure decision + formatting helpers for the status bar's sync cluster
 * (exploration 0233). Kept free of React so the chip-state mapping, integrity
 * gate, and relative-time formatting are unit-testable in isolation.
 */
import type { SyncManagerStatus } from '@xnetjs/react'

/** Coarse state driving the connection chip's dot tone + label. */
export type SyncCoarseState = 'offline' | 'connecting' | 'syncing' | 'error' | 'synced'

/**
 * Collapse hub status + offline flag + lifecycle phase + queue depth into the
 * single coarse state the connection chip renders. `connected` is only
 * `synced` when the lifecycle is settled and nothing is queued.
 */
export function coarseSyncState(
  hub: SyncManagerStatus,
  offline: boolean,
  phase: string,
  queueSize: number
): SyncCoarseState {
  if (offline) return 'offline'
  if (hub === 'error') return 'error'
  if (hub === 'connecting') return 'connecting'
  if (hub === 'disconnected') return 'offline'
  // hub === 'connected'
  if (phase === 'replaying' || queueSize > 0) return 'syncing'
  return 'synced'
}

/**
 * A verification failure is an unresolved integrity alert until a later
 * reconciliation supersedes it. Returns false when there's no failure, or when
 * a reconciliation happened at/after the failure.
 */
export function isIntegrityAlert(
  failure: { at: number } | null,
  reconciliation: { at: number } | null
): boolean {
  if (!failure) return false
  return reconciliation == null || reconciliation.at < failure.at
}

/** Compact relative time ("12s ago", "3m ago", "2h ago"). `now` is injectable. */
export function relativeTime(ts: number | null, now = Date.now()): string {
  if (!ts) return '—'
  const seconds = Math.max(0, Math.round((now - ts) / 1000))
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  return `${hours}h ago`
}
