import type { LibraryGraph } from '../../../shared/library-graph'
import { expect, it } from 'vitest'
import { graphAdjacency, initialPositions, relationKinds, selectGraph } from './model'

const graph: LibraryGraph = {
  nodes: [
    { id: 'a', kind: 'link', label: 'A', platform: 'youtube' },
    { id: 'b', kind: 'link', label: 'B', platform: 'github' },
    { id: 'c', kind: 'link', label: 'C', platform: 'youtube' },
    { id: 'tag', kind: 'tag', label: '#learning', platform: '' },
    { id: 'list', kind: 'collection', label: 'Playlist', platform: 'youtube' }
  ],
  edges: [
    { source: 0, target: 3, kind: 'tag', evidence: 'import' },
    { source: 1, target: 3, kind: 'tag', evidence: 'import' },
    { source: 0, target: 4, kind: 'collection', evidence: 'import' }
  ],
  linkCount: 3,
  resourceCount: 4,
  warnings: [],
  builtAt: 1
}

it('retains isolated links when relationship filters are disabled', () => {
  const result = selectGraph(graph, '', [], null)
  expect(result.nodes.map((node) => node.id)).toEqual(['a', 'b', 'c'])
  expect(result.edges).toEqual([])
})
it('remaps edges after a platform filter and does not include other platforms', () => {
  const result = selectGraph(graph, 'github', relationKinds, null)
  expect(result.nodes.map((node) => node.id)).toEqual(['b', 'tag'])
  expect(result.edges).toEqual([{ source: 0, target: 1, kind: 'tag', evidence: 'import' }])
})
it('isolates links sharing a known relationship without pulling in unrelated nodes', () => {
  const result = selectGraph(graph, '', relationKinds, 'a')
  expect(result.nodes.map((node) => node.id)).toEqual(['a', 'b', 'tag', 'list'])
  expect(result.linkCount).toBe(2)
  expect(graphAdjacency(result)[0]).toEqual([2, 3])
  expect(selectGraph(graph, '', relationKinds, 'tag').nodes.map((node) => node.id)).toEqual([
    'a',
    'b',
    'tag'
  ])
})
it('seeds a deterministic, finite 3D layout, including empty and disconnected graphs', () => {
  const positions = initialPositions(graph)
  expect(positions).toEqual(initialPositions(graph))
  expect(positions).toHaveLength(graph.nodes.length * 3)
  expect(Array.from(positions).every(Number.isFinite)).toBe(true)
  expect(new Set(Array.from(positions).filter((_value, i) => i % 3 === 2)).size).toBeGreaterThan(1)
  expect(initialPositions({ nodes: [], edges: [] })).toHaveLength(0)
})
