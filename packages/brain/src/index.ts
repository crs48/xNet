/**
 * @xnetjs/brain — the AI second-brain layer (exploration 0211).
 *
 * Connects three things xNet already had but never wired together:
 *   - the governed node graph (`@xnetjs/data`),
 *   - full-text / keyword search, and
 *   - the dormant vector engine (`@xnetjs/vectors`),
 *
 * into a hybrid GraphRAG retriever with a token/hop budget (so the agent is never
 * overwhelmed), an incremental embedding indexer, a Mem0-style memory planner, and
 * a locality planner that decides what stays cached locally vs on the hub.
 *
 * @example
 * ```ts
 * const brain = createBrain({
 *   store, semanticSearch, keywordProvider,
 *   relationFieldsOf: (schemaId) => schemaRelationFields(schemaId)
 * })
 * brain.indexer.start()
 * await brain.indexer.reindexAll(allNodes) // cold-start backfill
 *
 * const result = await brain.retrieve('how is Acme tied to my 2024 emails?', {
 *   maxTokens: 4000, maxHops: 2
 * })
 * // result.items  → ranked, budgeted, each with a readable graph path
 * // result.expandable → ids the agent can pull just-in-time
 * ```
 */

export * from './types'
export { estimateTokens, itemTokens, packToBudget, type PackResult } from './pack'
export {
  bfsExpand,
  nodeStoreGraphAccess,
  type ExpandedNode,
  type ExpandOptions,
  type InboundResolver,
  type NodeReader,
  type NodeStoreGraphAccessOptions,
  type RelationFieldsResolver
} from './expand'
export { retrieve } from './retrieve'
export {
  createBrainIndexer,
  defaultTextOf,
  type BrainIndexer,
  type BrainIndexerOptions,
  type DocumentIndex,
  type IndexableNode,
  type IndexableStore,
  type IndexChangeEvent
} from './indexer'
export {
  consolidateMemory,
  memoryRankScore,
  rankMemories,
  textSimilarity,
  tokenize,
  type ConsolidateOptions,
  type MemoryCandidate,
  type MemoryOp,
  type MemoryRankOptions,
  type MemoryRecord
} from './memory'
export {
  DEFAULT_WEIGHTS,
  planLocality,
  resolveQuerySource,
  scoreWorkingSet,
  type LocalityPlan,
  type PlanLocalityOptions,
  type QuerySource,
  type QuerySourcePreference,
  type ResolveSourceOptions,
  type ScoreWorkingSetOptions,
  type WorkingSetSignal,
  type WorkingSetWeights
} from './locality'
export { relationFieldsResolver, schemaRelationFields, type SchemaLike } from './schema'
export {
  applyMemoryOp,
  rememberFact,
  type AppliedMemory,
  type ApplyMemoryOptions,
  type MemoryStore
} from './memory-apply'
export {
  loadVectorTier,
  saveVectorTier,
  VECTOR_TIER_BLOB_KEY,
  type BlobStore,
  type SerializableIndex
} from './persist'

import { nodeStoreGraphAccess, type NodeReader, type RelationFieldsResolver } from './expand'
import { defaultTextOf, createBrainIndexer, type BrainIndexer, type IndexableNode } from './indexer'
import { retrieve } from './retrieve'
import {
  DEFAULT_BUDGET,
  type Authorizer,
  type EntryHit,
  type GraphEdge,
  type NodeText,
  type RetrievalBudget,
  type RetrievalResult,
  type Reranker,
  type TextLoader
} from './types'

/** A document index that can be searched semantically (e.g. `SemanticSearch`). */
interface SemanticIndex {
  indexDocument(id: string, content: string): Promise<unknown>
  removeDocument(id: string): boolean | Promise<boolean>
  search(
    query: string,
    options?: { maxResults?: number; minScore?: number }
  ): Promise<Array<{ id: string; score: number }>>
}

/** A keyword search provider (e.g. an FTS5-backed index). */
interface KeywordProvider {
  search(query: string, maxResults?: number): Promise<Array<{ id: string; score?: number }>>
}

/** The store the brain reads from and listens to. */
export type BrainStore = NodeReader & {
  subscribe(listener: (event: { node: IndexableNode | null }) => void): () => void
}

