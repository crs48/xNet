/**
 * Pure matching math for the people-matching layer (exploration 0174).
 *
 * No I/O, no embeddings model, no graph store — every function here is a pure
 * transform so it can be unit-tested and run identically on device or hub.
 */

// ─── Vectors ─────────────────────────────────────────────────────────────────

/** Cosine similarity in [-1, 1]; 0 when either vector is empty or zero. */
export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  const n = Math.min(a.length, b.length)
  if (n === 0) return 0
  let dot = 0
  let magA = 0
  let magB = 0
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i]
    magA += a[i] * a[i]
    magB += b[i] * b[i]
  }
  if (magA === 0 || magB === 0) return 0
  return dot / (Math.sqrt(magA) * Math.sqrt(magB))
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

function bytesToBase64(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0
    out += B64[b0 >> 2]
    out += B64[((b0 & 3) << 4) | (b1 >> 4)]
    out += i + 1 < bytes.length ? B64[((b1 & 15) << 2) | (b2 >> 6)] : '='
    out += i + 2 < bytes.length ? B64[b2 & 63] : '='
  }
  return out
}

function base64ToBytes(value: string): Uint8Array {
  const clean = value.replace(/=+$/, '')
  const out = new Uint8Array(Math.floor((clean.length * 6) / 8))
  let bits = 0
  let acc = 0
  let o = 0
  for (const char of clean) {
    const idx = B64.indexOf(char)
    if (idx === -1) continue
    acc = (acc << 6) | idx
    bits += 6
    if (bits >= 8) {
      bits -= 8
      out[o++] = (acc >> bits) & 0xff
    }
  }
  return out.subarray(0, o)
}

/** Encode an affinity vector as base64 of its little-endian Float32 bytes. */
export function encodeVector(vector: readonly number[]): string {
  const floats = new Float32Array(vector)
  return bytesToBase64(new Uint8Array(floats.buffer, floats.byteOffset, floats.byteLength))
}

/** Decode a base64 affinity vector produced by `encodeVector`. */
export function decodeVector(encoded: string): number[] {
  if (!encoded) return []
  const bytes = base64ToBytes(encoded)
  const usable = bytes.byteLength - (bytes.byteLength % 4)
  const floats = new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + usable))
  return Array.from(floats)
}

// ─── Reciprocity ─────────────────────────────────────────────────────────────

/**
 * Reciprocal compatibility — the harmonic mean of the two directional interest
 * estimates. The harmonic mean penalizes asymmetry: a 90/10 match scores below a
 * 50/50 one, so the system routes toward mutual interest rather than one-sided
 * desirability (the lesson from Tinder's abandoned ELO).
 */
export function reciprocalScore(aToB: number, bToA: number): number {
  if (aToB <= 0 || bToA <= 0) return 0
  return (2 * aToB * bToA) / (aToB + bToA)
}

// ─── Graph proximity (friends-of-friends) ────────────────────────────────────

export type Adjacency = ReadonlyMap<string, ReadonlySet<string>>

/** Build an undirected adjacency map from a list of edges. */
export function buildAdjacency(edges: readonly (readonly [string, string])[]): Adjacency {
  const map = new Map<string, Set<string>>()
  const add = (from: string, to: string) => {
    if (from === to) return
    const set = map.get(from) ?? new Set<string>()
    set.add(to)
    map.set(from, set)
  }
  for (const [a, b] of edges) {
    add(a, b)
    add(b, a)
  }
  return map
}

export function commonNeighbors(adjacency: Adjacency, a: string, b: string): string[] {
  const na = adjacency.get(a)
  const nb = adjacency.get(b)
  if (!na || !nb) return []
  const [small, large] = na.size <= nb.size ? [na, nb] : [nb, na]
  return [...small].filter((node) => large.has(node))
}

/**
 * Adamic-Adar link-prediction score: common neighbors weighted by 1/log(degree),
 * so a shared *niche* connection counts for more than a shared popular hub.
 */
