/**
 * Retrieval that tunes itself, locally (exploration 0415).
 *
 * The signal is already on disk: every guarded tool call is an `AgentAction`,
 * and every `recall` returns ranked ids. Which of those the agent went on to
 * *use* — read, edit, cite — is a preference pair, and preference pairs are
 * enough to move a handful of weights.
 *
 * Three constraints shape this, and each one is load-bearing:
 *
 * - **It is weights, not facts.** A `RetrievalProfile` holds four numbers. It
 *   is deliberately not the memory store: personalized facts and tuning state
 *   have different retention and privacy rules, and collapsing them would mean
 *   the "improve retrieval" path silently became a profile of the user.
 * - **It never leaves.** The profile is an ordinary CRDT node in the user's own
 *   store. There is no upload, no aggregate, no telemetry hook here — and
 *   nothing in this module takes a network dependency, so there is no quiet
 *   place for one to appear.
 * - **It cannot regress.** A tuned profile is adopted only when a pinned golden
 *   set does not get worse. Learning from your own behavior is how a retriever
 *   quietly overfits to last Tuesday; the ratchet is what stops it.
 */

import { DEFAULT_HOP_DECAY, type RetrievalBudget } from './types'

/** Schema IRI for the persisted profile (mirrors the `@xnetjs/data` constant). */
export const RETRIEVAL_PROFILE_SCHEMA_IRI = 'xnet://xnet.fyi/RetrievalProfile@1.0.0'

/** The tunable surface. Four numbers, deliberately — not a model. */
export interface RetrievalProfile {
  /** Score multiplier per hop away from an entry node. */
  hopDecay: number
  /** Weight of the semantic side when fusing with keyword hits, 0–1. */
  vectorWeight: number
  /** How many entry nodes to pull before expansion. */
  maxEntries: number
  /** Whether a reranker runs over the candidate set. */
  rerank: boolean
}

export const DEFAULT_RETRIEVAL_PROFILE: RetrievalProfile = {
  hopDecay: DEFAULT_HOP_DECAY,
  vectorWeight: 0.5,
  maxEntries: 12,
  rerank: false
}

/** Bounds every tuned value is clamped into, so a bad step cannot run away. */
export const PROFILE_BOUNDS = {
  hopDecay: [0.2, 0.95],
  vectorWeight: [0, 1],
  maxEntries: [4, 32]
} as const

function clamp(value: number, [min, max]: readonly [number, number]): number {
  return Math.min(max, Math.max(min, value))
}

/** Merge a stored profile over the defaults, clamping anything out of range. */
export function normalizeProfile(partial: Partial<RetrievalProfile> | null): RetrievalProfile {
  const merged = { ...DEFAULT_RETRIEVAL_PROFILE, ...(partial ?? {}) }
  return {
    hopDecay: clamp(Number(merged.hopDecay) || DEFAULT_HOP_DECAY, PROFILE_BOUNDS.hopDecay),
    vectorWeight: clamp(Number(merged.vectorWeight) || 0, PROFILE_BOUNDS.vectorWeight),
    maxEntries: Math.round(clamp(Number(merged.maxEntries) || 12, PROFILE_BOUNDS.maxEntries)),
    rerank: Boolean(merged.rerank)
  }
}

/** Apply a profile to a retrieval budget. */
export function budgetFromProfile(
  profile: RetrievalProfile,
  base: RetrievalBudget
): RetrievalBudget {
  return { ...base, hopDecay: profile.hopDecay, maxEntries: profile.maxEntries }
}

// ─── Preference pairs ────────────────────────────────────────────────────────

/**
 * One observation: a recall returned `returned` (best-first) and the session
 * went on to touch `used`.
 */
export interface RecallOutcome {
  query: string
  /** Node ids the recall returned, in rank order. */
  returned: readonly string[]
  /** Node ids the agent then read, edited or cited. */
  used: readonly string[]
  /** True when the user rolled the work back — a used node that was wrong. */
  rejected?: boolean
}

/** A used node outranked by an unused one: the ranking got this pair backwards. */
export interface PreferencePair {
  query: string
  /** The node that should have ranked higher. */
  preferred: string
  /** The node that actually did. */
  over: string
  /** How many places apart they were. */
  gap: number
  /** Hops of the preferred node, when known — the signal `hopDecay` moves on. */
  preferredHops?: number
}

export interface PreferencePairOptions {
  /** Hops per node id, from the recall that produced the outcome. */
  hopsOf?: (nodeId: string) => number | undefined
}

/**
 * Derive the pairs a ranking got backwards.
 *
 * A rolled-back outcome yields nothing rather than inverted pairs: "the user
 * undid this" means the whole episode is unreliable evidence, not that the
 * opposite ranking was right.
 */
