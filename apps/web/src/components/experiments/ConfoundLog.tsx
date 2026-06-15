/**
 * Confound log (exploration 0180, phase 5) — tag the days inside an experiment
 * window where something happened that could confound the result (alcohol, poor
 * sleep, travel…). The verdict engine reads these and warns when a result
 * window overlaps logged confounds, which keeps the user honest.
 */
import type { JSX } from 'react'
import { ObservationSchema } from '@xnetjs/data'
import { dayToIso } from '@xnetjs/experiments'
import { useMutate } from '@xnetjs/react'
import { parsePhases, phaseForDay, type PhaseDef } from './phase-logic'

interface ObsRow {
  id: string
  day?: unknown
  value?: unknown
  confounds?: unknown
}

function confoundsText(value: unknown): string {
  return Array.isArray(value) ? value.filter((c) => typeof c === 'string').join(', ') : ''
}

function parseConfounds(text: string): string[] {
  return text
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

export function ConfoundLog({
  observations,
  phasesRaw
}: {
  observations: ObsRow[]
  phasesRaw: unknown
}): JSX.Element | null {
  const { update } = useMutate()
  const phases: PhaseDef[] = parsePhases(phasesRaw)
  if (phases.length === 0) return null

  // Only days that fall inside a phase — that's the window the verdict cares about.
  const rows = observations
    .filter((o) => typeof o.day === 'number' && phaseForDay(o.day as number, phases) !== 'none')
    .sort((a, b) => (b.day as number) - (a.day as number))
    .slice(0, 30)

  if (rows.length === 0) return null

  return (
    <div>
      <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-ink-3">
        Confound log
      </div>
      <div className="overflow-hidden rounded-lg border border-hairline">
        {rows.map((obs, i) => (
          <div
            key={obs.id}
            className={`flex items-center gap-2 px-2.5 py-1.5 text-xs ${i > 0 ? 'border-t border-hairline' : ''}`}
          >
            <span className="w-20 shrink-0 tabular-nums text-ink-3">
              {dayToIso(obs.day as number)}
            </span>
            <span className="w-10 shrink-0 tabular-nums text-ink-2">
              {typeof obs.value === 'number' ? obs.value : '—'}
            </span>
            <input
              defaultValue={confoundsText(obs.confounds)}
              onBlur={(e) => {
                const next = parseConfounds(e.target.value)
                if (confoundsText(obs.confounds) !== next.join(', ')) {
                  void update(ObservationSchema, obs.id, { confounds: next })
                }
              }}
              placeholder="confounds, comma-separated…"
              className="min-w-0 flex-1 bg-transparent text-ink-1 outline-none placeholder:text-ink-3"
            />
          </div>
        ))}
      </div>
    </div>
  )
}
