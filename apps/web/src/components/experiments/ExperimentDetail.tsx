/**
 * Experiment detail (exploration 0180) — the protocol journal + rigor
 * scaffolding for one experiment. Structured fields (null/alt hypotheses,
 * design, phases, primary metric) bind to the Experiment node; the narrative
 * lives in its collaborative Yjs document; the verdict panel reads the primary
 * metric's observations and frames the result against the null.
 */
import { HabitHeatmap } from '@xnetjs/dashboard'
import { ExperimentSchema, MetricSchema, ObservationSchema } from '@xnetjs/data'
import { dayToIso, isoToDay } from '@xnetjs/experiments'
import { useIdentity, useNode, useQuery } from '@xnetjs/react'
import { Plus, Trash2 } from 'lucide-react'
import { useCallback, useMemo, type JSX } from 'react'
import { Editor } from '../Editor'
import { ConfoundLog } from './ConfoundLog'
import { metricName, type MetricLike, type ObservationLike } from './habit-logic'
import { parsePhases, type PhaseDef, type PhaseKind } from './phase-logic'
import { VerdictPanel } from './VerdictPanel'

const STATUS_OPTIONS = [
  ['design', 'Design'],
  ['baseline', 'Baseline'],
  ['intervention', 'Intervention'],
  ['washout', 'Washout'],
  ['analysis', 'Analysis'],
  ['concluded', 'Concluded'],
  ['abandoned', 'Abandoned']
] as const

const DESIGN_OPTIONS = [
  ['observational', 'Observational'],
  ['AB', 'AB (baseline → intervention)'],
  ['ABAB', 'ABAB (reversal)'],
  ['multipleBaseline', 'Multiple baseline'],
  ['crossover', 'Crossover'],
  ['alternating', 'Alternating treatments']
] as const

/** Recorded outcome — deliberately never "proven" (exploration 0180). */
const CONCLUSION_OPTIONS = [
  ['', '— Not concluded —'],
  ['rejectsNull', 'Rejects the null'],
  ['failsToRejectNull', 'Fails to reject the null'],
  ['inconclusive', 'Inconclusive']
] as const

/** date({}) fields store UTC-midnight ms; reuse the canonical day codecs. */
const msToIso = (value: unknown): string =>
  typeof value === 'number' && value > 0 ? dayToIso(value) : ''
const isoToMs = (iso: string): number | undefined => (iso ? (isoToDay(iso) ?? undefined) : undefined)

function Field({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-medium uppercase tracking-wider text-ink-3">{label}</span>
      {children}
    </label>
  )
}

const inputCls =
  'w-full rounded-md border border-hairline bg-transparent px-2 py-1.5 text-sm text-ink-1 outline-none focus:border-ink-3'

function PhaseEditor({
  phases,
  onChange
}: {
  phases: PhaseDef[]
  onChange: (next: PhaseDef[]) => void
}): JSX.Element {
  const update = (i: number, patch: Partial<PhaseDef>) =>
    onChange(phases.map((p, idx) => (idx === i ? { ...p, ...patch } : p)))
  const add = (kind: PhaseKind) =>
    onChange([
      ...phases,
      { label: kind[0].toUpperCase() + kind.slice(1), kind, start: 0, end: null }
    ])

  return (
    <div className="flex flex-col gap-2">
      {phases.map((phase, i) => (
        <div key={i} className="flex items-center gap-2">
          <select
            value={phase.kind}
            onChange={(e) => update(i, { kind: e.target.value as PhaseKind })}
            className="rounded-md border border-hairline bg-transparent px-2 py-1 text-xs text-ink-1"
          >
            <option value="baseline">Baseline</option>
            <option value="intervention">Intervention</option>
            <option value="washout">Washout</option>
          </select>
          <input
            type="date"
            value={phase.start ? dayToIso(phase.start) : ''}
            onChange={(e) => update(i, { start: isoToDay(e.target.value) ?? 0 })}
            className="rounded-md border border-hairline bg-transparent px-2 py-1 text-xs text-ink-1"
          />
          <span className="text-xs text-ink-3">→</span>
          <input
            type="date"
            value={phase.end ? dayToIso(phase.end) : ''}
            onChange={(e) => update(i, { end: isoToDay(e.target.value) })}
            className="rounded-md border border-hairline bg-transparent px-2 py-1 text-xs text-ink-1"
          />
          <button
            type="button"
            aria-label="Remove phase"
            onClick={() => onChange(phases.filter((_, idx) => idx !== i))}
            className="ml-auto text-ink-3 hover:text-red-500"
          >
            <Trash2 size={13} strokeWidth={1.5} />
          </button>
        </div>
      ))}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => add('baseline')}
          className="flex items-center gap-1 rounded-md border border-hairline px-2 py-1 text-[11px] text-ink-2 hover:bg-accent"
        >
          <Plus size={11} /> Baseline
        </button>
        <button
          type="button"
          onClick={() => add('intervention')}
          className="flex items-center gap-1 rounded-md border border-hairline px-2 py-1 text-[11px] text-ink-2 hover:bg-accent"
        >
          <Plus size={11} /> Intervention
        </button>
      </div>
    </div>
  )
}

