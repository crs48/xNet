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

it('combines group memberships with any/all semantics and preserves other relationships', () => {
  const any = selectGraph(graph, '', relationKinds, null, ['tag', 'list'])
  expect(any.nodes.map((node) => node.id)).toEqual(['a', 'b', 'tag', 'list'])
  const all = selectGraph(graph, '', relationKinds, null, ['tag', 'list'], 'all')
  expect(all.nodes.map((node) => node.id)).toEqual(['a', 'tag', 'list'])
  expect(
    all.edges.map(({ source, target }) => [all.nodes[source].id, all.nodes[target].id])
  ).toEqual([
    ['a', 'tag'],
    ['a', 'list']
  ])
  expect(selectGraph(graph, 'github', relationKinds, null, ['list']).linkCount).toBe(0)
})

it('filters memberships even when relationship lines are hidden', () => {
  const result = selectGraph(graph, '', [], null, ['list'])
  expect(result.nodes.map((node) => node.id)).toEqual(['a'])
  expect(result.edges).toEqual([])
  expect(selectGraph(graph, '', relationKinds, 'tag', ['list']).linkCount).toBe(1)
})

it('does not mistake duplicate edges for membership in another selected group', () => {
  const duplicate = { ...graph, edges: [...graph.edges, graph.edges[1]] }
  expect(selectGraph(duplicate, '', relationKinds, null, ['tag', 'list'], 'all').linkCount).toBe(1)
  expect(selectGraph(graph, '', relationKinds, null, ['missing']).linkCount).toBe(0)
  expect(selectGraph(graph, '', relationKinds, null, ['tag', 'missing'], 'all').linkCount).toBe(0)
  expect(selectGraph(graph, '', relationKinds, null, []).linkCount).toBe(graph.linkCount)
})
