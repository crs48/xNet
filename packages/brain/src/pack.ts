/**
 * Token estimation and budget packing — the concrete "don't overwhelm the agent"
 * mechanism. We greedily keep the highest-scored items until the token budget is
 * spent; everything else becomes an `expandable` reference (JIT retrieval).
 */
import type { ExpandableRef, RetrievedItem } from './types'

/**
 * Rough token estimate. Without a tokenizer dependency we use the well-worn
 * ~4-characters-per-token heuristic plus a small per-item overhead for the
 * title/framing the consumer wraps around each resource.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0
  return Math.ceil(text.length / 4)
}

/** Tokens an item costs once title + snippet + a little framing are counted. */
export function itemTokens(item: { title: string; snippet: string }): number {
  // +8 covers the markdown framing ("## <title>\n") the surface adds per resource.
  return estimateTokens(item.title) + estimateTokens(item.snippet) + 8
}

export interface PackResult {
  kept: RetrievedItem[]
  dropped: ExpandableRef[]
  tokens: number
  truncated: boolean
}

/**
 * Greedily pack already-sorted items into the token budget.
 *
 * @param items   Candidates, assumed sorted best-first.
 * @param maxTokens  Hard ceiling on total estimated tokens.
 */
export function packToBudget(items: RetrievedItem[], maxTokens: number): PackResult {
  const kept: RetrievedItem[] = []
  const dropped: ExpandableRef[] = []
  let tokens = 0

  for (const item of items) {
    const cost = item.estTokens
    // Always allow at least one item through, even if it alone exceeds budget —
    // returning nothing is worse than returning one over-budget result.
    if (kept.length > 0 && tokens + cost > maxTokens) {
      dropped.push({
        nodeId: item.nodeId,
        title: item.title,
        reason:
          item.hops > 0
            ? `${item.hops}-hop neighbor, dropped for token budget`
            : 'relevant match, dropped for token budget'
      })
      continue
    }
    kept.push(item)
    tokens += cost
  }

  return { kept, dropped, tokens, truncated: dropped.length > 0 }
}