export interface CreateBrainOptions {
  store: BrainStore
  /** Semantic (vector) index — `@xnetjs/vectors` `SemanticSearch` satisfies this. */
  semanticSearch: SemanticIndex
  /** Keyword index (FTS). Optional — vector-only if omitted. */
  keywordProvider?: KeywordProvider
  /** Relation property keys per schema (from the schema registry). */
  relationFieldsOf: RelationFieldsResolver
  /** Optional inbound-edge resolver (reverse index) for graph expansion. */
  inbound?: (nodeId: string) => Promise<GraphEdge[]>
  /** Authorization gate applied to every candidate before packing. */
  authorize?: Authorizer
  /** Optional custom text loader; defaults to common text-bearing properties. */
  loadText?: TextLoader
  /** Optional reranker for the candidate set. */
  rerank?: Reranker
  /** RRF weight for vector results when fusing with keyword results (0–1). */
  vectorWeight?: number
  /** Indexer debounce window in ms. */
  debounceMs?: number
  /** Only index/expand nodes whose schema passes this predicate. */
  shouldIndex?: (node: IndexableNode) => boolean
}

export interface Brain {
  indexer: BrainIndexer
  retrieve(query: string, budget?: Partial<RetrievalBudget>): Promise<RetrievalResult>
}

const SNIPPET_MAX = 600
const RRF_K = 60

/** RRF contribution of a single ranked list (0 when the id wasn't in that list). */
function rrfContribution(rank: number | undefined, weight: number): number {
  return rank === undefined ? 0 : weight / (RRF_K + rank)
}

/** Which retrieval modes contributed to a fused hit. */
function classifyHybridSource(hasVector: boolean, hasKeyword: boolean): EntryHit['source'] {
  if (hasVector && hasKeyword) return 'hybrid'
  return hasVector ? 'vector' : 'keyword'
}

/** Reciprocal-rank-fusion of vector + keyword hits into one ranked entry list. */
async function fuseEntrySearch(
  query: string,
  k: number,
  semantic: SemanticIndex,
  keyword: KeywordProvider | undefined,
  vectorWeight: number
): Promise<EntryHit[]> {
  const keywordWeight = 1 - vectorWeight
  const [vectorHits, keywordHits] = await Promise.all([
    semantic.search(query, { maxResults: k * 2 }),
    keyword ? keyword.search(query, k * 2) : Promise.resolve([])
  ])

  const ranks = new Map<string, { v?: number; kw?: number }>()
  vectorHits.forEach((hit, i) => {
    ranks.set(hit.id, { ...ranks.get(hit.id), v: i + 1 })
  })
  keywordHits.forEach((hit, i) => {
    ranks.set(hit.id, { ...ranks.get(hit.id), kw: i + 1 })
  })

  const fused: EntryHit[] = [...ranks.entries()].map(([nodeId, rank]) => ({
    nodeId,
    score: rrfContribution(rank.v, vectorWeight) + rrfContribution(rank.kw, keywordWeight),
    source: classifyHybridSource(rank.v !== undefined, rank.kw !== undefined)
  }))
  fused.sort((a, b) => b.score - a.score)
  return fused.slice(0, k)
}

/** First non-empty line, capped, falling back to `fallback`. */
function deriveTitle(full: string, fallback: string): string {
  const firstLine = full.split('\n')[0]?.trim() ?? ''
  return firstLine.length > 0 ? firstLine.slice(0, 200) : fallback
}

/** Default text loader: title from the first text-bearing prop, snippet from all. */
function makeDefaultLoadText(store: NodeReader): TextLoader {
  return async (nodeId: string): Promise<NodeText | null> => {
    const node = await store.get(nodeId)
    if (!node || node.deleted) return null
    const full = defaultTextOf({
      id: nodeId,
      schemaId: node.schemaId,
      properties: node.properties
    })
    return {
      title: deriveTitle(full, nodeId),
      snippet: full.replace(/\s+/g, ' ').trim().slice(0, SNIPPET_MAX),
      schemaId: node.schemaId
    }
  }
}

/**
 * Wire the indexer, hybrid entry search, graph expansion, and retriever into one
 * adoptable object. This is the few-lines integration point for the app.
 */
export function createBrain(options: CreateBrainOptions): Brain {
  const {
    store,
    semanticSearch,
    keywordProvider,
    relationFieldsOf,
    inbound,
    authorize,
    rerank,
    vectorWeight = 0.5,
    debounceMs,
    shouldIndex
  } = options

  const loadText = options.loadText ?? makeDefaultLoadText(store)
  const graph = nodeStoreGraphAccess(store, { relationFieldsOf, inbound })
  const indexer = createBrainIndexer({
    store,
    index: semanticSearch,
    debounceMs,
    shouldIndex
  })

  return {
    indexer,
    retrieve(query: string, budget: Partial<RetrievalBudget> = {}): Promise<RetrievalResult> {
      const b: RetrievalBudget = { ...DEFAULT_BUDGET, ...budget }
      return retrieve(query, b, {
        entrySearch: (q, k) => fuseEntrySearch(q, k, semanticSearch, keywordProvider, vectorWeight),
        graph,
        loadText,
        authorize,
        rerank
      })
    }
  }
}
