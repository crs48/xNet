/**
 * PersonActions (exploration 0176) — the shared per-person overflow menu.
 *
 * One menu, used on PersonView, PersonHovercard, MatchCard, and chat. Offers a
 * Wave (0174) plus the safety tiers (Restrict / Mute / Block / Report). Block and
 * mute are personal and silent; report writes a synced AbuseReport.
 */
import { Popover } from '@xnetjs/ui'
import { MoreHorizontal } from 'lucide-react'
import { useState, type ReactElement } from 'react'
import { useWave } from '../hooks/useConnect'
import { useSafetyActions } from '../hooks/useSafetyActions'
import { ReportDialog } from './ReportDialog'

function Item({
  label,
  onClick,
  danger
}: {
  label: string
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent/50 ${
        danger ? 'text-red-500' : 'text-foreground'
      }`}
    >
      {label}
    </button>
  )
}

export interface PersonActionsProps {
  did: string
  label?: string
  /** Hide the Wave action (e.g. when viewing your own profile). */
  hideWave?: boolean
}

export function PersonActions({ did, label, hideWave }: PersonActionsProps) {
  const { wave } = useWave()
  const safety = useSafetyActions(did)
  const [reportOpen, setReportOpen] = useState(false)
  const blocked = safety.state === 'blocked'
  const subject = label ?? `${did.slice(0, 16)}…`

  const trigger: ReactElement = (
    <button
      type="button"
      aria-label="More actions"
      className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-accent/50"
    >
      <MoreHorizontal size={14} />
    </button>
  )

  return (
    <>
      <Popover trigger={trigger} side="bottom" align="end">
        <div className="flex w-40 flex-col gap-0.5">
          {!hideWave && !blocked && (
            <>
              <Item label="Wave 👋" onClick={() => void wave(did, 'friends')} />
              <div className="my-0.5 h-px bg-border" />
            </>
          )}
          {safety.state === null && (
            <>
              <Item label="Restrict" onClick={safety.restrict} />
              <Item label="Mute" onClick={safety.mute} />
              <Item label="Block" onClick={safety.block} danger />
            </>
          )}
          {safety.state !== null && (
            <Item
              label={
                safety.state === 'blocked'
                  ? 'Unblock'
                  : safety.state === 'muted'
                    ? 'Unmute'
                    : 'Remove restriction'
              }
              onClick={safety.unblock}
            />
          )}
          <Item label="Report…" onClick={() => setReportOpen(true)} danger />
        </div>
      </Popover>
      {reportOpen && (
        <ReportDialog
          subjectLabel={subject}
          onSubmit={(input) => safety.report(input)}
          onClose={() => setReportOpen(false)}
        />
      )}
    </>
  )
}
