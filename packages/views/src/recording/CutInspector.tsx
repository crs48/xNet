/**
 * CutInspector — every cut, listed, with a one-click restore (exploration
 * 0414).
 *
 * This component exists because of a specific hazard: an auto-editor that
 * misclassifies a quiet aside as silence has removed content the user cannot
 * know is missing. The defence is not a better classifier — it is showing the
 * work. Every cut appears with its reason and duration, the total is stated in
 * plain words, and any cut is one click from coming back.
 */

import type { Cut } from '@xnetjs/data'
import { restoreAll, summarizeCuts, toggleCut } from '@xnetjs/recordings'
import { RotateCcw, Scissors } from 'lucide-react'
import { useMemo, type JSX } from 'react'

export interface CutInspectorProps {
  cuts: Cut[]
  onChange: (cuts: Cut[]) => void
  /** Jump the player to a cut's start so the user can hear what went. */
  onPreview?: (sourceMs: number) => void
  className?: string
}

const REASON_LABEL: Record<Cut['reason'], string> = {
  silence: 'Dead air',
  filler: 'Filler word',
  manual: 'Your edit'
}

const seconds = (ms: number): string => `${(ms / 1_000).toFixed(1)}s`

/** "47 seconds across 23 cuts" — never remove time without saying how much. */
export function describeCuts(cuts: Cut[]): string {
  const summary = summarizeCuts(cuts)
  if (summary.count === 0) return 'No cuts — this plays in full.'
  const parts = Object.entries(summary.byReason)
    .map(([reason, stats]) => `${stats.count} ${REASON_LABEL[reason as Cut['reason']] ?? reason}`)
    .join(', ')
  return `Removing ${seconds(summary.removedMs)} across ${summary.count} cut${summary.count === 1 ? '' : 's'} (${parts}).`
}

export function CutInspector({
  cuts,
  onChange,
  onPreview,
  className
}: CutInspectorProps): JSX.Element {
  const summary = useMemo(() => describeCuts(cuts), [cuts])
  const anyEnabled = cuts.some((cut) => cut.enabled)

  return (
    <div className={className}>
      <div className="flex items-center justify-between gap-2 border-b pb-2">
        <p className="text-sm text-muted-foreground">{summary}</p>
        {anyEnabled ? (
          <button
            type="button"
            onClick={() => onChange(restoreAll(cuts))}
            className="flex shrink-0 items-center gap-1 rounded px-2 py-1 text-xs hover:bg-muted"
          >
            <RotateCcw className="h-3 w-3" />
            Restore all
          </button>
        ) : null}
      </div>

      {cuts.length === 0 ? (
        <p className="py-4 text-sm text-muted-foreground">
          Nothing has been cut. Run auto-edit, or select a span in the transcript.
        </p>
      ) : (
        <ul className="divide-y">
          {cuts.map((cut, index) => (
            <li
              key={`${cut.startMs}-${cut.endMs}-${cut.reason}`}
              className="flex items-center gap-2 py-2 text-sm"
            >
              <input
                type="checkbox"
                checked={cut.enabled}
                onChange={() => onChange(toggleCut(cuts, index))}
                aria-label={`${cut.enabled ? 'Restore' : 'Cut'} ${REASON_LABEL[cut.reason]} at ${seconds(cut.startMs)}`}
              />
              <Scissors
                className={`h-3 w-3 shrink-0 ${cut.enabled ? 'text-foreground' : 'text-muted-foreground/40'}`}
              />
              <button
                type="button"
                onClick={() => onPreview?.(cut.startMs)}
                className="flex-1 text-left hover:underline"
              >
                <span className={cut.enabled ? '' : 'text-muted-foreground line-through'}>
                  {REASON_LABEL[cut.reason]}
                </span>
                <span className="ml-2 tabular-nums text-xs text-muted-foreground">
                  {seconds(cut.startMs)} → {seconds(cut.endMs)} ({seconds(cut.endMs - cut.startMs)})
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
