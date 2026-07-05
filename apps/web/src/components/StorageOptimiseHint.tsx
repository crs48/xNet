/**
 * Subtle "Optimising storage" pill shown while the one-time conversion VACUUM
 * (lib/db-vacuum.ts) is in flight on a profile whose earlier attempt was
 * interrupted (exploration 0260 follow-up). VACUUM is atomic — a reload
 * mid-run rolls it back with zero progress — and on a bloated profile it takes
 * minutes, so users who reload to escape the slowness cancel the very fix.
 * Non-blocking by design: it only asks the user to keep the tab open.
 */
import { Presence } from '@xnetjs/ui'
import { useEffect, useState, type JSX } from 'react'
import { isVacuumHintActive, subscribeVacuumActivity } from '../lib/db-vacuum'

export function StorageOptimiseHint(): JSX.Element {
  const [active, setActive] = useState(() => isVacuumHintActive())
  useEffect(() => subscribeVacuumActivity(setActive), [])

  return (
    <Presence
      show={active}
      motion="slide-up"
      wrapperProps={{ role: 'status', 'aria-live': 'polite' }}
      // bottom-20 clears the compact-shell bottom nav (~58px), the UndoToast
      // (bottom-4, centred), and the dev-build devtools launcher (bottom-right).
      className="fixed bottom-20 right-4 z-50 w-fit"
    >
      <div className="flex items-center gap-2.5 rounded-lg border border-border bg-background px-3.5 py-2 text-xs text-muted-foreground shadow-lg">
        <div className="h-3 w-3 shrink-0 animate-spin rounded-full border-b-2 border-primary" />
        <span>Optimising storage — keep this tab open a few minutes</span>
      </div>
    </Presence>
  )
}
