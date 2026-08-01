/**
 * The retrieval factory's contract (exploration 0415).
 *
 * The assertions that matter here are not about ranking quality — the golden-set
 * eval owns that. They are about the two things the factory exists to guarantee:
 * that a degraded search *says so*, and that the authorization gate is applied
 * to graph-expanded nodes, not just to entry hits.
 */

import { describe, expect, it, vi } from 'vitest'
import {
  ALLOW_ALL_NODES,
  createWorkspaceRetrieval,
  isDegradedTier,
  nodeTextParts,
  type RetrievalNode,
  type RetrievalStore
} from './workspace-retrieval'

const NODES: RetrievalNode[] = [
  {
    id: 'acme',
    schemaId: 'Company',
    properties: { title: 'Acme Corp', body: 'Key account, renewal in Q2.', contacts: ['dana'] }
  },
  {
    id: 'dana',
    schemaId: 'Person',
    // Deliberately does NOT contain "Acme": only reachable by walking the edge.
    properties: { name: 'Dana Reyes', body: 'Signed the renewal paperwork.' }
  },
  {
    id: 'secret',
    schemaId: 'Person',
    properties: { name: 'Hidden Person', body: 'Acme internal escalation contact.' }
  }
]

function makeStore(
  options: { withIndex: boolean; indexReturnsNull?: boolean } = { withIndex: true }
): RetrievalStore {
  const byId = new Map(NODES.map((node) => [node.id, node]))
  const store: RetrievalStore = {
    get: async (id) => byId.get(id) ?? null,
    list: async () => NODES
  }
  if (options.withIndex) {
    store.searchText = async (query) => {
      if (options.indexReturnsNull) return null
      const needle = query.toLocaleLowerCase()
      return NODES.filter((node) =>
        JSON.stringify(node.properties).toLocaleLowerCase().includes(needle)
      ).map((node, index) => ({ nodeId: node.id, rank: -10 + index }))
    }
  }
  return store
}

const relationFieldsOf = (schemaId: string): string[] =>
  schemaId === 'Company' ? ['contacts'] : []

