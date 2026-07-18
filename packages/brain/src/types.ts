/**
 * @xnetjs/brain — shared types for the AI second-brain layer (exploration 0211).
 *
 * The "brain" is the thin layer that connects three assets xNet already has but
 * never wired together: the governed node graph (`@xnetjs/data`), full-text
 * search, and the dormant vector engine (`@xnetjs/vectors`). It turns them into
 * a hybrid GraphRAG retriever that hands an agent a small, ranked, budgeted slice
 * of the graph — plus the means to expand — instead of the whole thing.
 */

/** How a candidate entered the retrieval set. */
export type RetrievalSource = 'vector' | 'keyword' | 'hybrid' | 'graph'

/** Direction of a typed relation edge, mirroring `QueryASTRelationInclude`. */
export type EdgeDirection = 'outbound' | 'inbound'

/**
 * The anti-overwhelm knobs. Retrieval never returns more than this — the rest of
 * the graph stays reachable as `expandable` references the agent can pull
 * just-in-time (the context-rot fix from exploration 0211).
 */
export interface RetrievalBudget {
  /** Hard cap on the estimated tokens of returned context. */
  maxTokens: number
  /** How many hops of graph expansion to walk from the entry nodes. */
  maxHops: number
  /** Ceiling on entry nodes pulled from the hybrid search. */
  maxEntries: number
  /** Ceiling on total nodes (entries + expanded) considered before packing. */
  maxNodes: number
}

/** Sensible defaults: small entry set, shallow walk, modest token budget. */
export const DEFAULT_BUDGET: RetrievalBudget = {
  maxTokens: 4000,
  maxHops: 1,
  maxEntries: 12,
  maxNodes: 60
}

/** An entry hit from the hybrid (vector + keyword) search. */
export interface EntryHit {
  nodeId: string
  /** Normalized relevance score from the search layer (higher is better). */
  score: number
  source: RetrievalSource
}

/** One typed edge out of a node. */
export interface GraphEdge {
  nodeId: string
  /** The relation property the edge came from (e.g. `references`, `authored`). */
  relation: string
  direction: EdgeDirection
}

/**
 * The only graph capability the retriever needs. Implemented for a real
 * `NodeStore` by `nodeStoreGraphAccess`, and trivially faked in tests.
 */
export interface GraphAccess {
  neighbors(nodeId: string): Promise<GraphEdge[]>
}

/** Hybrid entry-node search: vector + keyword, fused. */
export type EntrySearch = (query: string, k: number) => Promise<EntryHit[]>

/** The displayable text the retriever attaches to each hit. */
export interface NodeText {
  title: string
  snippet: string
  schemaId?: string
}

/** Loads the title/snippet for a node id (typically off the `NodeStore`). */
export type TextLoader = (nodeId: string) => Promise<NodeText | null>

/**
 * Authorization gate. Retrieval filters candidates through this BEFORE packing,
 * so a shared/collaborative brain can never surface a node across an authz
 * boundary (exploration 0192). Defaults to allow-all when omitted.
 */
export type Authorizer = (nodeId: string) => boolean | Promise<boolean>

/** One step of a readable graph path from an entry node to a hit. */
export interface PathStep {
  nodeId: string
  relation?: string
  direction?: EdgeDirection
}

/** A node that made it into the returned context pack. */
export interface RetrievedItem {
  nodeId: string
  title: string
  snippet: string
  /** Final ranking score after hop decay / rerank. */
  score: number
  /** 0 for entry nodes, ≥1 for graph-expanded nodes. */
  hops: number
  source: RetrievalSource
  /** The graph path from the entry node — "a sentence a human can read". */
  path: PathStep[]
  /** Human-readable rendering of `path` using loaded titles. */
  pathLabel: string
  estTokens: number
}

/** A node we found but dropped for budget — the agent can pull it via a tool. */
export interface ExpandableRef {
  nodeId: string
  title: string
  reason: string
}

export interface RetrievalStats {
  entries: number
  expanded: number
  /** Candidates removed by the authorization gate. */
  denied: number
  /** Candidates dropped to stay under the token budget. */
  dropped: number
  tokens: number
  truncated: boolean
}

export interface RetrievalResult {
  items: RetrievedItem[]
  expandable: ExpandableRef[]
  stats: RetrievalStats
}

/** Optional reranker — given the query and candidates, returns scores by nodeId. */
export type Reranker = (
  query: string,
  candidates: RetrievedItem[]
) => Map<string, number> | Promise<Map<string, number>>

/** Everything `retrieve()` needs, all injectable so the core stays pure. */
export interface RetrieveDeps {
  entrySearch: EntrySearch
  graph: GraphAccess
  loadText: TextLoader
  authorize?: Authorizer
  rerank?: Reranker
}
