/**
 * Graph-aware context retriever for the AI chat (exploration 0211 — live wiring).
 *
 * This is the app-side glue that injects `@xnetjs/brain`'s `retrieve()` into the
 * `AiSurfaceService` via its `retrieveContext` seam. Instead of the flat keyword
 * scan the context pack used before, the assistant now gets a graph-walked,
 * budgeted slice: keyword entry search over the local NodeStore, then bounded
 * expansion along typed relations (resolved from the schema registry), with each
 * hit carrying a readable provenance path.
 *
 * Deliberately uses **no embedding model** — entry search is keyword-only — so it
 * adds zero boot weight and no heavy bundle dependency (the 0204 cold-start
 * constraint). The vector tier can later swap in behind the same seam without
 * touching this call site.
 */
import type { AiContextRetriever } from '@xnetjs/plugins'
import {
  retrieve,
  schemaRelationFields,
  type EntryHit,
  type GraphAccess,
  type GraphEdge,
  type NodeText,
  type RetrievalBudget
} from '@xnetjs/brain'
import { schemaRegistry, type SchemaIRI } from '@xnetjs/data'

/** The minimal node shape the retriever reads (a `NodeState` satisfies it). */
export interface GraphRetrieverNode {
  id: string
  schemaId: string
  properties: Record<string, unknown>
  deleted: boolean
}

/** The minimal NodeStore surface the retriever reads. */
export interface GraphRetrieverStore {
  get(id: string): Promise<GraphRetrieverNode | null>
  list(options?: { limit?: number }): Promise<GraphRetrieverNode[]>
  /**
   * Cross-schema FTS5 search (`NodeStore.searchText`, exploration 0391).
   * `null`/absent means no FTS in this storage — fall back to scanning.
   */
  searchText?(query: string, limit: number): Promise<Array<{ nodeId: string; rank: number }> | null>
}

/** Resolve the relation-valued property names for a schema. */
export type RelationFieldsLookup = (schemaId: string) => Promise<readonly string[]>

export interface GraphContextRetrieverOptions {
  /** Relation-field resolver; defaults to the global client schema registry. */
  relationFieldsOf?: RelationFieldsLookup
  /** Override the retrieval budget. */
  budget?: Partial<RetrievalBudget>
  /**
   * Override the entry search (the seam the semantic/vector tier swaps in behind,
   * exploration 0211). Defaults to keyword search over the local store.
   */
  entrySearch?: (query: string, k: number) => Promise<EntryHit[]>
}

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

const SCAN_LIMIT = 500
const SNIPPET_MAX = 600
const DEFAULT_BUDGET: RetrievalBudget = {
  maxTokens: 24_000,
  maxHops: 1,
  maxEntries: 12,
  maxNodes: 48
}

/** Title (first text-bearing property) + joined body of a node's text. */
export function nodeTextParts(node: GraphRetrieverNode): { title: string; body: string } {
  const parts: string[] = []
  for (const key of TEXT_KEYS) {
    const value = node.properties[key]
    if (typeof value === 'string' && value.trim().length > 0) parts.push(value.trim())
  }
  return { title: parts[0]?.slice(0, 200) ?? node.id, body: parts.join('\n') }
}

/** Default relation-field resolver backed by the global schema registry (memoized). */
function registryRelationFields(): RelationFieldsLookup {
  const cache = new Map<string, readonly string[]>()
  return async (schemaId) => {
    const cached = cache.get(schemaId)
    if (cached) return cached
    const defined = await schemaRegistry.get(schemaId as SchemaIRI)
    const fields = defined ? schemaRelationFields(defined) : []
    cache.set(schemaId, fields)
    return fields
  }
}

/**
 * Keyword entry search. Prefers the indexed FTS5 path (`store.searchText`,
 * BM25-ranked over `nodes_fts` — exploration 0379's fix, wired in 0391); falls
 * back to the title-boosted substring scan when the storage has no FTS
 * (memory adapter, sql.js).
 */
export function keywordEntrySearch(
  store: GraphRetrieverStore
): (query: string, k: number) => Promise<EntryHit[]> {
  return async (query, k) => {
    const needle = query.trim().toLocaleLowerCase()
    if (!needle) return []
    if (store.searchText) {
      const matches = await store.searchText(query, k).catch(() => null)
      if (matches !== null && matches !== undefined) {
        // BM25 rank: more negative = better. Negate so bigger score wins,
        // matching EntryHit's convention.
        return matches.map((match) => ({
          nodeId: match.nodeId,
          score: -match.rank,
          source: 'keyword' as const
        }))
      }
    }
    const nodes = await store.list({ limit: SCAN_LIMIT })
    const hits: EntryHit[] = []
    for (const node of nodes) {
      if (node.deleted) continue
      const { title, body } = nodeTextParts(node)
      const idx = `${title}\n${body}`.toLocaleLowerCase().indexOf(needle)
      if (idx === -1) continue
      const titleMatch = title.toLocaleLowerCase().includes(needle)
      hits.push({
        nodeId: node.id,
        score: (titleMatch ? 10 : 1) + Math.max(0, 5 - idx / 100),
        source: 'keyword'
      })
    }
    hits.sort((a, b) => b.score - a.score)
    return hits.slice(0, k)
  }
}

/** Graph access that reads outbound relation edges, schema-resolved + memoized. */
function schemaGraphAccess(
  store: GraphRetrieverStore,
  relationFieldsOf: RelationFieldsLookup
): GraphAccess {
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

/** Load a node's title/snippet for the retrieved context. */
function nodeTextLoader(store: GraphRetrieverStore): (id: string) => Promise<NodeText | null> {
  return async (id) => {
    const node = await store.get(id)
    if (!node || node.deleted) return null
    const { title, body } = nodeTextParts(node)
    return {
      title,
      snippet: body.replace(/\s+/g, ' ').trim().slice(0, SNIPPET_MAX),
      schemaId: node.schemaId
    }
  }
}

/**
 * Build a graph-aware `AiContextRetriever` over the local NodeStore. Wire it into
 * `createAiSurfaceService({ store, schemas, retrieveContext })`.
 */
export function createGraphContextRetriever(
  store: GraphRetrieverStore,
  options: GraphContextRetrieverOptions = {}
): AiContextRetriever {
  const relationFieldsOf = options.relationFieldsOf ?? registryRelationFields()
  const graph = schemaGraphAccess(store, relationFieldsOf)
  const loadText = nodeTextLoader(store)
  const entrySearch = options.entrySearch ?? keywordEntrySearch(store)

  return async (query, { limit }) => {
    const budget: RetrievalBudget = {
      ...DEFAULT_BUDGET,
      maxEntries: Math.max(limit, 4),
      maxNodes: Math.max(limit * 4, 24),
      ...options.budget
    }
    const result = await retrieve(query, budget, { entrySearch, graph, loadText })
    return result.items.map((item) => ({ nodeId: item.nodeId, pathLabel: item.pathLabel }))
  }
}
