/**
 * Verdict panel (exploration 0180) — the honest answer to "did it work?".
 *
 * Partitions the primary metric's observations into baseline vs intervention
 * by the experiment's phase dates, runs the verdict engine, and renders the
 * result framed against the null hypothesis with every caveat surfaced. Refuses
 * to over-claim: an under-powered or caveat-heavy experiment reads as
 * inconclusive, never "proven".
 */
import { describeCaveat, evaluate, type Polarity } from '@xnetjs/experiments'
import { cn } from '@xnetjs/ui'
import { AlertTriangle, Minus, TrendingDown, TrendingUp } from 'lucide-react'
import { useMemo, type JSX } from 'react'
import {
  confoundDaysInWindow,
  parsePhases,
  partitionByPhase,
  type PhasedObservation
} from './phase-logic'

export interface VerdictPanelProps {
  phasesRaw: unknown
  polarity?: Polarity
  /** Primary-outcome observations (already filtered to the primary metric). */
  observations: PhasedObservation[]
  /** True for unblinded self-report outcomes (mood/energy scales). */
  selfReport?: boolean
  /** Secondary metrics being examined (multiplicity warning). */
  metricsExamined?: number
}

function Stat({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wider text-ink-3">{label}</span>
      <span className="text-sm tabular-nums text-ink-1">{value}</span>
    </div>
  )
}

const DIRECTION_STYLE: Record<string, { label: string; cls: string }> = {
  rejectsNull: {
    label: 'Evidence against the null',
    cls: 'bg-green-500/10 text-green-600 border-green-500/30'
  },
  failsToRejectNull: {
    label: 'Fails to reject the null',
    cls: 'bg-ink-1/5 text-ink-2 border-hairline'
  },
  inconclusive: {
    label: 'Inconclusive',
    cls: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/30'
  }
}

export function VerdictPanel({
  phasesRaw,
  polarity,
  observations,
  selfReport,
  metricsExamined
}: VerdictPanelProps): JSX.Element {
  const verdict = useMemo(() => {
    const phases = parsePhases(phasesRaw)
    const { baseline, intervention } = partitionByPhase(observations, phases)
    return evaluate({
      baseline,
      intervention,
      polarity,
      selfReport,
      metricsExamined,
      confoundDays: confoundDaysInWindow(observations, phases)
    })
  }, [phasesRaw, observations, polarity, selfReport, metricsExamined])

  const style = DIRECTION_STYLE[verdict.direction]
  const TrendIcon =
    verdict.meanIntervention === verdict.meanBaseline
      ? Minus
      : verdict.meanIntervention > verdict.meanBaseline
        ? TrendingUp
        : TrendingDown

  return (
    <div className="rounded-lg border border-hairline p-3">
      <div className="mb-2 flex items-center gap-2">
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium',
            style.cls
          )}
        >
          <TrendIcon size={12} strokeWidth={2} />
          {style.label}
        </span>
        <span className="text-[10px] text-ink-3">
          n = {verdict.nBaseline} baseline · {verdict.nIntervention} intervention
        </span>
      </div>

      <p className="mb-3 text-xs leading-relaxed text-ink-2">{verdict.summary}</p>

      <div className="grid grid-cols-4 gap-3">
        <Stat
          label="Baseline → Int."
          value={`${verdict.meanBaseline.toFixed(1)} → ${verdict.meanIntervention.toFixed(1)}`}
        />
        <Stat label="Cohen's d" value={verdict.cohensD.toFixed(2)} />
        <Stat label="Tau-U" value={verdict.tauU.toFixed(2)} />
        <Stat
          label="95% CI (Δ)"
          value={`${verdict.credibleInterval[0].toFixed(1)}…${verdict.credibleInterval[1].toFixed(1)}`}
        />
      </div>

      {verdict.caveats.length > 0 && (
        <ul className="mt-3 flex list-none flex-col gap-1.5 p-0">
          {verdict.caveats.map((caveat, i) => (
            <li key={i} className="flex items-start gap-1.5 text-[11px] leading-snug text-ink-3">
              <AlertTriangle
                size={12}
                strokeWidth={2}
                className="mt-0.5 shrink-0 text-yellow-500"
              />
              {describeCaveat(caveat)}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
