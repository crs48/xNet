import type { LibraryGraph } from './library-graph'
import { initialPositions } from './library-graph/model'

/** Ephemeral viewer projection, not a persisted Library schema. */
export type SpatialSnapshot = {
  revision: string
  layoutRevision: string
  graph: LibraryGraph
  positions: number[]
}
export type SpatialDetail = {
  id: string
  title: string
  description: string
  platform: string
  author: string
  coverage: Record<string, { state: string; reason?: string }>
  transcript: { source: string; language: string; cues: number } | null
  thumbnail: boolean
  text?: string
}
export interface SpatialLibraryAdapter {
  snapshot(signal: AbortSignal): Promise<SpatialSnapshot>
  detail(id: string, signal: AbortSignal, text?: boolean): Promise<SpatialDetail | null>
  thumbnail(id: string, signal: AbortSignal): Promise<Blob | null>
  close(): void
}

export function createSpatialSnapshot(graph: LibraryGraph, revision: string): SpatialSnapshot {
  const raw = initialPositions(graph)
  let radius = 1
  for (let i = 0; i < raw.length; i += 3)
    radius = Math.max(radius, Math.hypot(raw[i], raw[i + 1], raw[i + 2]))
  // A four-metre overview with its center ahead of a stationary viewer.
  const positions = Array.from(
    raw,
    (value, i) => (value / radius) * 2 + (i % 3 === 1 ? 1.4 : i % 3 === 2 ? -3 : 0)
  )
  return { revision, layoutRevision: revision, graph, positions }
}

export function validateSpatialSnapshot(value: SpatialSnapshot): SpatialSnapshot {
  const { graph, positions, revision, layoutRevision } = value
  if (
    typeof revision !== 'string' ||
    !revision ||
    revision !== layoutRevision ||
    !graph ||
    !Array.isArray(graph.nodes) ||
    !Array.isArray(graph.edges) ||
    graph.nodes.length > 120_000 ||
    graph.edges.length > 1_000_000 ||
    !Array.isArray(positions) ||
    positions.length !== graph.nodes.length * 3 ||
    !positions.every((n) => Number.isFinite(n) && Math.abs(n) <= 10_000)
  )
    throw new Error('The graph and layout do not form a valid matching snapshot.')
  const ids = new Set<string>()
  for (const node of graph.nodes) {
    if (
      !node ||
      typeof node.id !== 'string' ||
      !node.id ||
      ids.has(node.id) ||
      typeof node.label !== 'string' ||
      typeof node.platform !== 'string' ||
      !['link', 'collection', 'tag', 'category', 'creator'].includes(node.kind) ||
      (node.url !== undefined && typeof node.url !== 'string')
    )
      throw new Error('The graph has an invalid or duplicate resource.')
    ids.add(node.id)
  }
  for (const edge of graph.edges) {
    if (
      !edge ||
      !Number.isInteger(edge.source) ||
      !Number.isInteger(edge.target) ||
      !graph.nodes[edge.source] ||
      !graph.nodes[edge.target] ||
      !['collection', 'tag', 'category', 'creator'].includes(edge.kind) ||
      !['import', 'metadata', 'hashtag'].includes(edge.evidence)
    )
      throw new Error('The graph has an invalid relationship.')
  }
  return value
}

/** Filtering never recomputes positions or combines offsets from different revisions. */
export function projectSpatialSnapshot(
  snapshot: SpatialSnapshot,
  graph: LibraryGraph
): SpatialSnapshot {
  const indices = new Map(snapshot.graph.nodes.map((node, index) => [node.id, index]))
  return validateSpatialSnapshot({
    ...snapshot,
    graph,
    positions: graph.nodes.flatMap((node) => {
      const index = indices.get(node.id)
      if (index === undefined) throw new Error('Filtered resource is absent from this snapshot.')
      return snapshot.positions.slice(index * 3, index * 3 + 3)
    })
  })
}