export function ExperimentDetail({ experimentId }: { experimentId: string }): JSX.Element {
  const { did } = useIdentity()
  const { data, doc, awareness, update, loading } = useNode(ExperimentSchema, experimentId, {
    createIfMissing: { title: 'Untitled experiment' },
    did: did ?? undefined
  })

  const metricsQ = useQuery(MetricSchema, { orderBy: { sortKey: 'asc' } })
  const metrics = (metricsQ.data ?? []) as unknown as MetricLike[]

  const primaryMetricId = typeof data?.primaryMetric === 'string' ? data.primaryMetric : ''
  const primaryMetric = metrics.find((m) => m.id === primaryMetricId)
  const obsQ = useQuery(ObservationSchema, {
    where: { metric: primaryMetricId || '__none__' },
    orderBy: { day: 'asc' },
    limit: 2000
  })
  const observations = useMemo(() => (obsQ.data ?? []) as unknown as ObservationLike[], [obsQ.data])

  const phases = useMemo(() => parsePhases(data?.phases), [data?.phases])
  const setPhases = useCallback((next: PhaseDef[]) => void update({ phases: next }), [update])
  const completedDays = useMemo(() => {
    const set = new Set<number>()
    for (const o of observations) {
      if (typeof o.day === 'number' && typeof o.value === 'number' && o.value >= 1) {
        set.add(o.day)
      }
    }
    return set
  }, [observations])

  if (loading && !data) {
    return <div className="p-6 text-sm text-ink-3">Loading experiment…</div>
  }

  const polarity =
    primaryMetric && typeof primaryMetric.polarity === 'string'
      ? (primaryMetric.polarity as 'higherBetter' | 'lowerBetter' | 'neutral')
      : 'higherBetter'
  const selfReport = primaryMetric ? primaryMetric.kind === 'scale' : false

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 p-6">
      <input
        value={typeof data?.title === 'string' ? data.title : ''}
        onChange={(e) => void update({ title: e.target.value })}
        placeholder="Experiment title"
        className="w-full bg-transparent text-2xl font-semibold text-ink-1 outline-none placeholder:text-ink-3"
      />

      <div className="grid grid-cols-2 gap-3">
        <Field label="Status">
          <select
            value={typeof data?.status === 'string' ? data.status : 'design'}
            onChange={(e) => void update({ status: e.target.value as 'design' })}
            className={inputCls}
          >
            {STATUS_OPTIONS.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Design">
          <select
            value={typeof data?.design === 'string' ? data.design : 'AB'}
            onChange={(e) => void update({ design: e.target.value as 'AB' })}
            className={inputCls}
          >
            {DESIGN_OPTIONS.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Null hypothesis (what you're trying to reject)">
        <textarea
          rows={2}
          value={typeof data?.hypothesisNull === 'string' ? data.hypothesisNull : ''}
          onChange={(e) => void update({ hypothesisNull: e.target.value })}
          placeholder="e.g. Magnesium has no effect on my sleep latency."
          className={inputCls}
        />
      </Field>
      <Field label="Alternative hypothesis">
        <textarea
          rows={2}
          value={typeof data?.hypothesisAlt === 'string' ? data.hypothesisAlt : ''}
          onChange={(e) => void update({ hypothesisAlt: e.target.value })}
          placeholder="e.g. 200mg before bed reduces sleep latency by >10 min."
          className={inputCls}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Primary metric (lock before intervention)">
          <select
            value={primaryMetricId}
            onChange={(e) => void update({ primaryMetric: e.target.value })}
            className={inputCls}
          >
            <option value="">— Select —</option>
            {metrics.map((m) => (
              <option key={m.id} value={m.id}>
                {metricName(m)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Conclusion (record when concluded)">
          <select
            value={typeof data?.conclusion === 'string' ? data.conclusion : ''}
            onChange={(e) => void update({ conclusion: e.target.value as 'rejectsNull' })}
            className={inputCls}
          >
            {CONCLUSION_OPTIONS.map(([id, label]) => (
              <option key={id || 'none'} value={id}>
                {label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Start date">
          <input
            type="date"
            value={msToIso(data?.startDate)}
            onChange={(e) => void update({ startDate: isoToMs(e.target.value) })}
            className={inputCls}
          />
        </Field>
        <Field label="End date">
          <input
            type="date"
            value={msToIso(data?.endDate)}
            onChange={(e) => void update({ endDate: isoToMs(e.target.value) })}
            className={inputCls}
          />
        </Field>
      </div>

      <Field label="Phases">
        <PhaseEditor phases={phases} onChange={setPhases} />
      </Field>

      <div>
        <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-ink-3">
          Verdict
        </div>
        {primaryMetricId ? (
          <VerdictPanel
            phasesRaw={data?.phases}
            polarity={polarity}
            selfReport={selfReport}
            observations={observations as never}
          />
        ) : (
          <p className="rounded-lg border border-dashed border-hairline p-3 text-xs text-ink-3">
            Pick a primary metric and define a baseline + intervention phase to see the verdict.
          </p>
        )}
      </div>

      {primaryMetricId && (
        <ConfoundLog observations={observations as never} phasesRaw={data?.phases} />
      )}

      {primaryMetric && primaryMetric.kind === 'boolean' && (
        <div>
          <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-ink-3">
            {metricName(primaryMetric)} history
          </div>
          <HabitHeatmap completedDays={completedDays} weeks={16} />
        </div>
      )}

      <div>
        <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-ink-3">
          Journal
        </div>
        <div className="rounded-lg border border-hairline">
          {doc ? (
            <Editor
              doc={doc}
              awareness={awareness}
              did={did ?? undefined}
              className="min-h-[160px] p-3"
            />
          ) : (
            <p className="p-3 text-xs text-ink-3">Loading editor…</p>
          )}
        </div>
      </div>
    </div>
  )
}
