/**
 * The hybrid GraphRAG retriever (exploration 0211, Phase 2).
 *
 *   1. Hybrid entry-node search  — vector + keyword, fused (best for "find the
 *      relevant things").
 *   2. Bounded graph expansion   — walk typed relations from those entries (best
 *      for "how are these connected", the multi-hop / sense-making queries).
 *   3. Authorization filter      — drop anything the caller can't see, BEFORE it
 *      can reach the model (exploration 0192).
 *   4. Rank + pack to budget     — keep the best within the token budget; the rest
 *      become `expandable` refs the agent pulls just-in-time.
 *
 * The function is pure over its injected `deps`, so it's exhaustively testable
 * with fakes and carries no hard dependency on the store or the vector engine.
 */
import { bfsExpand, type ExpandedNode } from './expand'
import { itemTokens, packToBudget } from './pack'
import {
  DEFAULT_BUDGET,
  type Authorizer,
  type NodeText,
  type PathStep,
  type RetrievalBudget,
  type RetrievalResult,
  type RetrievedItem,
  type RetrieveDeps
} from './types'

/** Score decay applied per hop away from an entry node. */
const HOP_DECAY = 0.55

async function passesAuthorization(
  nodeId: string,
  authorize: Authorizer | undefined
): Promise<boolean> {
  if (!authorize) return true
  try {
    return await authorize(nodeId)
  } catch {
    // Fail closed: an authorization error means "not allowed", never "allowed".
    return false
  }
}

/** Render a path as "Acme → (authored) → Quarterly email" using loaded titles. */
function renderPath(path: PathStep[], titleOf: (id: string) => string): string {
  if (path.length === 0) return ''
  const parts: string[] = [titleOf(path[0].nodeId)]
  for (let i = 1; i < path.length; i++) {
    const step = path[i]
    const arrow = step.direction === 'inbound' ? '←' : '→'
    const rel = step.relation ? ` (${step.relation}) ` : ' '
    parts.push(`${arrow}${rel}${titleOf(step.nodeId)}`)
  }
  return parts.join('')
}

/**
 * Retrieve a budgeted, citation-carrying context pack for `query`.
 */
export async function retrieve(
  query: string,
  budget: Partial<RetrievalBudget>,
  deps: RetrieveDeps
): Promise<RetrievalResult> {
  const b: RetrievalBudget = { ...DEFAULT_BUDGET, ...budget }
  const { entrySearch, graph, loadText, authorize, rerank } = deps

  // 1. Entry nodes from the hybrid search, authorized.
  const rawEntries = await entrySearch(query, b.maxEntries)
  const entries: typeof rawEntries = []
  let denied = 0
  for (const hit of rawEntries) {
    if (await passesAuthorization(hit.nodeId, authorize)) entries.push(hit)
    else denied++
  }

  // 2. Graph expansion from the authorized entry nodes.
  const seedIds = entries.map((e) => e.nodeId)
  const expandBudget = Math.max(0, b.maxNodes - entries.length)
  const expandedRaw = await bfsExpand(seedIds, graph, {
    maxHops: b.maxHops,
    maxNodes: expandBudget
  })
  const expanded: ExpandedNode[] = []
  for (const node of expandedRaw) {
    if (await passesAuthorization(node.nodeId, authorize)) expanded.push(node)
    else denied++
  }

  // 3. Assemble candidates (entries at hop 0, then expanded), load their text.
  const entryScore = new Map(entries.map((e) => [e.nodeId, e]))
  const titleCache = new Map<string, string>()
  const candidates: RetrievedItem[] = []

  const addCandidate = async (
    nodeId: string,
    hops: number,
    path: PathStep[],
    baseScore: number,
    source: RetrievedItem['source']
  ): Promise<void> => {
    const text: NodeText | null = await loadText(nodeId)
    if (!text) return
    titleCache.set(nodeId, text.title)
    candidates.push({
      nodeId,
      title: text.title,
      snippet: text.snippet,
      score: baseScore * Math.pow(HOP_DECAY, hops),
      hops,
      source,
      path,
      pathLabel: '',
      estTokens: itemTokens(text)
    })
  }

  for (const entry of entries) {
    await addCandidate(entry.nodeId, 0, [{ nodeId: entry.nodeId }], entry.score, entry.source)
  }
  for (const node of expanded) {
    // An expanded node inherits its seed's relevance, decayed by distance.
    const seedHit = entryScore.get(node.seed)
    const base = seedHit ? seedHit.score : 1
    await addCandidate(node.nodeId, node.hops, node.path, base, 'graph')
  }

  // 4. Optional rerank overrides the heuristic score.
  if (rerank && candidates.length > 0) {
    const scores = await rerank(query, candidates)
    for (const candidate of candidates) {
      const s = scores.get(candidate.nodeId)
      if (typeof s === 'number') candidate.score = s
    }
  }

  // Render readable paths now that every title is loaded.
  const titleOf = (id: string): string => titleCache.get(id) ?? id
  for (const candidate of candidates) {
    candidate.pathLabel = renderPath(candidate.path, titleOf)
  }

  // 5. Rank and pack to the token budget.
  candidates.sort((a, b2) => b2.score - a.score || a.hops - b2.hops)
  const packed = packToBudget(candidates, b.maxTokens)

  return {
    items: packed.kept,
    expandable: packed.dropped,
    stats: {
      entries: entries.length,
      expanded: expanded.length,
      denied,
      dropped: packed.dropped.length,
      tokens: packed.tokens,
      truncated: packed.truncated
    }
  }
}
