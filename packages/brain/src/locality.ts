/**
 * Locality planner (exploration 0211, Phase 4) — promotes the dormant
 * `QuerySource` "future hint" in `@xnetjs/data-bridge` into a real policy. It
 * scores nodes for the local working set (recency × frequency × pinned ×
 * centrality), decides which to keep local vs leave on hub/federated, and
 * resolves an `auto` read to a concrete source.
 *
 * The `QuerySource` types are mirrored locally (not imported) so this module
 * stays in the fast pure-TS test pool and carries no dependency on the
 * Yjs-heavy data-bridge package.
 */

/** Where a query is served from — mirrors `@xnetjs/data-bridge`'s `QuerySource`. */
export type QuerySource = 'local' | 'memory' | 'hub' | 'federated' | 'hybrid'

/** Caller's source preference — mirrors `QuerySourcePreference`. */
export type QuerySourcePreference = 'auto' | 'local' | 'hub' | 'federated'

/** Signals about a node, used to score its place in the local working set. */
export interface WorkingSetSignal {
  nodeId: string
  /** Epoch ms of last access. Absent = never accessed locally. */
  lastAccessMs?: number
  /** How often the node has been accessed. */
  accessCount?: number
  /** User explicitly pinned this node for offline. */
  pinned?: boolean
  /** Graph centrality in [0, 1] (e.g. normalized degree). */
  centrality?: number
}

export interface WorkingSetWeights {
  recency: number
  frequency: number
  pinned: number
  centrality: number
}

export const DEFAULT_WEIGHTS: WorkingSetWeights = {
  recency: 0.4,
  frequency: 0.3,
  pinned: 0.2,
  centrality: 0.1
}

export interface ScoreWorkingSetOptions {
  now: number
  weights?: Partial<WorkingSetWeights>
  /** Half-life of recency decay in ms (default 7 days). */
  recencyHalfLifeMs?: number
  /** Access count that saturates the frequency component (default 10). */
  frequencySaturation?: number
}

/**
 * Score each signal in [0, 1+] (a pinned node can exceed 1). Pure.
 */
export function scoreWorkingSet(
  signals: readonly WorkingSetSignal[],
  options: ScoreWorkingSetOptions
): Map<string, number> {
  const weights = { ...DEFAULT_WEIGHTS, ...options.weights }
  const halfLifeMs = options.recencyHalfLifeMs ?? 7 * 24 * 60 * 60 * 1000
  const saturation = options.frequencySaturation ?? 10
  const scores = new Map<string, number>()

  for (const signal of signals) {
    const recency =
      signal.lastAccessMs === undefined
        ? 0
        : Math.pow(0.5, Math.max(0, options.now - signal.lastAccessMs) / halfLifeMs)
    const frequency = Math.min(1, (signal.accessCount ?? 0) / saturation)
    const pinned = signal.pinned ? 1 : 0
    const centrality = clamp01(signal.centrality ?? 0)

    const score =
      weights.recency * recency +
      weights.frequency * frequency +
      weights.pinned * pinned +
      weights.centrality * centrality
    scores.set(signal.nodeId, score)
  }

  return scores
}

export interface LocalityPlan {
  /** Node ids to keep cached locally (the hot working set). */
  local: Set<string>
  /** Node ids to leave on the hub / fetch on demand (the cold tail). */
  remote: Set<string>
}

export interface PlanLocalityOptions {
  /** Max nodes to keep local (the offline cache budget). */
  maxLocal: number
  /** Minimum score to be eligible for the local set (default 0). */
  minScore?: number
}

/**
 * Split scored nodes into a local working set and a remote tail. Highest scores
 * win the limited local budget; pinned-and-thus-high-scoring nodes are kept even
 * if they'd otherwise fall outside the budget by being ranked first.
 */
export function planLocality(
  scores: ReadonlyMap<string, number>,
  options: PlanLocalityOptions
): LocalityPlan {
  const minScore = options.minScore ?? 0
  const ranked = [...scores.entries()]
    .filter(([, score]) => score >= minScore)
    .sort((a, b) => b[1] - a[1])

  const local = new Set<string>()
  const remote = new Set<string>()
  for (let i = 0; i < ranked.length; i++) {
    const [nodeId] = ranked[i]
    if (i < options.maxLocal) local.add(nodeId)
    else remote.add(nodeId)
  }
  // Anything below minScore is implicitly remote, too.
  for (const [nodeId, score] of scores.entries()) {
    if (score < minScore) remote.add(nodeId)
  }
  return { local, remote }
}

export interface ResolveSourceOptions {
  preference: QuerySourcePreference
  /** How many matching rows are already local. */
  localRowCount: number
  /**
   * Local row counts at/above this prefer a hub refresh for `auto` reads
   * (mirrors `QuerySource.localRowFloor`). Default 0 disables the floor.
   */
  localRowFloor?: number
  /** Whether the hub is reachable right now. */
  online: boolean
}

/**
 * Resolve a `QuerySourcePreference` to a concrete `QuerySource`, honoring the
 * local-first contract: offline always reads local; `auto` reads local-only when
 * the local cache is already rich, otherwise fuses local + hub.
 */
export function resolveQuerySource(options: ResolveSourceOptions): QuerySource {
  const { preference, localRowCount, online } = options
  const floor = options.localRowFloor ?? 0

  if (!online) return 'local'
  if (preference === 'local') return 'local'
  if (preference === 'hub') return 'hub'
  if (preference === 'federated') return 'federated'

  // preference === 'auto'
  if (floor > 0 && localRowCount >= floor) return 'local'
  return localRowCount > 0 ? 'hybrid' : 'hub'
}

function clamp01(value: number): number {
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}