export function preferencePairs(
  outcomes: readonly RecallOutcome[],
  options: PreferencePairOptions = {}
): PreferencePair[] {
  const pairs: PreferencePair[] = []
  for (const outcome of outcomes) {
    if (outcome.rejected) continue
    const rank = new Map(outcome.returned.map((id, index) => [id, index]))
    const used = new Set(outcome.used)
    for (const usedId of outcome.used) {
      const usedRank = rank.get(usedId)
      if (usedRank === undefined) continue
      for (const [otherId, otherRank] of rank) {
        if (otherRank >= usedRank || used.has(otherId)) continue
        pairs.push({
          query: outcome.query,
          preferred: usedId,
          over: otherId,
          gap: usedRank - otherRank,
          ...(options.hopsOf?.(usedId) !== undefined
            ? { preferredHops: options.hopsOf(usedId) }
            : {})
        })
      }
    }
  }
  return pairs
}

/**
 * Propose a nudged profile from preference pairs.
 *
 * One knob moves per round, by a fixed step: when the nodes users actually
 * wanted were reached by walking the graph, the hop penalty is too steep, so
 * `hopDecay` rises. Deliberately dumb — a real optimizer over four numbers and
 * a few dozen observations would fit noise, and the ratchet below is the only
 * thing standing between "learned" and "overfitted".
 */
export function proposeProfile(
  current: RetrievalProfile,
  pairs: readonly PreferencePair[],
  options: { step?: number; minPairs?: number } = {}
): RetrievalProfile | null {
  const step = options.step ?? 0.05
  const minPairs = options.minPairs ?? 10
  if (pairs.length < minPairs) return null

  const withHops = pairs.filter((pair) => pair.preferredHops !== undefined)
  if (withHops.length === 0) return null
  const graphPreferred = withHops.filter((pair) => (pair.preferredHops ?? 0) > 0).length
  const share = graphPreferred / withHops.length

  // A clear majority either way is a direction; anything in between is noise.
  if (share > 0.6) return normalizeProfile({ ...current, hopDecay: current.hopDecay + step })
  if (share < 0.2) return normalizeProfile({ ...current, hopDecay: current.hopDecay - step })
  return null
}

// ─── The ratchet ─────────────────────────────────────────────────────────────

/** Scores a profile is judged on. Same shape the golden-set eval reports. */
export interface ProfileScores {
  recallAll: number
  recallGraph: number
  mrr: number
}

export interface RatchetDecision {
  adopt: boolean
  reason: string
  candidate: RetrievalProfile
  baseline: ProfileScores
  scored: ProfileScores
}

/** Metrics may not fall by more than this and still count as "not a regression". */
export const RATCHET_TOLERANCE = 0.001

/**
 * Adopt a candidate profile only if it does not regress the pinned golden set.
 *
 * Note what this is *not*: it is not "adopt if it improves the user's own
 * queries". Scoring a profile on the behavior that produced it is how a
 * retriever convinces itself it has improved while getting worse at everything
 * the user has not done yet. The golden set is fixed, shared and adversarial to
 * exactly that.
 */
export function ratchetProfile(input: {
  candidate: RetrievalProfile
  baseline: ProfileScores
  scored: ProfileScores
  tolerance?: number
}): RatchetDecision {
  const tolerance = input.tolerance ?? RATCHET_TOLERANCE
  const regressions: string[] = []
  for (const key of ['recallAll', 'recallGraph', 'mrr'] as const) {
    const delta = input.scored[key] - input.baseline[key]
    if (delta < -tolerance) {
      regressions.push(`${key} ${input.baseline[key].toFixed(2)} → ${input.scored[key].toFixed(2)}`)
    }
  }

  const base = {
    candidate: input.candidate,
    baseline: input.baseline,
    scored: input.scored
  }
  if (regressions.length > 0) {
    return { ...base, adopt: false, reason: `regressed ${regressions.join(', ')}` }
  }

  const improved = (['recallAll', 'recallGraph', 'mrr'] as const).some(
    (key) => input.scored[key] - input.baseline[key] > tolerance
  )
  return improved
    ? { ...base, adopt: true, reason: 'improved without regressing' }
    : { ...base, adopt: false, reason: 'no measurable improvement' }
}

// ─── Growing the golden set ──────────────────────────────────────────────────

/** A golden case grown from the user's own confirmed recall. */
export interface LocalGoldenCase {
  id: string
  query: string
  /** Node ids the user's session actually used. */
  relevant: string[]
  /** Epoch ms the case was captured. */
  capturedAt: number
}

/**
 * Turn confirmed outcomes into local golden cases.
 *
 * **Opt-in, and local.** These stay in the user's store beside their memories;
 * nothing here serializes them anywhere else. They make the ratchet sharper for
 * *this* workspace without the committed golden set drifting — the pinned one
 * still has to hold, or the profile is rejected regardless of what the local
 * cases say.
 */
export function localGoldenCases(
  outcomes: readonly RecallOutcome[],
  options: { now: number; minUsed?: number }
): LocalGoldenCase[] {
  const minUsed = options.minUsed ?? 1
  const cases: LocalGoldenCase[] = []
  const seen = new Set<string>()
  for (const outcome of outcomes) {
    if (outcome.rejected) continue
    const relevant = outcome.used.filter((id) => outcome.returned.includes(id))
    if (relevant.length < minUsed) continue
    const query = outcome.query.trim()
    if (!query || seen.has(query)) continue
    seen.add(query)
    cases.push({
      id: `local-${cases.length + 1}`,
      query,
      relevant,
      capturedAt: options.now
    })
  }
  return cases
}
