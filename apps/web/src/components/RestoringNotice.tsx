/**
 * Shown when the local cache looked evicted at boot and the hub is still
 * reconnecting — we expect data, it's just re-syncing. Beats a misleading
 * "No documents yet" empty state or a blank screen (exploration 0204).
 */
import type { ReactElement } from 'react'

export function RestoringNotice(): ReactElement {
  return (
    <div className="flex items-center justify-center gap-3 py-12 text-muted-foreground">
      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary" />
      <span>Restoring your workspace from the hub…</span>
    </div>
  )
}
