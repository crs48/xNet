/**
 * The verdict engine — turns two phases of observations into an honest answer
 * about a null hypothesis.
 *
 * Design rule: this never prints "proven". It reports an effect size, a
 * credible interval, and every triggered caveat, and it frames the conclusion
 * as *rejects* / *fails to reject* the null. When a phase is too short or a
 * disqualifying caveat fires, it refuses a confident claim and returns
 * `inconclusive`. Over-claiming is the one failure mode that kills the tool's
 * credibility, so the bias is always toward caution.
 */

import { cohensD, mean, meanDifferenceInterval, percentChange, tauU } from './stats'

export type Polarity = 'higherBetter' | 'lowerBetter' | 'neutral'

export type VerdictDirection = 'rejectsNull' | 'failsToRejectNull' | 'inconclusive'

export type Caveat =
  | { kind: 'phaseTooShort'; phase: 'baseline' | 'intervention'; n: number; min: number }
  | { kind: 'unbalancedPhases'; baseline: number; intervention: number }
  | { kind: 'confoundsPresent'; days: number }
  | { kind: 'regressionToMean' }
  | { kind: 'multipleComparisons'; metricsExamined: number }
  | { kind: 'unblindedSelfReport' }

export interface EvaluateInput {
  /** Primary-outcome values during the baseline phase. */
  baseline: number[]
  /** Primary-outcome values during the intervention phase. */
  intervention: number[]
  /** Which direction counts as improvement. Defaults to `higherBetter`. */
  polarity?: Polarity
  /** Minimum datapoints per phase before a confident claim is allowed. */
  minPhaseN?: number
  /** Days within the result window that overlapped a logged confound. */
  confoundDays?: number
  /** True when the primary outcome is an unblinded self-report (mood, energy). */
  selfReport?: boolean
  /** How many secondary metrics are being examined (multiplicity risk). */
  metricsExamined?: number
  /** True when the experiment started right after an extreme baseline reading. */
  baselineSelectedAtExtreme?: boolean
}

export interface Verdict {
  direction: VerdictDirection
  cohensD: number
  percentChange: number
  tauU: number
  meanBaseline: number
  meanIntervention: number
  nBaseline: number
  nIntervention: number
  /** 95% credible interval on (intervention − baseline), polarity-naive. */
  credibleInterval: [number, number]
  caveats: Caveat[]
  /** Human sentence, framed against the null. Never says "proven". */
  summary: string
}

const DEFAULT_MIN_PHASE_N = 5

/** Beneficial change is positive for higherBetter, negative for lowerBetter. */
function improvementSign(polarity: Polarity): number {
  return polarity === 'lowerBetter' ? -1 : 1
}

