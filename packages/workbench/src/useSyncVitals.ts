/**
 * useSyncVitals — one reactive view of "are my changes safe?" (exploration
 * 0233). Folds the hub status, the browser online flag, and the SyncManager's
 * readonly props + lifecycle/verification/reconciliation events into a single
 * object the status bar's connection chip and conditional chips read from.
 *
 * The connection dot used to answer only "is the hub connected?" — but
 * `connected` can coexist with a non-empty offline queue, a degraded
 * lifecycle, or a recent hash-verification failure. This aggregator surfaces
 * those so the bar can stay calm when healthy and speak up when not.
 */
import { useHubStatus, useIsOffline, useSyncManager, type SyncManagerStatus } from '@xnetjs/react'
import { useEffect, useState } from 'react'
import { coarseSyncState, isIntegrityAlert, type SyncCoarseState } from './sync-format'

export interface SyncVitals {
  /** Coarse chip state (dot tone + label). */
  state: SyncCoarseState
  /** Raw hub connection status. */
  hub: SyncManagerStatus
  /** Browser `navigator.onLine` is false. */
  offline: boolean
  /** Background-sync lifecycle phase (idle…healthy…degraded…replaying). */
  lifecyclePhase: string
  /** Wall-clock of the last lifecycle transition (ms), or null. */
  lastTransitionAt: number | null
  /** Unsent local changes queued while offline. */
  queueSize: number
  /** Nodes tracked for background sync. */
  trackedCount: number
  /** Warm/active Y.Docs held in the pool. */
  poolSize: number
  /** Last rejected replication payload (signature/hash failure), if any. */
  verificationFailure: { nodeId: string; sender: string | null; reason: string; at: number } | null
  /**
   * A verification failure is unresolved — surfaced and not yet superseded by a
   * later reconciliation. Drives the tier-B integrity chip.
   */
  integrityAlert: boolean
  /** Whether a SyncManager is wired at all (false → local-only, no hub). */
  hasSyncManager: boolean
}

/**
 * Reactive snapshot of sync health. Re-renders on lifecycle/status/verification/
 * reconciliation events for instant transitions, plus a slow poll so the
 * offline-queue count (which can change with no lifecycle event) stays fresh.
 */
export function useSyncVitals(): SyncVitals {
  const hub = useHubStatus()
  const offline = useIsOffline()
  const syncManager = useSyncManager()
  const [, force] = useState(0)

  useEffect(() => {
    if (!syncManager) return
    const bump = () => force((n) => n + 1)
    const offs = [
      syncManager.on('lifecycle', bump),
      syncManager.on('status', bump),
      syncManager.on('verification-failure', bump),
      syncManager.on('reconciliation', bump)
    ]
    // The offline queue grows on local edits with no lifecycle event; a slow
    // poll keeps `⇡ N pending` honest without re-rendering on every keystroke.
    const interval = setInterval(bump, 3000)
    return () => {
      for (const off of offs) off?.()
      clearInterval(interval)
    }
  }, [syncManager])

  const lifecycle = syncManager?.lifecycle ?? null
  const phase = lifecycle?.phase ?? 'idle'
  const queueSize = syncManager?.queueSize ?? 0
  const failure = syncManager?.lastVerificationFailure ?? null
  const recon = syncManager?.lastReconciliationReport ?? null

  return {
    state: coarseSyncState(hub, offline, phase, queueSize),
    hub,
    offline,
    lifecyclePhase: phase,
    lastTransitionAt: lifecycle?.lastTransitionAt ?? null,
    queueSize,
    trackedCount: syncManager?.trackedCount ?? 0,
    poolSize: syncManager?.poolSize ?? 0,
    verificationFailure: failure,
    // A reconciliation after the failure clears the alert (Retry runs reconcile).
    integrityAlert: isIntegrityAlert(failure, recon),
    hasSyncManager: syncManager != null
  }
}
