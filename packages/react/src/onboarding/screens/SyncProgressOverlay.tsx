/**
 * Sync progress overlay — shown during initial sync on a new device.
 */
import type { SyncProgress } from '../../sync/InitialSyncManager'
import { useEffect } from 'react'

export interface SyncProgressOverlayProps {
  progress: SyncProgress
  onComplete: () => void
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function SyncProgressOverlay({
  progress,
  onComplete
}: SyncProgressOverlayProps): JSX.Element {
  useEffect(() => {
    if (progress.phase === 'complete') {
      const timer = setTimeout(onComplete, 1500)
      return () => clearTimeout(timer)
    }
  }, [progress.phase, onComplete])

  return (
    <div className="sync-progress-overlay">
      <div className="sync-card">
        {progress.phase === 'connecting' && (
          <>
            <h2>Connecting to server...</h2>
            <p className="spinner-text">Please wait</p>
          </>
        )}

        {progress.phase === 'syncing' && (
          <>
            <h2>Syncing your data</h2>
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{
                  width: `${(progress.roomsSynced / Math.max(progress.roomsTotal, 1)) * 100}%`
                }}
              />
            </div>
            <p className="progress-text">
              {progress.roomsSynced} of {progress.roomsTotal} items
            </p>
            <p className="bytes-text">{formatBytes(progress.bytesReceived)} received</p>
          </>
        )}

        {progress.phase === 'complete' && (
          <>
            <h2>All synced!</h2>
            <p>{progress.roomsTotal} items synchronized</p>
          </>
        )}

        {progress.phase === 'error' && (
          <>
            <h2>Sync issue</h2>
            <p>Some data may not be up to date.</p>
            {progress.error && <p className="error-detail">{progress.error.message}</p>}
            <button className="primary-button" onClick={onComplete}>
              Continue anyway
            </button>
          </>
        )}
      </div>
    </div>
  )
}
