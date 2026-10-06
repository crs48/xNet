import type { LibraryGraph, LibraryGraphNode } from '../library-graph'

export const groupNames = {
  collection: 'Playlists & collections',
  tag: 'Tags & topics',
  category: 'Categories',
  creator: 'Creator names'
}

export const normalizeSearch = (value: string) =>
  value.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase().trim()

export type GraphGroup = { node: LibraryGraphNode; count: number }

export function graphGroups(graph: LibraryGraph, platform: string): GraphGroup[] {
  const members = new Map<number, Set<number>>()
  graph.edges.forEach(({ source, target }) => {
    if (platform && graph.nodes[source].platform !== platform) return
    const links = members.get(target) ?? new Set<number>()
    links.add(source)
    members.set(target, links)
  })
  return [...members]
    .map(([index, links]) => ({ node: graph.nodes[index], count: links.size }))
    .sort((a, b) => b.count - a.count || a.node.label.localeCompare(b.node.label))
}

export function graphSearchIndex(graph: LibraryGraph) {
  const degrees = new Uint32Array(graph.nodes.length)
  graph.edges.forEach(({ source, target }) => {
    degrees[source]++
    degrees[target]++
  })
  return graph.nodes.map((node, index) => ({
    node,
    label: normalizeSearch(node.label),
    url: normalizeSearch(node.url ?? ''),
    count: degrees[index]
  }))
}

export function searchGraph(index: ReturnType<typeof graphSearchIndex>, query: string, limit = 12) {
  const text = normalizeSearch(query)
  const terms = text.split(/\s+/u)
  const matches = index.flatMap((entry) => {
    if (!text) return entry.node.kind === 'link' ? [] : [{ ...entry, rank: 0 }]
    if (!terms.every((term) => entry.label.includes(term) || entry.url.includes(term))) return []
    const rank =
      entry.label === text
        ? 0
        : entry.label.startsWith(text)
          ? 1
          : terms.every((term) =>
                entry.label.split(/[^\p{L}\p{N}]+/u).some((word) => word.startsWith(term))
              )
            ? 2
            : terms.every((term) => entry.label.includes(term))
              ? 3
              : 4
    return [{ ...entry, rank }]
  })
  matches.sort(
    (a, b) =>
      a.rank - b.rank ||
      Number(a.node.kind === 'link') - Number(b.node.kind === 'link') ||
      (a.node.kind === 'link' ? 0 : b.count - a.count) ||
      a.label.localeCompare(b.label) ||
      a.node.id.localeCompare(b.node.id)
  )
  return { total: matches.length, items: matches.slice(0, limit) }
}
