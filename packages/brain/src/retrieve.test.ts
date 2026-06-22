import type { EntryHit, GraphAccess, NodeText, RetrieveDeps } from './types'
import { describe, expect, it } from 'vitest'
import { retrieve } from './retrieve'

const texts: Record<string, NodeText> = {
  acme: { title: 'Acme Corp', snippet: 'The Acme account' },
  email1: { title: 'Q1 email', snippet: 'email about acme deal' },
  email2: { title: 'Q2 email', snippet: 'follow up' },
  contact1: { title: 'Jane Doe', snippet: 'contact at acme' },
  secret: { title: 'Secret', snippet: 'should be filtered' }
}

function makeDeps(overrides: Partial<RetrieveDeps> = {}): RetrieveDeps {
  const graph: GraphAccess = {
    neighbors: async (id) => {
      const adj: Record<string, { nodeId: string; relation: string; direction: 'outbound' }[]> = {
        acme: [
          { nodeId: 'email1', relation: 'references', direction: 'outbound' },
          { nodeId: 'contact1', relation: 'about', direction: 'outbound' }
        ],
        email1: [{ nodeId: 'email2', relation: 'thread', direction: 'outbound' }]
      }
      return adj[id] ?? []
    }
  }
  return {
    entrySearch: async (): Promise<EntryHit[]> => [{ nodeId: 'acme', score: 1, source: 'hybrid' }],
    graph,
    loadText: async (id) => texts[id] ?? null,
    ...overrides
  }
}

describe('retrieve', () => {
  it('returns entry nodes plus graph-expanded neighbors with readable paths', async () => {
    const result = await retrieve('acme', { maxHops: 1, maxTokens: 10000 }, makeDeps())
    const ids = result.items.map((i) => i.nodeId)
    expect(ids).toContain('acme')
    expect(ids).toContain('email1')
    expect(ids).toContain('contact1')
    const email = result.items.find((i) => i.nodeId === 'email1')!
    expect(email.hops).toBe(1)
    expect(email.source).toBe('graph')
    expect(email.pathLabel).toBe('Acme Corp→ (references) Q1 email')
  })

  it('ranks entry nodes above decayed multi-hop neighbors', async () => {
    const result = await retrieve('acme', { maxHops: 2, maxTokens: 10000 }, makeDeps())
    expect(result.items[0].nodeId).toBe('acme')
    const e1 = result.items.findIndex((i) => i.nodeId === 'email1')
    const e2 = result.items.findIndex((i) => i.nodeId === 'email2')
    expect(e1).toBeLessThan(e2) // 1-hop ranks above 2-hop
  })

  it('filters candidates through the authorization gate before packing', async () => {
    const deps = makeDeps({
      entrySearch: async () => [
        { nodeId: 'acme', score: 1, source: 'hybrid' },
        { nodeId: 'secret', score: 0.9, source: 'hybrid' }
      ],
      authorize: (id) => id !== 'secret'
    })
    const result = await retrieve('acme', { maxHops: 0, maxTokens: 10000 }, deps)
    expect(result.items.map((i) => i.nodeId)).not.toContain('secret')
    expect(result.stats.denied).toBe(1)
  })

  it('fails closed when the authorizer throws', async () => {
    const deps = makeDeps({
      authorize: () => {
        throw new Error('authz down')
      }
    })
    const result = await retrieve('acme', { maxHops: 1, maxTokens: 10000 }, deps)
    expect(result.items).toHaveLength(0)
    expect(result.stats.denied).toBeGreaterThan(0)
  })

  it('respects the token budget and reports dropped nodes as expandable', async () => {
    const result = await retrieve('acme', { maxHops: 1, maxTokens: 12 }, makeDeps())
    expect(result.stats.truncated).toBe(true)
    expect(result.expandable.length).toBeGreaterThan(0)
    expect(result.items.length).toBeLessThan(3)
  })

  it('honors a custom reranker', async () => {
    const deps = makeDeps()
    const result = await retrieve(
      'acme',
      { maxHops: 1, maxTokens: 10000 },
      {
        ...deps,
        rerank: async (_q, candidates) =>
          new Map(candidates.map((c) => [c.nodeId, c.nodeId === 'contact1' ? 100 : 0]))
      }
    )
    expect(result.items[0].nodeId).toBe('contact1')
  })

  it('skips candidates whose text cannot be loaded', async () => {
    const deps = makeDeps({ loadText: async (id) => (id === 'acme' ? texts.acme : null) })
    const result = await retrieve('acme', { maxHops: 1, maxTokens: 10000 }, deps)
    expect(result.items.map((i) => i.nodeId)).toEqual(['acme'])
  })
})
