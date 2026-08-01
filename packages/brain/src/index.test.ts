/**
 * End-to-end: index a small graph, then retrieve through the full createBrain
 * wiring — hybrid entry search → graph expansion → authorization → budget
 * packing.
 *
 * The semantic index here is a local fake, not `@xnetjs/vectors`. That is
 * deliberate and it is *stronger* coverage: brain's whole contract is that it is
 * structural over any conforming index, so testing it against the one
 * implementation we happen to ship proves less than testing it against an
 * arbitrary one. It also keeps brain genuinely dependency-free — the property
 * that makes it safe to publish, and which a `workspace:*` devDependency broke
 * for every trimmed Docker image (0415).
 */
import type { IndexableNode, IndexChangeEvent } from './indexer'
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

/**
 * A minimal semantic index satisfying the shape `createBrain` asks for.
 *
 * Scores by token overlap rather than embeddings, which is enough to make an
 * exact-text query rank its own document first — the determinism the assertions
 * below rely on, and previously obtained from the vectors package's mock model.
 */
function makeSemanticSearch() {
  const docs = new Map<string, string>()
  const tokens = (text: string) => new Set(text.toLowerCase().split(/\W+/).filter(Boolean))
  return {
    async indexDocument(id: string, content: string) {
      docs.set(id, content)
      return { id, content }
    },
    removeDocument(id: string) {
      return docs.delete(id)
    },
    async search(query: string, options?: { maxResults?: number; minScore?: number }) {
      const wanted = tokens(query)
      const minScore = options?.minScore ?? 0.5
      const hits: Array<{ id: string; score: number }> = []
      for (const [id, content] of docs) {
        const have = tokens(content)
        let shared = 0
        for (const token of wanted) if (have.has(token)) shared++
        const score = wanted.size === 0 ? 0 : shared / Math.max(wanted.size, have.size)
        if (score >= minScore) hits.push({ id, score })
      }
      hits.sort((a, b) => b.score - a.score)
      return hits.slice(0, options?.maxResults ?? hits.length)
    }
  }
}

describe('createBrain (end-to-end)', () => {
  it('indexes the graph and retrieves entry + expanded nodes with paths', async () => {
    const store = buildStore(NODES)
    const semanticSearch = makeSemanticSearch()
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
    const semanticSearch = makeSemanticSearch()
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
    const semanticSearch = makeSemanticSearch()
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
    const semanticSearch = makeSemanticSearch()
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
