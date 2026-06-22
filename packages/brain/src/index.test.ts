/**
 * End-to-end: index a small graph with the real `@xnetjs/vectors` SemanticSearch
 * (mock embedding model), then retrieve through the full createBrain wiring —
 * hybrid entry search → graph expansion → authorization → budget packing.
 *
 * The mock model produces near-orthogonal vectors for distinct text, so we query
 * with a node's exact text to get a deterministic semantic match, then assert the
 * graph-expansion, authorization, and JIT-budget behavior around it.
 */
import type { IndexableNode, IndexChangeEvent } from './indexer'
import { createSemanticSearch } from '@xnetjs/vectors'
import { describe, expect, it } from 'vitest'
import { createBrain, type BrainStore } from './index'

interface TestNode {
  id: string
  schemaId: string
  properties: Record<string, unknown>
  deleted?: boolean
}

function buildStore(nodes: TestNode[]): BrainStore & { emit(e: IndexChangeEvent): void } {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  let listener: ((event: IndexChangeEvent) => void) | null = null
  return {
    async get(id) {
      return byId.get(id) ?? null
    },
    subscribe(fn) {
      listener = fn as (event: IndexChangeEvent) => void
      return () => {
        listener = null
      }
    },
    emit(event) {
      // A real store holds the node AND notifies listeners — mirror both.
      if (event.node) byId.set(event.node.id, event.node as TestNode)
      listener?.(event)
    }
  }
}

const NODES: TestNode[] = [
  {
    id: 'acme',
    schemaId: 'Account',
    properties: {
      title: 'Acme Corporation account overview',
      references: ['email1', 'secret'],
      about: 'contact1'
    }
  },
  { id: 'email1', schemaId: 'Page', properties: { title: 'Quarterly email about the deal' } },
  { id: 'contact1', schemaId: 'Page', properties: { title: 'Jane Doe primary contact' } },
  { id: 'secret', schemaId: 'Page', properties: { title: 'Confidential salary information' } }
]

const relationFieldsOf = (schemaId: string) =>
  schemaId === 'Account' ? ['references', 'about'] : []

async function makeSemanticSearch() {
  const search = createSemanticSearch({ useMockModel: true, minScore: 0.5 })
  await search.initialize()
  return search
}

describe('createBrain (end-to-end)', () => {
  it('indexes the graph and retrieves entry + expanded nodes with paths', async () => {
    const store = buildStore(NODES)
    const semanticSearch = await makeSemanticSearch()
    const brain = createBrain({ store, semanticSearch, relationFieldsOf })

    await brain.indexer.reindexAll(NODES as IndexableNode[])

    const result = await brain.retrieve('Acme Corporation account overview', {
      maxHops: 1,
      maxTokens: 10000
    })

    const ids = result.items.map((i) => i.nodeId)
    expect(ids).toContain('acme') // semantic entry match
    expect(ids).toContain('email1') // 1-hop via `references`
    expect(ids).toContain('contact1') // 1-hop via `about`

    const email = result.items.find((i) => i.nodeId === 'email1')!
    expect(email.hops).toBe(1)
    expect(email.pathLabel).toContain('Acme Corporation account overview')
    expect(email.pathLabel).toContain('references')
  })

  it('never surfaces a node the authorizer denies, even via expansion', async () => {
    const store = buildStore(NODES)
    const semanticSearch = await makeSemanticSearch()
    const brain = createBrain({
      store,
      semanticSearch,
      relationFieldsOf,
      authorize: (id) => id !== 'secret'
    })
    await brain.indexer.reindexAll(NODES as IndexableNode[])

    const result = await brain.retrieve('Acme Corporation account overview', {
      maxHops: 1,
      maxTokens: 10000
    })
    expect(result.items.map((i) => i.nodeId)).not.toContain('secret')
    expect(result.stats.denied).toBeGreaterThanOrEqual(1)
  })

  it('keeps the index live via the subscription', async () => {
    const store = buildStore(NODES)
    const semanticSearch = await makeSemanticSearch()
    const brain = createBrain({ store, semanticSearch, relationFieldsOf, debounceMs: 0 })
    brain.indexer.start()

    store.emit({
      node: {
        id: 'fresh',
        schemaId: 'Page',
        properties: { title: 'A brand new unique note xyzzy' }
      }
    })
    await brain.indexer.flush()
    brain.indexer.stop()

    const result = await brain.retrieve('A brand new unique note xyzzy', {
      maxHops: 0,
      maxTokens: 10000
    })
    expect(result.items.map((i) => i.nodeId)).toContain('fresh')
  })

  it('drops low-priority neighbors to expandable refs under a tight budget', async () => {
    const store = buildStore(NODES)
    const semanticSearch = await makeSemanticSearch()
    const brain = createBrain({ store, semanticSearch, relationFieldsOf })
    await brain.indexer.reindexAll(NODES as IndexableNode[])

    const result = await brain.retrieve('Acme Corporation account overview', {
      maxHops: 1,
      maxTokens: 12 // only room for the top entry
    })
    expect(result.stats.truncated).toBe(true)
    expect(result.expandable.length).toBeGreaterThan(0)
  })
})
