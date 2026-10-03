import type { LibraryGraph } from '../../../shared/library-graph'
import { expect, it } from 'vitest'
import { graphGroups, graphSearchIndex, searchGraph } from './navigation'

const graph: LibraryGraph = {
  nodes: [
    {
      id: 'a',
      kind: 'link',
      label: 'Building better learning tools',
      platform: 'youtube',
      url: 'https://youtube.com/watch?v=abc123'
    },
    {
      id: 'b',
      kind: 'link',
      label: 'Learning',
      platform: 'github',
      url: 'https://github.com/example/learning'
    },
    { id: 'c', kind: 'link', label: 'Café 道', platform: 'generic' },
    { id: 'tag', kind: 'tag', label: 'learning', platform: '' },
    { id: 'list', kind: 'collection', label: 'Learning tools', platform: 'youtube' },
    { id: 'category', kind: 'category', label: 'Education', platform: 'youtube' }
  ],
  edges: [
    { source: 0, target: 3, kind: 'tag', evidence: 'metadata' },
    { source: 1, target: 3, kind: 'tag', evidence: 'metadata' },
    { source: 0, target: 4, kind: 'collection', evidence: 'import' },
    { source: 0, target: 5, kind: 'category', evidence: 'metadata' }
  ],
  resourceCount: 3,
  linkCount: 3,
  builtAt: 0,
  warnings: []
}

it('counts unique links for every group within the source, sorted by size', () => {
  const duplicate = { ...graph, edges: [...graph.edges, graph.edges[0]] }
  expect(graphGroups(duplicate, '').map(({ node, count }) => [node.id, count])).toEqual([
    ['tag', 2],
    ['category', 1],
    ['list', 1]
  ])
  expect(graphGroups(graph, 'github').map(({ node, count }) => [node.id, count])).toEqual([
    ['tag', 1]
  ])
  expect(graphGroups(graph, 'instagram')).toEqual([])
})

it('ranks exact titles and groups above prefixes and partial words', () => {
  const result = searchGraph(graphSearchIndex(graph), 'learning')
  expect(result.items.map(({ node }) => node.id)).toEqual(['tag', 'b', 'list', 'a'])
  expect(result.total).toBe(4)
})

it('finds nonadjacent title words, URL ids, accents, and Unicode labels', () => {
  const index = graphSearchIndex(graph)
  expect(searchGraph(index, 'tools building').items.map(({ node }) => node.id)).toEqual(['a'])
  expect(searchGraph(index, 'ABC123').items[0].node.id).toBe('a')
  expect(searchGraph(index, 'cafe 道').items[0].node.id).toBe('c')
  expect(searchGraph(index, 'learning abc123').items[0].node.id).toBe('a')
})

it('suggests popular groups for an empty query and bounds rendering without losing match totals', () => {
  const index = graphSearchIndex(graph)
  expect(searchGraph(index, '  ').items.map(({ node }) => node.id)).toEqual([
    'tag',
    'category',
    'list'
  ])
  const bounded = searchGraph(index, 'learning', 2)
  expect(bounded.total).toBe(4)
  expect(bounded.items).toHaveLength(2)
  expect(searchGraph(index, 'no such match')).toEqual({ total: 0, items: [] })
  expect(searchGraph([], '')).toEqual({ total: 0, items: [] })
})
