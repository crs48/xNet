/**
 * Pure helpers for an experiment's phase timeline and for partitioning a
 * metric's observations into baseline / intervention buckets for the verdict
 * engine. The experiment's `phases` (date ranges) are authoritative for
 * analysis — an Observation's denormalized `phase` is only a fast-path hint, so
 * retro-analysis of habit data logged before the experiment still works.
 */
import { canonicalDay } from '@xnetjs/experiments'

export type PhaseKind = 'baseline' | 'intervention' | 'washout'

export interface PhaseDef {
  label: string
  kind: PhaseKind
  /** Canonical UTC-midnight ms. */
  start: number
  /** Canonical end (inclusive), or null for an open phase. */
  end: number | null
}

export interface PhasedObservation {
  day?: unknown
  value?: unknown
  phase?: unknown
  confounds?: unknown
}

/** Parse the json `phases` property into typed phase defs (defensive). */
export function parsePhases(raw: unknown): PhaseDef[] {
  if (!Array.isArray(raw)) return []
  const out: PhaseDef[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const p = item as Record<string, unknown>
    if (typeof p.start !== 'number') continue
    const kind = p.kind === 'intervention' || p.kind === 'washout' ? p.kind : 'baseline'
    out.push({
      label: typeof p.label === 'string' ? p.label : kind,
      kind,
      start: canonicalDay(p.start),
      end: typeof p.end === 'number' ? canonicalDay(p.end) : null
    })
  }
  return out.sort((a, b) => a.start - b.start)
}

/** Which phase does a canonical day fall in? `none` when outside every phase. */
export function phaseForDay(day: number, phases: PhaseDef[]): PhaseKind | 'none' {
  for (const phase of phases) {
    if (day < phase.start) continue
    if (phase.end !== null && day > phase.end) continue
    return phase.kind
  }
  return 'none'
}

export interface PartitionedValues {
  baseline: number[]
  intervention: number[]
  washout: number[]
}

/**
 * Bucket a metric's observation values by phase, deriving the phase from the
 * experiment's date ranges. Observations outside every phase are ignored.
 */
export function partitionByPhase(
  observations: PhasedObservation[],
  phases: PhaseDef[]
): PartitionedValues {
  const result: PartitionedValues = { baseline: [], intervention: [], washout: [] }
  if (phases.length === 0) return result
  for (const obs of observations) {
    if (typeof obs.day !== 'number' || typeof obs.value !== 'number') continue
    const kind = phaseForDay(canonicalDay(obs.day), phases)
    if (kind === 'none') continue
    result[kind].push(obs.value)
  }
  return result
}

/** Count distinct days that have a logged confound inside any phase. */
export function confoundDaysInWindow(observations: PhasedObservation[], phases: PhaseDef[]): number {
  if (phases.length === 0) return 0
  const days = new Set<number>()
  for (const obs of observations) {
    if (typeof obs.day !== 'number') continue
    if (!Array.isArray(obs.confounds) || obs.confounds.length === 0) continue
    const day = canonicalDay(obs.day)
    if (phaseForDay(day, phases) === 'none') continue
    days.add(day)
  }
  return days.size
}