export function evaluate(input: EvaluateInput): Verdict {
  const polarity = input.polarity ?? 'higherBetter'
  const minPhaseN = input.minPhaseN ?? DEFAULT_MIN_PHASE_N
  const { baseline, intervention } = input

  const d = cohensD(baseline, intervention)
  const pct = percentChange(baseline, intervention)
  const tau = tauU(baseline, intervention)
  const { meanDiff, ci } = meanDifferenceInterval(baseline, intervention)

  const caveats: Caveat[] = []
  if (baseline.length < minPhaseN) {
    caveats.push({ kind: 'phaseTooShort', phase: 'baseline', n: baseline.length, min: minPhaseN })
  }
  if (intervention.length < minPhaseN) {
    caveats.push({
      kind: 'phaseTooShort',
      phase: 'intervention',
      n: intervention.length,
      min: minPhaseN
    })
  }
  if (baseline.length > 0 && intervention.length > 0) {
    const ratio =
      Math.max(baseline.length, intervention.length) /
      Math.min(baseline.length, intervention.length)
    if (ratio >= 2) {
      caveats.push({
        kind: 'unbalancedPhases',
        baseline: baseline.length,
        intervention: intervention.length
      })
    }
  }
  if (input.confoundDays && input.confoundDays > 0) {
    caveats.push({ kind: 'confoundsPresent', days: input.confoundDays })
  }
  if (input.baselineSelectedAtExtreme) {
    caveats.push({ kind: 'regressionToMean' })
  }
  if (input.metricsExamined && input.metricsExamined > 1) {
    caveats.push({ kind: 'multipleComparisons', metricsExamined: input.metricsExamined })
  }
  if (input.selfReport) {
    caveats.push({ kind: 'unblindedSelfReport' })
  }

  const sign = improvementSign(polarity)
  const tooShort = caveats.some((c) => c.kind === 'phaseTooShort')

  // Does the credible interval exclude "no difference" in the beneficial
  // direction? (Polarity-aware: for lowerBetter, a beneficial effect means the
  // whole interval sits below zero.)
  const ciExcludesZeroBeneficially = sign > 0 ? ci[0] > 0 : ci[1] < 0
  const magnitudeMeaningful = Math.abs(d) >= 0.2

  let direction: VerdictDirection
  if (tooShort || baseline.length === 0 || intervention.length === 0) {
    direction = 'inconclusive'
  } else if (ciExcludesZeroBeneficially && magnitudeMeaningful) {
    direction = 'rejectsNull'
  } else {
    direction = 'failsToRejectNull'
  }

  return {
    direction,
    cohensD: d,
    percentChange: pct,
    tauU: tau,
    meanBaseline: mean(baseline),
    meanIntervention: mean(intervention),
    nBaseline: baseline.length,
    nIntervention: intervention.length,
    credibleInterval: ci,
    caveats,
    summary: summarize(direction, d, meanDiff, polarity, caveats)
  }
}

function magnitudeLabel(d: number): string {
  const a = Math.abs(d)
  if (a < 0.2) return 'negligible'
  if (a < 0.5) return 'small'
  if (a < 0.8) return 'medium'
  return 'large'
}

function summarize(
  direction: VerdictDirection,
  d: number,
  meanDiff: number,
  polarity: Polarity,
  caveats: Caveat[]
): string {
  const size = magnitudeLabel(d)
  const dir = meanDiff === 0 ? 'no change' : meanDiff > 0 ? 'an increase' : 'a decrease'
  const caveatNote =
    caveats.length > 0
      ? ` Treat with care — ${caveats.length} caveat${caveats.length === 1 ? '' : 's'} flagged.`
      : ''
  switch (direction) {
    case 'inconclusive':
      return `Not enough clean data to evaluate your null hypothesis yet (${dir}, ${size} effect so far).${caveatNote}`
    case 'rejectsNull':
      return `The evidence argues against your null hypothesis: ${dir} with a ${size} effect (d=${d.toFixed(
        2
      )}).${caveatNote}`
    case 'failsToRejectNull':
    default:
      return `The evidence does not reject your null hypothesis (${dir}, ${size} effect, d=${d.toFixed(
        2
      )}); the difference is consistent with chance.${caveatNote}`
  }
}

/** Human-readable, honest one-liners for each caveat (for the verdict panel). */
export function describeCaveat(caveat: Caveat): string {
  switch (caveat.kind) {
    case 'phaseTooShort':
      return `The ${caveat.phase} phase has only ${caveat.n} datapoint${
        caveat.n === 1 ? '' : 's'
      } (aim for at least ${caveat.min}). Short phases are easily fooled by noise.`
    case 'unbalancedPhases':
      return `Phase lengths are uneven (${caveat.baseline} vs ${caveat.intervention}); comparisons across very different sample sizes are unreliable.`
    case 'confoundsPresent':
      return `${caveat.days} day${
        caveat.days === 1 ? '' : 's'
      } in this window overlapped a logged confound — the change may not be the intervention.`
    case 'regressionToMean':
      return `This experiment began right after an extreme baseline reading; some apparent improvement may just be regression to the mean.`
    case 'multipleComparisons':
      return `You're examining ${caveat.metricsExamined} metrics — with that many, one is likely to look "significant" by chance. Pre-specify a primary outcome.`
    case 'unblindedSelfReport':
      return `The outcome is an unblinded self-report, which is susceptible to expectation (placebo) effects. Prefer an objective measure where you can.`
  }
}
