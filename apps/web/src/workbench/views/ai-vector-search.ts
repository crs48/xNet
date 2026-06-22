/**
 * Lazy, opt-in semantic (vector) entry search for the AI chat (exploration 0211).
 *
 * Wakes the dormant `@xnetjs/vectors` engine BEHIND the `createGraphContextRetriever`
 * seam: when enabled, entry search fuses on-device vector similarity with the
 * keyword scan (Reciprocal Rank Fusion), so the assistant finds things by meaning,
 * not just literal text. The graph-walk + token budget then proceed unchanged.
 *
 * Safety first (the 0204 cold-start constraint):
 *  - The heavy `@xenova` model + `usearch` are pulled in only through a **dynamic
 *    import**, and only on the FIRST search after the user opts in — zero boot or
 *    bundle cost when the flag is off.
 *  - Until the index is warm (model loading / backfilling) and on ANY failure, it
 *    transparently falls back to keyword search. Enabling it can only ever make
 *    results as good or better — never worse, never broken.
 *  - With a blob store it restores/persists the index instead of re-embedding the
 *    graph every session (the `@xnetjs/brain` persist layer).
 */
import { loadVectorTier, saveVectorTier, type BlobStore, type EntryHit } from '@xnetjs/brain'
import { keywordEntrySearch, nodeTextParts, type GraphRetrieverStore } from './ai-graph-retriever'

/** The semantic index surface we use (`@xnetjs/vectors` `SemanticSearch` satisfies it). */
export interface SemanticIndexLike {
  initialize(): Promise<void>
  indexDocument(id: string, content: string): Promise<unknown>
  search(
    query: string,
    options?: { maxResults?: number; minScore?: number }
  ): Promise<Array<{ id: string; score: number }>>
  serialize(): unknown
  restore(data: unknown): void
}

/** The vectors engine loader (injected in tests; defaults to a dynamic import). */
export type VectorEngineLoader = () => Promise<{
  createSemanticSearch: (config: { useMockModel?: boolean }) => SemanticIndexLike
}>

export interface VectorEntrySearchOptions {
  store: GraphRetrieverStore
  /** Deterministic mock model (tests). Default false → real on-device `@xenova`. */
  useMockModel?: boolean
  /** Optional blob store; when present, restore/persist instead of re-embedding. */
  storage?: BlobStore
  /** Max nodes to embed on a cold backfill. */
  maxBackfill?: number
  /** Vector weight for RRF fusion (0–1). Default 0.5. */
  vectorWeight?: number
  /** Loader for the vectors engine; defaults to `() => import('@xnetjs/vectors')`. */
  loadEngine?: VectorEngineLoader
  /** Init/backfill timeout in ms. */
  timeoutMs?: number
}

export interface VectorEntrySearch {
  /** Entry search: hybrid once the index is warm, keyword until then / on failure. */
  search(query: string, k: number): Promise<EntryHit[]>
  /** True once the semantic index is built and serving. */
  ready(): boolean
}

const DEFAULT_TIMEOUT_MS = 30_000
const RRF_K = 60

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('vector init timeout')), ms))
  ])
}

/** Embed every text-bearing node in the store into the index (cold backfill). */
async function backfill(
  index: SemanticIndexLike,
  store: GraphRetrieverStore,
  maxBackfill: number
): Promise<void> {
  const nodes = await store.list({ limit: maxBackfill })
  for (const node of nodes) {
    if (node.deleted) continue
    const { body } = nodeTextParts(node)
    if (body.length > 0) await index.indexDocument(node.id, body)
  }
}

/** Fuse vector + keyword hits via Reciprocal Rank Fusion. */
async function hybridSearch(
  index: SemanticIndexLike,
  keyword: (query: string, k: number) => Promise<EntryHit[]>,
  query: string,
  k: number,
  vectorWeight: number
): Promise<EntryHit[]> {
  const keywordWeight = 1 - vectorWeight
  const [vectorHits, keywordHits] = await Promise.all([
    index.search(query, { maxResults: k * 2 }),
    keyword(query, k * 2)
  ])

  const ranks = new Map<string, { v?: number; kw?: number }>()
  vectorHits.forEach((hit, i) => ranks.set(hit.id, { ...ranks.get(hit.id), v: i + 1 }))
  keywordHits.forEach((hit, i) => ranks.set(hit.nodeId, { ...ranks.get(hit.nodeId), kw: i + 1 }))

  const fused: EntryHit[] = []
  for (const [nodeId, rank] of ranks.entries()) {
    const score =
      (rank.v ? vectorWeight / (RRF_K + rank.v) : 0) +
      (rank.kw ? keywordWeight / (RRF_K + rank.kw) : 0)
    const source: EntryHit['source'] = rank.v && rank.kw ? 'hybrid' : rank.v ? 'vector' : 'keyword'
    fused.push({ nodeId, score, source })
  }
  fused.sort((a, b) => b.score - a.score)
  return fused.slice(0, k)
}

/**
 * Build a lazy, fallback-safe semantic entry search. Pass `.search` as the
 * `entrySearch` option of `createGraphContextRetriever`.
 */
export function createVectorEntrySearch(options: VectorEntrySearchOptions): VectorEntrySearch {
  const {
    store,
    useMockModel = false,
    storage,
    maxBackfill = 2000,
    vectorWeight = 0.5,
    timeoutMs = DEFAULT_TIMEOUT_MS
  } = options
  const keyword = keywordEntrySearch(store)
  const loadEngine: VectorEngineLoader = options.loadEngine ?? (() => import('@xnetjs/vectors'))

  let state: 'idle' | 'loading' | 'ready' | 'failed' = 'idle'
  let index: SemanticIndexLike | null = null

  async function init(): Promise<void> {
    state = 'loading'
    try {
      const engine = await withTimeout(loadEngine(), timeoutMs)
      const search = engine.createSemanticSearch({ useMockModel })
      await withTimeout(search.initialize(), timeoutMs)
      const restored = storage ? await loadVectorTier(search, storage) : false
      if (!restored) await withTimeout(backfill(search, store, maxBackfill), timeoutMs)
      index = search
      state = 'ready'
      if (storage) void saveVectorTier(search, storage).catch(() => {})
    } catch {
      // Any failure (model load, WASM, network, timeout) → stay on keyword forever.
      state = 'failed'
    }
  }

  return {
    ready: () => state === 'ready',
    async search(query, k) {
      // Kick off the (idempotent) lazy build; keyword serves until it's ready.
      if (state === 'idle') void init()
      if (state !== 'ready' || !index) return keyword(query, k)
      try {
        return await hybridSearch(index, keyword, query, k, vectorWeight)
      } catch {
        return keyword(query, k)
      }
    }
  }
}
