/**
 * Tag page data helpers (exploration 0169) — pure and unit-tested.
 *
 * The query layer's plain `where` is strict equality, so multi-valued
 * `tags` relations are filtered client-side over the same bounded
 * queries the Explorer already runs.
 */

export interface TaggedRef {
  id: string
  tags?: string[]
}

/** Nodes whose `tags` relation includes the tag. */
export function filterTagged<T extends TaggedRef>(
  nodes: T[] | null | undefined,
  tagId: string
): T[] {
  return (nodes ?? []).filter((node) => (node.tags ?? []).includes(tagId))
}

export interface TagUpdateOp {
  type: 'update'
  id: string
  data: Record<string, unknown>
}

/**
 * Mutation ops that merge `sourceId` into `targetId`: every tagged node
 * gets its tags re-pointed (deduped, order preserved), and the source
 * tag is archived — references keep resolving, pickers stop offering it.
 */
export function mergeTagOps(
  sourceId: string,
  targetId: string,
  taggedNodes: TaggedRef[]
): TagUpdateOp[] {
  if (sourceId === targetId) return []
  const ops: TagUpdateOp[] = taggedNodes
    .filter((node) => (node.tags ?? []).includes(sourceId))
    .map((node) => ({
      type: 'update' as const,
      id: node.id,
      data: {
        tags: [...new Set((node.tags ?? []).map((id) => (id === sourceId ? targetId : id)))]
      }
    }))
  ops.push({ type: 'update', id: sourceId, data: { archived: true } })
  return ops
}

export interface RankableTag {
  id: string
  name: string
}

/** Tags ordered by usage across the supplied nodes (desc), then name. */
export function rankTagsByUsage<T extends RankableTag>(tags: T[], nodes: TaggedRef[]): T[] {
  const counts = new Map<string, number>()
  for (const node of nodes) {
    for (const id of node.tags ?? []) {
      counts.set(id, (counts.get(id) ?? 0) + 1)
    }
  }
  return [...tags].sort((a, b) => {
    const byCount = (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0)
    if (byCount !== 0) return byCount
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0
  })
}
