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

describe('createGraphContextRetriever', () => {
  it('returns keyword entry hits plus graph-expanded neighbors', async () => {
    const retrieve = createGraphContextRetriever(makeStore(NODES), { relationFieldsOf })
    const results = await retrieve('inventory', { limit: 6 })
    const ids = results.map((r) => r.nodeId)
    expect(ids).toContain('inv1') // keyword match on "My inventory"
    expect(ids).toContain('item1') // 1-hop via the `items` relation
    expect(ids).not.toContain('other') // no keyword match, not connected
  })

  it('attaches a readable provenance path to expanded nodes', async () => {
    const retrieve = createGraphContextRetriever(makeStore(NODES), { relationFieldsOf })
    const results = await retrieve('inventory', { limit: 6 })
    const item = results.find((r) => r.nodeId === 'item1')
    expect(item?.pathLabel).toContain('My inventory')
    expect(item?.pathLabel).toContain('items')
  })

  it('returns only entry hits when the schema has no relations', async () => {
    const retrieve = createGraphContextRetriever(makeStore(NODES), {
      relationFieldsOf: async () => []
    })
    const results = await retrieve('inventory', { limit: 6 })
    expect(results.map((r) => r.nodeId)).toEqual(['inv1'])
  })

  it('returns nothing for an empty query', async () => {
    const retrieve = createGraphContextRetriever(makeStore(NODES), { relationFieldsOf })
    expect(await retrieve('   ', { limit: 6 })).toEqual([])
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
