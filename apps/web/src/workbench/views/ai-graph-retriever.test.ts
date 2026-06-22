import { describe, expect, it } from 'vitest'
import {
  createGraphContextRetriever,
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
