import type { GraphAccess, GraphEdge } from './types'
import { describe, expect, it } from 'vitest'
import { bfsExpand, nodeStoreGraphAccess } from './expand'

/** Build a GraphAccess from a plain adjacency map. */
function fakeGraph(adj: Record<string, GraphEdge[]>): GraphAccess {
  return { neighbors: async (id) => adj[id] ?? [] }
}

const edge = (
  nodeId: string,
  relation = 'rel',
  direction: 'outbound' | 'inbound' = 'outbound'
) => ({
  nodeId,
  relation,
  direction
})

describe('bfsExpand', () => {
  it('returns nothing when hops or node budget is 0', async () => {
    const graph = fakeGraph({ a: [edge('b')] })
    expect(await bfsExpand(['a'], graph, { maxHops: 0, maxNodes: 10 })).toEqual([])
    expect(await bfsExpand(['a'], graph, { maxHops: 2, maxNodes: 0 })).toEqual([])
  })

  it('walks one hop and records the path', async () => {
    const graph = fakeGraph({ a: [edge('b', 'authored')] })
    const out = await bfsExpand(['a'], graph, { maxHops: 1, maxNodes: 10 })
    expect(out).toHaveLength(1)
    expect(out[0].nodeId).toBe('b')
    expect(out[0].hops).toBe(1)
    expect(out[0].seed).toBe('a')
    expect(out[0].path).toEqual([
      { nodeId: 'a' },
      { nodeId: 'b', relation: 'authored', direction: 'outbound' }
    ])
  })

  it('walks multiple hops breadth-first', async () => {
    const graph = fakeGraph({ a: [edge('b')], b: [edge('c')], c: [edge('d')] })
    const out = await bfsExpand(['a'], graph, { maxHops: 2, maxNodes: 10 })
    expect(out.map((n) => n.nodeId).sort()).toEqual(['b', 'c'])
    expect(out.find((n) => n.nodeId === 'c')?.hops).toBe(2)
  })

  it('visits each node once via the shortest path', async () => {
    // a→b, a→c, b→c : c should be discovered at hop 1, not duplicated.
    const graph = fakeGraph({ a: [edge('b'), edge('c')], b: [edge('c')] })
    const out = await bfsExpand(['a'], graph, { maxHops: 2, maxNodes: 10 })
    expect(out.filter((n) => n.nodeId === 'c')).toHaveLength(1)
    expect(out.find((n) => n.nodeId === 'c')?.hops).toBe(1)
  })

  it('never re-emits a seed node', async () => {
    const graph = fakeGraph({ a: [edge('b')], b: [edge('a')] })
    const out = await bfsExpand(['a'], graph, { maxHops: 3, maxNodes: 10 })
    expect(out.map((n) => n.nodeId)).toEqual(['b'])
  })

  it('stops at the node budget', async () => {
    const graph = fakeGraph({ a: [edge('b'), edge('c'), edge('d')] })
    const out = await bfsExpand(['a'], graph, { maxHops: 1, maxNodes: 2 })
    expect(out).toHaveLength(2)
  })

  it('tolerates a throwing neighbor lookup', async () => {
    const graph: GraphAccess = {
      neighbors: async (id) => {
        if (id === 'b') throw new Error('boom')
        return id === 'a' ? [edge('b'), edge('c')] : []
      }
    }
    const out = await bfsExpand(['a'], graph, { maxHops: 2, maxNodes: 10 })
    expect(out.map((n) => n.nodeId).sort()).toEqual(['b', 'c'])
  })
})

describe('nodeStoreGraphAccess', () => {
  const store = {
    get: async (id: string) => {
      const nodes: Record<string, { schemaId: string; properties: Record<string, unknown> }> = {
        deal1: {
          schemaId: 'Deal',
          properties: { contact: 'c1', items: ['li1', 'li2'], note: 'hi' }
        },
        gone: { schemaId: 'Deal', properties: { contact: 'c1' } }
      }
      const node = nodes[id]
      if (!node) return null
      return { ...node, deleted: id === 'gone' }
    }
  }

  const relationFieldsOf = (schemaId: string) => (schemaId === 'Deal' ? ['contact', 'items'] : [])

  it('reads single + multiple relation properties as outbound edges', async () => {
    const graph = nodeStoreGraphAccess(store, { relationFieldsOf })
    const edges = await graph.neighbors('deal1')
    expect(edges.map((e) => e.nodeId).sort()).toEqual(['c1', 'li1', 'li2'])
    expect(edges.every((e) => e.direction === 'outbound')).toBe(true)
  })

  it('ignores non-relation properties', async () => {
    const graph = nodeStoreGraphAccess(store, { relationFieldsOf })
    const edges = await graph.neighbors('deal1')
    expect(edges.find((e) => e.relation === 'note')).toBeUndefined()
  })

  it('returns nothing for deleted or missing nodes', async () => {
    const graph = nodeStoreGraphAccess(store, { relationFieldsOf })
    expect(await graph.neighbors('gone')).toEqual([])
    expect(await graph.neighbors('missing')).toEqual([])
  })

  it('merges injected inbound edges', async () => {
    const graph = nodeStoreGraphAccess(store, {
      relationFieldsOf,
      inbound: async (id) => (id === 'c1' ? [edge('deal1', 'contact', 'inbound')] : [])
    })
    const edges = await graph.neighbors('c1')
    expect(edges).toEqual([{ nodeId: 'deal1', relation: 'contact', direction: 'inbound' }])
  })
})
