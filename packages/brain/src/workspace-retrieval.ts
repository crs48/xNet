/**
 * One retriever, every lane (exploration 0415).
 *
 * `retrieve()` is pure and injectable, which is why it was easy to wire into the
 * in-app assistant and easy to forget everywhere else. The result was an
 * asymmetry: the workbench got hybrid GraphRAG while every coding-agent lane
 * (`xnet` CLI, `xnet mcp serve`, the Electron bridge) built an AI surface with
 * no retriever at all and silently fell back to a substring scan over the first
 * 500 nodes.
 *
 * This factory is the single construction path. It assembles the best retrieval
 * the backend can actually support, and — the load-bearing part — **returns the
 * tier it settled for** so callers can report a degraded search instead of
 * rendering it identically to an exhaustive one.
 *
 * Two deliberate design choices:
 *
 * - `authorize` is **required**, not optional. Graph expansion walks edges out
 *   of matched nodes; without a gate it will happily surface a node the caller
 *   could never have read directly. Better retrieval widens whatever egress
 *   hole exists, so the gate is not something a call site gets to forget.
 * - `tier: 'scan'` is a value the caller must handle, not a fallback hidden
 *   inside the search path.
 */

import { bfsExpand } from './expand'
import { retrieve } from './retrieve'
import {
  DEFAULT_BUDGET,
  type Authorizer,
  type EntryHit,
  type EntrySearch,
  type GraphAccess,
  type GraphEdge,
  type NodeText,
  type RetrievalBudget,
  type RetrievalResult
} from './types'

// ─── The backend surface we need ─────────────────────────────────────────────

/** The minimal node shape retrieval reads (a `NodeState`/`NodeData` satisfies it). */
export interface RetrievalNode {
  id: string
  schemaId: string
  properties: Record<string, unknown>
  deleted?: boolean
}

/** The minimal store surface retrieval reads. */
export interface RetrievalStore {
  get(id: string): Promise<RetrievalNode | null>
  list(options?: { schemaId?: string; limit?: number; offset?: number }): Promise<RetrievalNode[]>
  /**
   * Cross-schema FTS5 search. `null` (or absent) means this storage has no
   * index — the honest signal that entry search must degrade to a scan.
   */
  searchText?(
    query: string,
    limit: number,
    options?: { schemaId?: string }
  ): Promise<Array<{ nodeId: string; rank: number }> | null>
}

/** Resolve the relation-valued property names of a schema (sync or async). */
export type RelationFieldsLookup = (schemaId: string) => readonly string[] | Promise<readonly string[]>

// ─── Tiers ───────────────────────────────────────────────────────────────────

/**
 * What retrieval actually ran, best to worst.
 *
 * - `hybrid-graph` — semantic + BM25 entry search, then bounded graph expansion
 * - `bm25-graph`   — BM25 entry search, then bounded graph expansion
 * - `bm25`         — BM25 entry search only (graph expansion disabled)
 * - `scan`         — substring match over a bounded window. **Degraded.**
 */
export type RetrievalTier = 'hybrid-graph' | 'bm25-graph' | 'bm25' | 'scan'

/** Tiers that cannot claim to have searched the whole workspace. */
export const DEGRADED_TIERS: readonly RetrievalTier[] = ['scan']

export function isDegradedTier(tier: RetrievalTier): boolean {
  return DEGRADED_TIERS.includes(tier)
}

/**
 * An authorizer that permits every node.
 *
 * Legitimate only where the caller *is* the store owner and the store has
 * already applied its own read authorization — the single-user CLI and desktop
 * lanes. Spelled out at each call site on purpose: it is greppable, and a
 * shared or passport-scoped lane that reaches for it is visible in review.
 */
export const ALLOW_ALL_NODES: Authorizer = () => true

// ─── Options / result ────────────────────────────────────────────────────────

export interface WorkspaceRetrievalOptions {
  store: RetrievalStore
  /** Relation fields per schema. Return `[]` to disable expansion for a schema. */
  relationFieldsOf: RelationFieldsLookup
  /**
   * Read gate applied before anything reaches the model. Required — see the
   * module header. Pass {@link ALLOW_ALL_NODES} for owner-scoped lanes.
   */
  authorize: Authorizer
  /** Semantic entry search; when present the tier becomes `hybrid-graph`. */
  semanticEntrySearch?: EntrySearch
  /** Budget overrides merged over {@link DEFAULT_BUDGET}. */
  budget?: Partial<RetrievalBudget>
  /** How many nodes the degraded scan may read. */
  scanLimit?: number
  /** Characters of body text kept per hit. */
  snippetMax?: number
}

export interface RecallResult extends RetrievalResult {
  tier: RetrievalTier
  degraded: boolean
  /** Present when `degraded` — why, in words a caller can print verbatim. */
  notice?: string
}

