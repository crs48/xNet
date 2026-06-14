/**
 * Lightweight statistics for n=1 self-experiments.
 *
 * Deliberately dependency-free and conservative. These are the primitives the
 * verdict engine composes: descriptive stats, effect size, non-overlap
 * (Tau-U / PND), correlation, and an approximate (flat-prior) posterior on the
 * mean difference. None of these "prove" anything — they quantify how strongly
 * the data argues against a null hypothesis of "no effect".
 */

export function mean(xs: readonly number[]): number {
  if (xs.length === 0) return 0
  let sum = 0
  for (const x of xs) sum += x
  return sum / xs.length
}

/** Sample variance (Bessel-corrected, n − 1). 0 for fewer than two points. */
export function variance(xs: readonly number[]): number {
  if (xs.length < 2) return 0
  const m = mean(xs)
  let ss = 0
  for (const x of xs) ss += (x - m) * (x - m)
  return ss / (xs.length - 1)
}

export function stdDev(xs: readonly number[]): number {
  return Math.sqrt(variance(xs))
}

/** Pooled standard deviation of two samples (for Cohen's d). */
export function pooledStdDev(a: readonly number[], b: readonly number[]): number {
  const na = a.length
  const nb = b.length
  if (na + nb < 2) return 0
  const sa = variance(a)
  const sb = variance(b)
  const pooled = ((na - 1) * sa + (nb - 1) * sb) / Math.max(1, na + nb - 2)
  return Math.sqrt(pooled)
}

/**
 * Cohen's d — standardized mean difference (intervention − baseline).
 * Positive means intervention is higher; the verdict applies polarity. Returns
 * 0 when both phases have no spread (degenerate).
 */
export function cohensD(baseline: readonly number[], intervention: readonly number[]): number {
  const sd = pooledStdDev(baseline, intervention)
  if (sd === 0) return 0
  return (mean(intervention) - mean(baseline)) / sd
}

/** Percent change of the intervention mean relative to the baseline mean. */
export function percentChange(
  baseline: readonly number[],
  intervention: readonly number[]
): number {
  const mb = mean(baseline)
  if (mb === 0) return 0
  return ((mean(intervention) - mb) / Math.abs(mb)) * 100
}

/** Pearson correlation coefficient. NaN-safe: returns 0 when undefined. */
export function pearson(x: readonly number[], y: readonly number[]): number {
  const n = Math.min(x.length, y.length)
  if (n < 2) return 0
  const mx = mean(x.slice(0, n))
  const my = mean(y.slice(0, n))
  let sxy = 0
  let sxx = 0
  let syy = 0
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx
    const dy = y[i] - my
    sxy += dx * dy
    sxx += dx * dx
    syy += dy * dy
  }
  if (sxx === 0 || syy === 0) return 0
  return sxy / Math.sqrt(sxx * syy)
}

/**
 * Point-biserial correlation between a binary predictor (0/1) and a continuous
 * outcome — the right tool for "exercised (y/n)" vs "mood (1–5)". Algebraically
 * identical to Pearson with the binary coded 0/1.
 */
export function pointBiserial(binary: readonly number[], continuous: readonly number[]): number {
  return pearson(binary, continuous)
}

/** Ordinary least squares slope/intercept over (x, y) pairs. */
export function linearRegression(points: ReadonlyArray<readonly [number, number]>): {
  slope: number
  intercept: number
} {
  const n = points.length
  if (n < 2) return { slope: 0, intercept: n === 1 ? points[0][1] : 0 }
  const xs = points.map((p) => p[0])
  const ys = points.map((p) => p[1])
  const mx = mean(xs)
  const my = mean(ys)
  let num = 0
  let den = 0
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my)
    den += (xs[i] - mx) * (xs[i] - mx)
  }
  const slope = den === 0 ? 0 : num / den
  return { slope, intercept: my - slope * mx }
}

/** Sum of pairwise signs across two phases: Σ sign(b − a) over a∈A, b∈B. */
function crossPhaseSignSum(a: readonly number[], b: readonly number[]): number {
  let s = 0
  for (const av of a) for (const bv of b) s += Math.sign(bv - av)
  return s
}

/** Sum of pairwise signs within one phase (Kendall S over ordered points). */
function withinPhaseSignSum(xs: readonly number[]): number {
  let s = 0
  for (let i = 0; i < xs.length; i++) {
    for (let j = i + 1; j < xs.length; j++) s += Math.sign(xs[j] - xs[i])
  }
  return s
}

/** Percentage of intervention points beyond *all* baseline points (PND). */
export function pnd(
  baseline: readonly number[],
  intervention: readonly number[],
  higherIsBetter = true
): number {
  if (baseline.length === 0 || intervention.length === 0) return 0
  const bound = higherIsBetter ? Math.max(...baseline) : Math.min(...baseline)
  let beyond = 0
  for (const v of intervention) {
    if (higherIsBetter ? v > bound : v < bound) beyond++
  }
  return (beyond / intervention.length) * 100
}

/**
 * Tau-U — non-overlap between baseline (A) and intervention (B) with a
 * correction for any pre-existing trend in baseline (Parker, Vannest & Davis,
 * 2011). Range −1..1; positive means B sits above A beyond what a drifting
 * baseline would explain. Raw/polarity-naive (higher B = positive); the verdict
 * applies the metric's polarity. Returns 0 when a phase is empty.
 *
 * Normalized by the count of cross-phase pairs (nA·nB); a strongly drifting
 * baseline can push the trend-corrected value slightly past ±1, which is a
 * documented property of the correction rather than a bug.
 */
export function tauU(baseline: readonly number[], intervention: readonly number[]): number {
  const nA = baseline.length
  const nB = intervention.length
  if (nA === 0 || nB === 0) return 0
  const sAB = crossPhaseSignSum(baseline, intervention)
  const sA = withinPhaseSignSum(baseline)
  return (sAB - sA) / (nA * nB)
}

/**
 * Approximate posterior on the mean difference (intervention − baseline) under
 * flat priors: Normal(meanDiff, SE²) with a Welch standard error. Reported as a
 * 95% credible interval. Honest about uncertainty without pretending to a full
 * MCMC; for small n the interval is wide on purpose.
 */
export function meanDifferenceInterval(
  baseline: readonly number[],
  intervention: readonly number[]
): { meanDiff: number; ci: [number, number]; se: number } {
  const meanDiff = mean(intervention) - mean(baseline)
  const se = Math.sqrt(
    variance(baseline) / Math.max(1, baseline.length) +
      variance(intervention) / Math.max(1, intervention.length)
  )
  return { meanDiff, ci: [meanDiff - 1.96 * se, meanDiff + 1.96 * se], se }
}

/**
 * Beta-Binomial posterior for a boolean outcome (e.g. "did the habit hold?").
 * Conjugate update of a Beta(priorA, priorB) prior; the credible interval uses
 * the normal approximation to the Beta, clamped to [0, 1].
 */
export function betaBinomialPosterior(
  successes: number,
  failures: number,
  priorA = 1,
  priorB = 1
): { mean: number; ci: [number, number] } {
  const a = priorA + successes
  const b = priorB + failures
  const total = a + b
  const m = a / total
  const varr = (a * b) / (total * total * (total + 1))
  const sd = Math.sqrt(varr)
  return {
    mean: m,
    ci: [Math.max(0, m - 1.96 * sd), Math.min(1, m + 1.96 * sd)]
  }
}