describe('createWorkspaceRetrieval', () => {
  it('reports bm25-graph when the store has a text index', () => {
    const retrieval = createWorkspaceRetrieval({
      store: makeStore(),
      relationFieldsOf,
      authorize: ALLOW_ALL_NODES
    })
    expect(retrieval.tier).toBe('bm25-graph')
    expect(retrieval.degraded).toBe(false)
    expect(retrieval.notice).toBeUndefined()
  })

  it('reports hybrid-graph when a semantic entry search is supplied', () => {
    const retrieval = createWorkspaceRetrieval({
      store: makeStore(),
      relationFieldsOf,
      authorize: ALLOW_ALL_NODES,
      semanticEntrySearch: async () => [{ nodeId: 'acme', score: 1, source: 'vector' }]
    })
    expect(retrieval.tier).toBe('hybrid-graph')
  })

  it('reports scan — with a notice — when the store has no text index', async () => {
    const retrieval = createWorkspaceRetrieval({
      store: makeStore({ withIndex: false }),
      relationFieldsOf,
      authorize: ALLOW_ALL_NODES
    })
    expect(retrieval.tier).toBe('scan')
    expect(retrieval.degraded).toBe(true)
    expect(retrieval.notice).toMatch(/do not conclude/i)

    const result = await retrieval.recall('acme')
    expect(result.tier).toBe('scan')
    expect(result.degraded).toBe(true)
    expect(result.notice).toBeDefined()
  })

  it('downgrades to scan at call time when an advertised index answers null', async () => {
    const retrieval = createWorkspaceRetrieval({
      store: makeStore({ withIndex: true, indexReturnsNull: true }),
      relationFieldsOf,
      authorize: ALLOW_ALL_NODES
    })
    // Construction saw a `searchText` and promised bm25…
    expect(retrieval.tier).toBe('bm25-graph')
    // …but the call is what counts, and it fell back.
    const result = await retrieval.recall('acme')
    expect(result.tier).toBe('scan')
    expect(result.degraded).toBe(true)
  })

  it('reports the call-time downgrade through retrieveContext too, not just recall', async () => {
    // The seam the in-app assistant uses. Before exploration 0424 it returned a
    // bare node array, so this downgrade was invisible to every caller that did
    // not reach past it to `recall()` — which the app never did.
    const retrieval = createWorkspaceRetrieval({
      store: makeStore({ withIndex: true, indexReturnsNull: true }),
      relationFieldsOf,
      authorize: ALLOW_ALL_NODES
    })
    const { provenance } = await retrieval.retrieveContext('acme', { limit: 5 })
    expect(provenance.tier).toBe('scan')
    expect(provenance.degraded).toBe(true)
    expect(provenance.notice).toMatch(/do not conclude that something does not exist/i)
  })

  it('walks typed relations to reach a node the query text never mentions', async () => {
    const retrieval = createWorkspaceRetrieval({
      store: makeStore(),
      relationFieldsOf,
      authorize: ALLOW_ALL_NODES
    })
    const result = await retrieval.recall('Acme')
    const ids = result.items.map((item) => item.nodeId)
    expect(ids).toContain('acme')
    expect(ids).toContain('dana')
    const dana = result.items.find((item) => item.nodeId === 'dana')
    expect(dana?.hops).toBe(1)
    expect(dana?.pathLabel).toContain('Acme Corp')
    expect(dana?.pathLabel).toContain('contacts')
  })

  it('never returns a node the authorizer denies — including graph-expanded ones', async () => {
    const authorize = vi.fn((nodeId: string) => nodeId !== 'dana' && nodeId !== 'secret')
    const retrieval = createWorkspaceRetrieval({
      store: makeStore(),
      relationFieldsOf,
      authorize
    })
    const result = await retrieval.recall('Acme')
    const ids = result.items.map((item) => item.nodeId)
    expect(ids).toContain('acme')
    expect(ids).not.toContain('dana')
    expect(ids).not.toContain('secret')
    expect(result.stats.denied).toBeGreaterThan(0)
    expect(authorize).toHaveBeenCalledWith('dana')
  })

  it('fails closed when the authorizer throws', async () => {
    const retrieval = createWorkspaceRetrieval({
      store: makeStore(),
      relationFieldsOf,
      authorize: () => {
        throw new Error('authz backend unreachable')
      }
    })
    const result = await retrieval.recall('Acme')
    expect(result.items).toHaveLength(0)
  })

  it('retrieveContext hands back node ids with provenance paths', async () => {
    const retrieval = createWorkspaceRetrieval({
      store: makeStore(),
      relationFieldsOf,
      authorize: ALLOW_ALL_NODES
    })
    const { nodes } = await retrieval.retrieveContext('Acme', { limit: 5 })
    expect(nodes.length).toBeGreaterThan(0)
    expect(nodes[0]).toHaveProperty('nodeId')
    expect(nodes[0]).toHaveProperty('pathLabel')
  })

  it('retrieveContext reports the tier it ran at, matching recall()', async () => {
    const retrieval = createWorkspaceRetrieval({
      store: makeStore(),
      relationFieldsOf,
      authorize: ALLOW_ALL_NODES
    })
    const recalled = await retrieval.recall('Acme')
    const { provenance } = await retrieval.retrieveContext('Acme', { limit: 5 })
    expect(provenance.tier).toBe(recalled.tier)
    expect(provenance.degraded).toBe(recalled.degraded)
    expect(provenance.notice).toBe(recalled.notice)
  })

  it('drops to budget and hands the rest back as expandable refs', async () => {
    const retrieval = createWorkspaceRetrieval({
      store: makeStore(),
      relationFieldsOf,
      authorize: ALLOW_ALL_NODES
    })
    const full = await retrieval.recall('Acme')
    expect(full.items.length).toBeGreaterThan(1)

    const squeezed = await retrieval.recall('Acme', { maxTokens: 1 })
    // packToBudget always lets the best hit through — returning nothing is
    // worse than returning one oversized result — and the rest become
    // expandable refs rather than silently disappearing.
    expect(squeezed.items).toHaveLength(1)
    expect(squeezed.stats.truncated).toBe(true)
    expect(squeezed.expandable.length).toBe(full.items.length - 1)
    expect(squeezed.expandable[0].reason).toMatch(/budget/)
  })

  it('reports bm25 (no graph) when expansion is budgeted away', () => {
    const retrieval = createWorkspaceRetrieval({
      store: makeStore(),
      relationFieldsOf,
      authorize: ALLOW_ALL_NODES,
      budget: { maxHops: 0 }
    })
    expect(retrieval.tier).toBe('bm25')
    expect(isDegradedTier(retrieval.tier)).toBe(false)
  })
})

describe('nodeTextParts', () => {
  it('uses the first text-bearing property as the title', () => {
    expect(nodeTextParts(NODES[0]).title).toBe('Acme Corp')
  })

  it('falls back to the node id rather than an empty title', () => {
    expect(nodeTextParts({ id: 'n1', schemaId: 'X', properties: {} }).title).toBe('n1')
  })
})