export interface WorkspaceRetrieval {
  /** The best tier this backend supports. */
  readonly tier: RetrievalTier
  readonly degraded: boolean
  /** Human-readable warning when degraded; `undefined` otherwise. */
  readonly notice: string | undefined
  /** Shaped for `AiSurfaceServiceConfig.retrieveContext`. */
  retrieveContext(query: string, options: { limit: number }): Promise<AiRetrievedNodeLike[]>
  /** The full budgeted pack, with provenance paths and expandable refs. */
  recall(query: string, budget?: Partial<RetrievalBudget>): Promise<RecallResult>
}

/** Structurally identical to the AI surface's `AiRetrievedNode`, without the import. */
export interface AiRetrievedNodeLike {
  nodeId: string
  pathLabel?: string
}

const DEFAULT_SCAN_LIMIT = 500
const DEFAULT_SNIPPET_MAX = 600

const SCAN_NOTICE =
  'Full-text index unavailable — matched by substring over a bounded window of nodes only. ' +
  'Results may be incomplete; do not conclude that something does not exist from this search alone.'

const TEXT_KEYS = [
  'title',
  'name',
  'displayName',
  'label',
  'subject',
  'summary',
  'description',
  'text',
  'body',
  'content',
  'bio',
  'caption'
] as const

/** Title (first text-bearing property) + joined body of a node's text. */
export function nodeTextParts(node: RetrievalNode): { title: string; body: string } {
  const parts: string[] = []
  for (const key of TEXT_KEYS) {
    const value = node.properties[key]
    if (typeof value === 'string' && value.trim().length > 0) parts.push(value.trim())
  }
  return { title: parts[0]?.slice(0, 200) ?? node.id, body: parts.join('\n') }
}

// ─── Entry search ────────────────────────────────────────────────────────────

/** BM25 entry search over `store.searchText`. Returns `null` when there is no index. */
export function bm25EntrySearch(store: RetrievalStore): EntrySearch | null {
  if (!store.searchText) return null
  const searchText = store.searchText.bind(store)
  return async (query, k) => {
    const matches = await searchText(query, k)
    // `null` means the storage answered "I have no index". Surfacing an empty
    // array instead would read as "nothing matched" — the exact confusion this
    // whole module exists to prevent.
    if (matches === null || matches === undefined) throw new NoTextIndexError()
    // BM25 rank: more negative is better. Negate so bigger score wins.
    return matches.map((match) => ({
      nodeId: match.nodeId,
      score: -match.rank,
      source: 'keyword' as const
    }))
  }
}

/** Raised when a store advertised `searchText` but answered `null` at call time. */
export class NoTextIndexError extends Error {
  readonly _tag = 'NoTextIndexError'
  constructor() {
    super('Store reported no full-text index for this query')
    this.name = 'NoTextIndexError'
  }
}

/** Title-boosted substring scan over a bounded window. The degraded path. */
export function scanEntrySearch(store: RetrievalStore, scanLimit: number): EntrySearch {
  return async (query, k) => {
    const needle = query.trim().toLocaleLowerCase()
    if (!needle) return []
    const nodes = await store.list({ limit: scanLimit })
    const hits: EntryHit[] = []
    for (const node of nodes) {
      if (node.deleted) continue
      const { title, body } = nodeTextParts(node)
      const index = `${title}\n${body}`.toLocaleLowerCase().indexOf(needle)
      if (index === -1) continue
      const titleMatch = title.toLocaleLowerCase().includes(needle)
      hits.push({
        nodeId: node.id,
        score: (titleMatch ? 10 : 1) + Math.max(0, 5 - index / 100),
        source: 'keyword'
      })
    }
    hits.sort((a, b) => b.score - a.score)
    return hits.slice(0, k)
  }
}

/**
 * Fuse semantic and keyword hits by reciprocal rank, the standard hybrid
 * combiner: robust to the two scorers living on incomparable scales.
 */
export function fuseByReciprocalRank(semantic: EntrySearch, keyword: EntrySearch): EntrySearch {
  const K = 60
  return async (query, k) => {
    const [semanticHits, keywordHits] = await Promise.all([
      semantic(query, k).catch(() => [] as EntryHit[]),
      keyword(query, k)
    ])
    const fused = new Map<string, EntryHit>()
    const fold = (hits: EntryHit[], source: 'vector' | 'keyword'): void => {
      hits.forEach((hit, rank) => {
        const contribution = 1 / (K + rank + 1)
        const existing = fused.get(hit.nodeId)
        if (existing) {
          existing.score += contribution
          existing.source = 'hybrid'
        } else {
          fused.set(hit.nodeId, { nodeId: hit.nodeId, score: contribution, source })
        }
      })
    }
    fold(semanticHits, 'vector')
    fold(keywordHits, 'keyword')
    return [...fused.values()].sort((a, b) => b.score - a.score).slice(0, k)
  }
}

// ─── Graph + text ────────────────────────────────────────────────────────────