export function adamicAdar(adjacency: Adjacency, a: string, b: string): number {
  return commonNeighbors(adjacency, a, b).reduce((score, neighbor) => {
    const degree = adjacency.get(neighbor)?.size ?? 0
    return degree > 1 ? score + 1 / Math.log(degree) : score
  }, 0)
}

export function jaccard(adjacency: Adjacency, a: string, b: string): number {
  const na = adjacency.get(a) ?? new Set<string>()
  const nb = adjacency.get(b) ?? new Set<string>()
  if (na.size === 0 && nb.size === 0) return 0
  const shared = commonNeighbors(adjacency, a, b).length
  const union = new Set([...na, ...nb]).size
  return union === 0 ? 0 : shared / union
}

/** Squash an unbounded Adamic-Adar score into [0, 1] for blending with cosine. */
export function graphProximity(adjacency: Adjacency, a: string, b: string): number {
  const aa = adamicAdar(adjacency, a, b)
  return aa <= 0 ? 0 : 1 - 1 / (1 + aa)
}

// ─── Candidate scoring ───────────────────────────────────────────────────────

export type MatchWeights = {
  content: number
  reciprocal: number
  graph: number
  exploration: number
}

export const DEFAULT_MATCH_WEIGHTS: MatchWeights = {
  content: 0.45,
  reciprocal: 0.3,
  graph: 0.2,
  exploration: 0.05
}

export type CandidateSignals = {
  /** cosine(affinityVec_me, affinityVec_you) mapped to [0, 1]. */
  content: number
  /** reciprocal harmonic interest estimate in [0, 1]. */
  reciprocal: number
  /** graph proximity in [0, 1]. */
  graph: number
  /** exploration bonus for uncertainty (weak ties / serendipity), [0, 1]. */
  exploration?: number
}

/** Blend candidate signals into a single score with the given (normalized) weights. */
export function scoreCandidate(
  signals: CandidateSignals,
  weights: MatchWeights = DEFAULT_MATCH_WEIGHTS
): number {
  const total = weights.content + weights.reciprocal + weights.graph + weights.exploration || 1
  const raw =
    weights.content * clamp01(signals.content) +
    weights.reciprocal * clamp01(signals.reciprocal) +
    weights.graph * clamp01(signals.graph) +
    weights.exploration * clamp01(signals.exploration ?? 0)
  return clamp01(raw / total)
}

/**
 * Exploration bonus that rewards uncertainty (few observations) so the feed
 * surfaces bridging weak ties instead of converging on nearest-neighbour twins.
 */
export function explorationBonus(observationCount: number): number {
  return 1 / (1 + Math.max(0, observationCount))
}

// ─── Diversity (anti-filter-bubble) ──────────────────────────────────────────

export type RankedCandidate<T> = { item: T; score: number }

/**
 * Maximal Marginal Relevance re-ranking. Selects each next candidate to maximize
 * `λ·relevance − (1−λ)·maxSimilarityToAlreadySelected`, injecting diversity so
 * the result set bridges communities rather than echoing one cluster.
 */
export function mmrRerank<T>(
  candidates: readonly RankedCandidate<T>[],
  similarity: (a: T, b: T) => number,
  lambda = 0.7
): RankedCandidate<T>[] {
  const remaining = [...candidates].sort((x, y) => y.score - x.score)
  const selected: RankedCandidate<T>[] = []

  while (remaining.length > 0) {
    let bestIndex = 0
    let bestValue = -Infinity
    for (let i = 0; i < remaining.length; i++) {
      const candidate = remaining[i]
      const maxSim = selected.reduce(
        (max, chosen) => Math.max(max, similarity(candidate.item, chosen.item)),
        0
      )
      const value = lambda * candidate.score - (1 - lambda) * maxSim
      if (value > bestValue) {
        bestValue = value
        bestIndex = i
      }
    }
    selected.push(remaining.splice(bestIndex, 1)[0])
  }

  return selected
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}
