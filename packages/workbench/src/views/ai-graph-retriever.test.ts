import { describe, expect, it } from 'vitest'
import {
  createGraphContextRetriever,
  keywordEntrySearch,
  nodeTextParts,
  type GraphRetrieverNode,
  type GraphRetrieverStore
} from './ai-graph-retriever'

function makeStore(nodes: GraphRetrieverNode[]): GraphRetrieverStore {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  return {
    async get(id) {
      return byId.get(id) ?? null
    },
    async list() {
      return nodes
    }
  }
}

const NODES: GraphRetrieverNode[] = [
  {
    id: 'inv1',
    schemaId: 'Inventory',
    properties: { label: 'My inventory', items: ['item1'] },
    deleted: false
  },
  { id: 'item1', schemaId: 'GameItem', properties: { name: 'Sword of testing' }, deleted: false },
  { id: 'other', schemaId: 'Page', properties: { title: 'unrelated note' }, deleted: false }
]

const relationFieldsOf = async (schemaId: string) => (schemaId === 'Inventory' ? ['items'] : [])

describe('nodeTextParts', () => {
  it('uses the first text-bearing property as the title', () => {
    expect(nodeTextParts(NODES[0])).toEqual({ title: 'My inventory', body: 'My inventory' })
  })

  it('falls back to the node id when there is no text', () => {
    expect(nodeTextParts({ id: 'x', schemaId: 'S', properties: {}, deleted: false }).title).toBe(
      'x'
    )
  })
})

/** An FTS-backed store, so the retriever has an indexed tier to report. */
function makeIndexedStore(nodes: GraphRetrieverNode[]): GraphRetrieverStore {
  return {
    ...makeStore(nodes),
    async searchText(query, limit) {
      const needle = query.trim().toLocaleLowerCase()
      return nodes
        .filter((node) => JSON.stringify(node.properties).toLocaleLowerCase().includes(needle))
        .slice(0, limit)
        .map((node, index) => ({ nodeId: node.id, rank: -10 + index }))
    }
  }
}

describe('createGraphContextRetriever', () => {
  it('returns keyword entry hits plus graph-expanded neighbors', async () => {
    const retrieve = createGraphContextRetriever(makeStore(NODES), { relationFieldsOf })
    const { nodes } = await retrieve('inventory', { limit: 6 })
    const ids = nodes.map((r) => r.nodeId)
    expect(ids).toContain('inv1') // keyword match on "My inventory"
    expect(ids).toContain('item1') // 1-hop via the `items` relation
    expect(ids).not.toContain('other') // no keyword match, not connected
  })

  it('attaches a readable provenance path to expanded nodes', async () => {
    const retrieve = createGraphContextRetriever(makeStore(NODES), { relationFieldsOf })
    const { nodes } = await retrieve('inventory', { limit: 6 })
    const item = nodes.find((r) => r.nodeId === 'item1')
    expect(item?.pathLabel).toContain('My inventory')
    expect(item?.pathLabel).toContain('items')
  })

  it('returns only entry hits when the schema has no relations', async () => {
    const retrieve = createGraphContextRetriever(makeStore(NODES), {
      relationFieldsOf: async () => []
    })
    const { nodes } = await retrieve('inventory', { limit: 6 })
    expect(nodes.map((r) => r.nodeId)).toEqual(['inv1'])
  })

  it('returns nothing for an empty query', async () => {
    const retrieve = createGraphContextRetriever(makeStore(NODES), { relationFieldsOf })
    expect((await retrieve('   ', { limit: 6 })).nodes).toEqual([])
  })

  // Exploration 0424 — this retriever had no tier at all, so every answer it
  // fed the assistant read as an exhaustive search of the workspace.
  it('reports scan + notice when the store has no text index', async () => {
    const retrieve = createGraphContextRetriever(makeStore(NODES), { relationFieldsOf })
    const { provenance } = await retrieve('inventory', { limit: 6 })
    expect(provenance.tier).toBe('scan')
    expect(provenance.degraded).toBe(true)
    expect(provenance.notice).toMatch(/do not conclude that something does not exist/i)
  })

  it('reports bm25-graph with no notice when the index answered', async () => {
    const retrieve = createGraphContextRetriever(makeIndexedStore(NODES), { relationFieldsOf })
    const { provenance } = await retrieve('inventory', { limit: 6 })
    expect(provenance.tier).toBe('bm25-graph')
    expect(provenance.degraded).toBe(false)
    expect(provenance.notice).toBeUndefined()
  })

  it('downgrades to scan when an advertised index falls back at call time', async () => {
    const store: GraphRetrieverStore = {
      ...makeStore(NODES),
      async searchText() {
        return null // advertised an index, cannot answer this query
      }
    }
    const retrieve = createGraphContextRetriever(store, { relationFieldsOf })
    const { provenance } = await retrieve('inventory', { limit: 6 })
    expect(provenance.tier).toBe('scan')
    expect(provenance.degraded).toBe(true)
  })

  it('lets an overriding entry search declare its own tier', async () => {
    const retrieve = createGraphContextRetriever(makeIndexedStore(NODES), {
      relationFieldsOf,
      entrySearch: async () => [{ nodeId: 'inv1', score: 1, source: 'vector' as const }],
      tierOf: () => 'hybrid-graph'
    })
    const { provenance } = await retrieve('inventory', { limit: 6 })
    expect(provenance.tier).toBe('hybrid-graph')
    expect(provenance.degraded).toBe(false)
  })

  it('assumes scan for an override that declares nothing on an unindexed store', async () => {
    const retrieve = createGraphContextRetriever(makeStore(NODES), {
      relationFieldsOf,
      entrySearch: async () => [{ nodeId: 'inv1', score: 1, source: 'keyword' as const }]
    })
    const { provenance } = await retrieve('inventory', { limit: 6 })
    expect(provenance.tier).toBe('scan')
    expect(provenance.degraded).toBe(true)
  })
})

describe('keywordEntrySearch FTS path (exploration 0391)', () => {
  it('prefers store.searchText and negates the BM25 rank into the score', async () => {
    const calls: Array<{ query: string; limit: number }> = []
    const store: GraphRetrieverStore = {
      ...makeStore(NODES),
      async searchText(query, limit) {
        calls.push({ query, limit })
        return [
          { nodeId: 'item1', rank: -2.5 },
          { nodeId: 'inv1', rank: -0.5 }
        ]
      }
    }
    const search = keywordEntrySearch(store)
    const hits = await search('sword', 5)
    expect(calls).toEqual([{ query: 'sword', limit: 5 }])
    expect(hits).toEqual([
      { nodeId: 'item1', score: 2.5, source: 'keyword' },
      { nodeId: 'inv1', score: 0.5, source: 'keyword' }
    ])
  })

  it('falls back to the substring scan when searchText reports no FTS', async () => {
    const store: GraphRetrieverStore = {
      ...makeStore(NODES),
      async searchText() {
        return null
      }
    }
    const hits = await keywordEntrySearch(store)('sword', 5)
    expect(hits.map((hit) => hit.nodeId)).toEqual(['item1'])
  })

  it('falls back to the substring scan when searchText throws', async () => {
    const store: GraphRetrieverStore = {
      ...makeStore(NODES),
      async searchText() {
        throw new Error('fts5 syntax error')
      }
    }
    const hits = await keywordEntrySearch(store)('sword', 5)
    expect(hits.map((hit) => hit.nodeId)).toEqual(['item1'])
  })
})