function schemaGraphAccess(store: RetrievalStore, relationFieldsOf: RelationFieldsLookup): GraphAccess {
  return {
    async neighbors(nodeId) {
      const node = await store.get(nodeId)
      if (!node || node.deleted) return []
      const edges: GraphEdge[] = []
      for (const field of await relationFieldsOf(node.schemaId)) {
        const value = node.properties[field]
        const targets = Array.isArray(value) ? value : [value]
        for (const target of targets) {
          if (typeof target === 'string' && target.length > 0) {
            edges.push({ nodeId: target, relation: field, direction: 'outbound' })
          }
        }
      }
      return edges
    }
  }
}

function nodeTextLoader(
  store: RetrievalStore,
  snippetMax: number
): (id: string) => Promise<NodeText | null> {
  return async (id) => {
    const node = await store.get(id)
    if (!node || node.deleted) return null
    const { title, body } = nodeTextParts(node)
    return {
      title,
      snippet: body.replace(/\s+/g, ' ').trim().slice(0, snippetMax),
      schemaId: node.schemaId
    }
  }
}

// ─── The factory ─────────────────────────────────────────────────────────────

/**
 * Build the best retrieval this backend supports, and say which one that is.
 *
 * @example
 * ```ts
 * const retrieval = createWorkspaceRetrieval({
 *   store,
 *   relationFieldsOf,
 *   authorize: ALLOW_ALL_NODES // single-user CLI lane; store enforces its own reads
 * })
 * if (retrieval.degraded) process.stderr.write(`${retrieval.notice}\n`)
 * createAiSurfaceService({ store, schemas, retrieveContext: retrieval.retrieveContext })
 * ```
 */
export function createWorkspaceRetrieval(
  options: WorkspaceRetrievalOptions
): WorkspaceRetrieval {
  const {
    store,
    relationFieldsOf,
    authorize,
    semanticEntrySearch,
    scanLimit = DEFAULT_SCAN_LIMIT,
    snippetMax = DEFAULT_SNIPPET_MAX
  } = options

  const budgetDefaults: RetrievalBudget = { ...DEFAULT_BUDGET, ...options.budget }
  const graph = schemaGraphAccess(store, relationFieldsOf)
  const loadText = nodeTextLoader(store, snippetMax)
  const scan = scanEntrySearch(store, scanLimit)
  const keyword = bm25EntrySearch(store)

  const indexed = keyword !== null
  const expands = budgetDefaults.maxHops > 0

  const tier: RetrievalTier = !indexed
    ? 'scan'
    : semanticEntrySearch
      ? 'hybrid-graph'
      : expands
        ? 'bm25-graph'
        : 'bm25'

  const degraded = isDegradedTier(tier)
  const notice = degraded ? SCAN_NOTICE : undefined

  /**
   * A store that advertised `searchText` can still answer `null` at call time
   * (a storage swap, a query FTS5 cannot parse). Falling back to the scan keeps
   * the answer useful; `onFallback` is how the caller learns the tier it
   * actually got, rather than the one it was promised at construction.
   */
  const buildEntrySearch = (onFallback: () => void): EntrySearch => {
    const indexedOrScan: EntrySearch = async (query, k) => {
      if (!keyword) return scan(query, k)
      try {
        return await keyword(query, k)
      } catch (err) {
        if (err instanceof NoTextIndexError) {
          onFallback()
          return scan(query, k)
        }
        throw err
      }
    }
    return semanticEntrySearch
      ? fuseByReciprocalRank(semanticEntrySearch, indexedOrScan)
      : indexedOrScan
  }

  const recall = async (
    query: string,
    budgetOverride?: Partial<RetrievalBudget>
  ): Promise<RecallResult> => {
    const budget: RetrievalBudget = { ...budgetDefaults, ...budgetOverride }
    let ranAt: RetrievalTier = budget.maxHops > 0 ? tier : indexed ? 'bm25' : 'scan'
    const result = await retrieve(query, budget, {
      entrySearch: buildEntrySearch(() => {
        ranAt = 'scan'
      }),
      graph,
      loadText,
      authorize
    })
    const ranDegraded = isDegradedTier(ranAt)
    return {
      ...result,
      tier: ranAt,
      degraded: ranDegraded,
      ...(ranDegraded ? { notice: SCAN_NOTICE } : {})
    }
  }

  // Arrow properties, not methods: call sites pass these straight into
  // `retrieveContext` seams, and an unbound method would lose its receiver.
  const retrieveContext = async (
    query: string,
    { limit }: { limit: number }
  ): Promise<AiRetrievedNodeLike[]> => {
    const result = await recall(query, {
      maxEntries: Math.max(limit, 4),
      maxNodes: Math.max(limit * 4, 24)
    })
    return result.items.map((item) => ({ nodeId: item.nodeId, pathLabel: item.pathLabel }))
  }

  return { tier, degraded, notice, retrieveContext, recall }
}

/** Re-exported so callers can build a graph walk without a second import. */
export { bfsExpand }
