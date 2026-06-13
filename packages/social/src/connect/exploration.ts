/**
 * Exploration & bandit math for match ranking (exploration 0174 → 0177 W7).
 *
 * The cold-start problem in matching is that pure exploitation (rank by current
 * best estimate) starves weak ties and never learns about under-observed people.
 * These pure helpers add principled exploration:
 *
 * - `ucb1ExplorationBonus` — the UCB1 upper-confidence term: an under-observed
 *   candidate gets a larger optimism bonus, so the feed probes uncertainty
 *   instead of converging on nearest-neighbour twins.
 * - `BanditArm` + `betaPosteriorMean`/`betaPosteriorStdev` — a Beta-Bernoulli
 *   posterior over a candidate's intro→connection success rate, fed by the
 *   post-intro feedback loop. `banditExplorationBonus` turns the posterior
 *   *uncertainty* into a deterministic exploration signal (Bayesian-UCB style).
 * - `thompsonSample` — a stochastic draw (Gaussian posterior approximation) for
 *   callers that want randomized exploration; takes an injected RNG so it stays
 *   testable and keeps the ranking core deterministic.
 * - `adaptiveLambda` — tunes the MMR diversity knob: when the candidate set is
 *   homogeneous (high average similarity), lower λ to weight diversity more and
 *   bridge across communities.
 *
 * No I/O, no RNG except where injected — every function is a pure transform.
 */

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

// ─── UCB1 ────────────────────────────────────────────────────────────────────

/**
 * UCB1 exploration term, squashed into [0, 1]. An unobserved candidate
 * (`count <= 0`) returns 1 (maximum optimism — always try the new thing);
 * otherwise the raw term `c·√(ln(total)/count)` is mapped through `x/(1+x)`, a
 * monotonic squash that never saturates so ordering is preserved (more rounds →
 * higher, more observations → lower). `total` is the number of prior
 * observations across the candidate set.
 */
export function ucb1ExplorationBonus(count: number, total: number, c = Math.SQRT2): number {
  if (count <= 0) return 1
  if (total <= 1) return 0
  const raw = c * Math.sqrt(Math.log(total) / count)
  return raw / (1 + raw)
}

// ─── Beta-Bernoulli bandit (post-intro feedback) ─────────────────────────────

/** Success/failure counts for a candidate's intro→connection outcomes. */
export type BanditArm = {
  successes: number
  failures: number
}

export const EMPTY_ARM: BanditArm = { successes: 0, failures: 0 }

/** Fold one observed outcome into an arm (immutable). */
export function updateArm(arm: BanditArm, success: boolean): BanditArm {
  return {
    successes: arm.successes + (success ? 1 : 0),
    failures: arm.failures + (success ? 0 : 1)
  }
}

/** Mean of the Beta(s+1, f+1) posterior — the smoothed success rate. */
export function betaPosteriorMean(arm: BanditArm): number {
  const a = arm.successes + 1
  const b = arm.failures + 1
  return a / (a + b)
}

/** Standard deviation of the Beta(s+1, f+1) posterior — shrinks with evidence. */
export function betaPosteriorStdev(arm: BanditArm): number {
  const a = arm.successes + 1
  const b = arm.failures + 1
  const n = a + b
  return Math.sqrt((a * b) / (n * n * (n + 1)))
}

/**
 * Deterministic exploration bonus from a bandit arm: the posterior uncertainty
 * scaled to [0, 1] against the most-uncertain prior (Beta(1,1), std = 1/√12).
 * A fresh arm → ~1 (explore); a well-observed arm → ~0 (exploit its mean).
 */
export function banditExplorationBonus(arm: BanditArm): number {
  const maxStd = Math.sqrt(1 / 12) // std of the uniform Beta(1,1) prior
  return clamp01(betaPosteriorStdev(arm) / maxStd)
}

/**
 * Thompson sample from a Gaussian approximation of the arm's posterior, using an
 * injected RNG (two uniforms → Box–Muller). Stochastic, so it is *not* used by
 * the deterministic ranking core, but exposed for randomized-exploration callers
 * and is testable with a fixed RNG.
 */
export function thompsonSample(arm: BanditArm, rng: () => number): number {
  const mean = betaPosteriorMean(arm)
  const std = betaPosteriorStdev(arm)
  const u1 = Math.min(Math.max(rng(), Number.EPSILON), 1)
  const u2 = rng()
  const gaussian = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
  return clamp01(mean + std * gaussian)
}

// ─── Adaptive MMR diversity ──────────────────────────────────────────────────

export type AdaptiveLambdaOptions = {
  /** λ when the set is maximally diverse (avg similarity 0). Default 0.85. */
  max?: number
  /** λ when the set is maximally homogeneous (avg similarity 1). Default 0.5. */
  min?: number
}

/**
 * Choose an MMR λ from how homogeneous the candidate set is. Higher average
 * pairwise similarity → lower λ → more weight on diversity, so a cluster of
 * look-alikes gets broken up to bridge weak ties. Interpolates linearly between
 * `max` (diverse set) and `min` (homogeneous set).
 */
export function adaptiveLambda(
  averageSimilarity: number,
  options: AdaptiveLambdaOptions = {}
): number {
  const max = options.max ?? 0.85
  const min = options.min ?? 0.5
  const s = clamp01(averageSimilarity)
  return max - (max - min) * s
}

/** Mean pairwise similarity over a set, in [0, 1]; 0 for <2 items. */
export function averagePairwiseSimilarity<T>(
  items: readonly T[],
  similarity: (a: T, b: T) => number
): number {
  if (items.length < 2) return 0
  let sum = 0
  let pairs = 0
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      sum += similarity(items[i], items[j])
      pairs++
    }
  }
  return pairs === 0 ? 0 : sum / pairs
}
