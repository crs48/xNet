/**
 * @xnet/react/sync - Initial sync manager for new device onboarding
 *
 * Orchestrates the full state sync when a new device connects to the hub
 * with an existing identity. Tracks progress and provides callbacks.
 */

// ─── Types ───────────────────────────────────────────────────

export type SyncPhase = 'connecting' | 'syncing' | 'complete' | 'error'

export type SyncProgress = {
  /** Current phase of the sync process */
  phase: SyncPhase

  /** Total rooms discovered on the hub */
  roomsTotal: number

  /** Rooms that have been fully synced */
  roomsSynced: number

  /** Total bytes received from hub */
  bytesReceived: number

  /** Error if phase === 'error' */
  error?: Error
}

export type InitialSyncMessage = {
  type: 'initial-sync' | 'node-changes' | 'initial-sync-complete'
  room?: string
  update?: Uint8Array
  changes?: unknown[]
  roomCount?: number
}

export type ProgressListener = (progress: SyncProgress) => void

// ─── Manager ─────────────────────────────────────────────────

/**
 * Manages the initial sync process for a new device.
 *
 * Usage:
 * ```ts
 * const manager = createInitialSyncManager()
 * const unsub = manager.onProgress((p) => updateUI(p))
 *
 * // Feed messages from the hub WebSocket:
 * manager.handleMessage({ type: 'initial-sync', room: 'r1', update: ... })
 * manager.handleMessage({ type: 'initial-sync-complete', roomCount: 5 })
 *
 * unsub()
 * ```
 */
export type InitialSyncManager = {
  /** Subscribe to progress updates */
  onProgress(listener: ProgressListener): () => void

  /** Handle an incoming sync message from the hub */
  handleMessage(msg: InitialSyncMessage): void

  /** Get current progress snapshot */
  getProgress(): SyncProgress

  /** Mark sync as started (connecting phase) */
  start(): void

  /** Mark sync as errored */
  setError(error: Error): void

  /** Reset to initial state */
  reset(): void
}

export function createInitialSyncManager(): InitialSyncManager {
  let progress: SyncProgress = {
    phase: 'connecting',
    roomsTotal: 0,
    roomsSynced: 0,
    bytesReceived: 0
  }

  const listeners = new Set<ProgressListener>()
  // Track unique rooms synced by ID to avoid double-counting
  let syncedRoomIds = new Set<string>()

  function notify(): void {
    const snapshot = { ...progress }
    for (const listener of listeners) {
      listener(snapshot)
    }
  }

  return {
    onProgress(listener: ProgressListener): () => void {
      listeners.add(listener)
      // Immediately send current state
      listener({ ...progress })
      return () => {
        listeners.delete(listener)
      }
    },

    handleMessage(msg: InitialSyncMessage): void {
      switch (msg.type) {
        case 'initial-sync':
          progress.phase = 'syncing'
          if (msg.update) {
            progress.bytesReceived += msg.update.byteLength
          }
          // Track rooms by ID to count unique rooms, not messages
          if (msg.room) {
            syncedRoomIds.add(msg.room)
            progress.roomsSynced = syncedRoomIds.size
          }
          // Set roomsTotal from roomCount if available during sync
          if (msg.roomCount != null) {
            progress.roomsTotal = msg.roomCount
          }
          notify()
          break

        case 'node-changes':
          if (msg.changes) {
            // Approximate size
            progress.bytesReceived += JSON.stringify(msg.changes).length
          }
          notify()
          break

        case 'initial-sync-complete':
          progress.phase = 'complete'
          progress.roomsTotal = msg.roomCount ?? syncedRoomIds.size
          progress.roomsSynced = syncedRoomIds.size
          notify()
          break
      }
    },

    getProgress(): SyncProgress {
      return { ...progress }
    },

    start(): void {
      syncedRoomIds = new Set<string>()
      progress = {
        phase: 'connecting',
        roomsTotal: 0,
        roomsSynced: 0,
        bytesReceived: 0
      }
      notify()
    },

    setError(error: Error): void {
      progress.phase = 'error'
      progress.error = error
      notify()
    },

    reset(): void {
      syncedRoomIds = new Set<string>()
      progress = {
        phase: 'connecting',
        roomsTotal: 0,
        roomsSynced: 0,
        bytesReceived: 0
      }
      listeners.clear()
    }
  }
}
