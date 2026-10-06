import type { LibraryGraph, LibraryGraphRelation } from '../library-graph'

export const relationKinds: LibraryGraphRelation[] = ['collection', 'tag', 'category', 'creator']
export const graphColors: Record<string, string> = {
  youtube: '#fb7185',
  instagram: '#e879f9',
  github: '#c4b5fd',
  x: '#7dd3fc',
  tiktok: '#2dd4bf',
  reddit: '#fb923c',
  generic: '#a3e635',
  openai: '#6ee7b7',
  claude: '#fcd34d',
  grok: '#94a3b8',
  collection: '#fbbf24',
  tag: '#a78bfa',
  category: '#67e8f9',
  creator: '#fda4af'
}
export const graphColor = (kind: string, platform: string) =>
  graphColors[kind === 'link' ? platform : kind] ?? '#cbd5e1'

export function graphAdjacency(graph: LibraryGraph): number[][] {
  const adjacency = graph.nodes.map(() => [] as number[])
  graph.edges.forEach(({ source, target }) => {
    adjacency[source].push(target)
    adjacency[target].push(source)
  })
  return adjacency
}

export function selectGraph(
  graph: LibraryGraph,
  platform: string,
  kinds: LibraryGraphRelation[],
  focus: string | null,
  groups: string[] = [],
  match: 'any' | 'all' = 'any'
): LibraryGraph {
  const accepted = new Set(kinds)
  const selected = new Set(groups)
  const memberships = new Map<number, Set<string>>()
  if (selected.size) {
    // Group membership filters do not depend on which relationship lines are shown.
    graph.edges.forEach(({ source, target }) => {
      const group = graph.nodes[target].id
      if (!selected.has(group)) return
      const values = memberships.get(source) ?? new Set<string>()
      values.add(group)
      memberships.set(source, values)
    })
  }
  const included = new Set(
    graph.nodes.flatMap((node, index) =>
      node.kind === 'link' &&
      (!platform || node.platform === platform) &&
      (!selected.size ||
        (match === 'all' ? memberships.get(index)?.size === selected.size : memberships.has(index)))
        ? [index]
        : []
    )
  )
  const edges = graph.edges.filter((edge) => accepted.has(edge.kind) && included.has(edge.source))
  let scope: Set<number> | null = null
  if (focus) {
    const center = graph.nodes.findIndex((node) => node.id === focus)
    scope = new Set([center])
    // Two hops from a link includes other links with the same known relationship.
    for (let hop = 0; hop < (graph.nodes[center]?.kind === 'link' ? 2 : 1); hop++) {
      const previous = new Set(scope)
      edges.forEach((edge) => {
        if (previous.has(edge.source)) scope!.add(edge.target)
        if (previous.has(edge.target)) scope!.add(edge.source)
      })
    }
  }
  const chosenEdges = edges.filter(
    (edge) => !scope || (scope.has(edge.source) && scope.has(edge.target))
  )
  const hubs = new Set(chosenEdges.map((edge) => edge.target))
  const indices = new Map<number, number>()
  const nodes = graph.nodes.filter((node, i) => {
    const visible = node.kind === 'link' ? included.has(i) && (!scope || scope.has(i)) : hubs.has(i)
    if (visible) indices.set(i, indices.size)
    return visible
  })
  return {
    ...graph,
    nodes,
    linkCount: nodes.filter((node) => node.kind === 'link').length,
    edges: chosenEdges
      .filter((edge) => indices.has(edge.source) && indices.has(edge.target))
      .map((edge) => ({
        ...edge,
        source: indices.get(edge.source)!,
        target: indices.get(edge.target)!
      }))
  }
}

export function initialPositions(graph: Pick<LibraryGraph, 'nodes' | 'edges'>): Float32Array {
  const result = new Float32Array(graph.nodes.length * 3)
  const hubs = graph.nodes.flatMap((node, i) => (node.kind !== 'link' ? [i] : []))
  const radius = Math.max(80, Math.cbrt(graph.nodes.length) * 28)
  graph.nodes.forEach((node, i) => {
    let hash = 2166136261
    for (const character of node.id) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619)
    for (let axis = 0; axis < 3; axis++) {
      hash = Math.imul(hash ^ (hash >>> 16), 2246822507)
      result[i * 3 + axis] = ((hash >>> 0) / 4294967296 - 0.5) * radius * 2
    }
    const length = Math.hypot(result[i * 3], result[i * 3 + 1], result[i * 3 + 2]) || 1
    const scale = (radius * Math.cbrt((hash >>> 0) / 4294967296)) / length
    for (let axis = 0; axis < 3; axis++) result[i * 3 + axis] *= scale
  })
  hubs.forEach((index, i) => {
    const y = 1 - (2 * (i + 0.5)) / hubs.length
    const ring = Math.sqrt(1 - y * y)
    result.set(
      [Math.cos(i * 2.399963) * ring * radius, y * radius, Math.sin(i * 2.399963) * ring * radius],
      index * 3
    )
  })
  const weights = new Float32Array(graph.nodes.length)
  const centers = new Float32Array(result.length)
  graph.edges.forEach(({ source, target }) => {
    weights[source]++
    for (let axis = 0; axis < 3; axis++) centers[source * 3 + axis] += result[target * 3 + axis]
  })
  graph.nodes.forEach((_node, i) => {
    if (!weights[i]) return
    for (let axis = 0; axis < 3; axis++)
      result[i * 3 + axis] = centers[i * 3 + axis] / weights[i] + result[i * 3 + axis] * 0.12
  })
  return result
}
