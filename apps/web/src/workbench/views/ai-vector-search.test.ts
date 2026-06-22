/**
 * Verifies the lazy semantic entry search: keyword-until-warm, hybrid-once-warm,
 * fallback-on-failure, and persistence. Uses the real `@xnetjs/vectors`
 * SemanticSearch with the deterministic mock model (no `@xenova` download).
 */
import type { GraphRetrieverNode, GraphRetrieverStore } from './ai-graph-retriever'
import type { BlobStore } from '@xnetjs/brain'
import { createSemanticSearch } from '@xnetjs/vectors'
import { describe, expect, it, vi } from 'vitest'
import { createVectorEntrySearch, type VectorEngineLoader } from './ai-vector-search'

const NODES: GraphRetrieverNode[] = [
  {
    id: 'acme',
    schemaId: 'Page',
    properties: { title: 'Acme Corporation account overview' },
    deleted: false
  },
  {
    id: 'email',
    schemaId: 'Page',
    properties: { title: 'Quarterly email about the deal' },
    deleted: false
  }
]

function makeStore(nodes: GraphRetrieverNode[] = NODES): GraphRetrieverStore {
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

/** Loader backed by the real SemanticSearch in mock mode (deterministic, no model). */
const mockEngine: VectorEngineLoader = () =>
  Promise.resolve({
    createSemanticSearch: (config) =>
      createSemanticSearch({ ...config, useMockModel: true, minScore: 0.5 })
  })

function fakeBlobStore(): BlobStore & { map: Map<string, Uint8Array> } {
  const map = new Map<string, Uint8Array>()
  return {
    map,
    async getBlob(key) {
      return map.get(key) ?? null
    },
    async setBlob(key, data) {
      map.set(key, data)
    }
  }
}

async function waitUntil(pred: () => boolean, ms = 3000): Promise<void> {
  const start = Date.now()
  while (!pred()) {
    if (Date.now() - start > ms) throw new Error('timed out waiting for condition')
    await new Promise((r) => setTimeout(r, 5))
  }
}

describe('createVectorEntrySearch', () => {
  it('serves keyword results before the index is warm', async () => {
    const vs = createVectorEntrySearch({
      store: makeStore(),
      useMockModel: true,
      loadEngine: mockEngine
    })
    const results = await vs.search('Acme Corporation account overview', 5)
    // First call kicks off the async build; until ready, keyword search serves.
    expect(results.map((r) => r.nodeId)).toContain('acme')
    expect(results.every((r) => r.source === 'keyword')).toBe(true)
  })

  it('fuses vector + keyword once the index is warm', async () => {
    const vs = createVectorEntrySearch({
      store: makeStore(),
      useMockModel: true,
      loadEngine: mockEngine
    })
    void vs.search('warmup', 5) // trigger lazy init
    await waitUntil(() => vs.ready())

    const results = await vs.search('Acme Corporation account overview', 5)
    const acme = results.find((r) => r.nodeId === 'acme')
    expect(acme).toBeDefined()
    // The exact-text match is found by the vector tier (mock cosine ≈ 1).
    expect(['hybrid', 'vector']).toContain(acme?.source)
  })

  it('falls back to keyword when the engine fails to load', async () => {
    const failing: VectorEngineLoader = () => Promise.reject(new Error('wasm unavailable'))
    const vs = createVectorEntrySearch({ store: makeStore(), loadEngine: failing })
    const first = await vs.search('Acme', 5)
    expect(first.map((r) => r.nodeId)).toContain('acme')
    // Give the failed init a tick, then confirm it never flips to ready.
    await new Promise((r) => setTimeout(r, 20))
    expect(vs.ready()).toBe(false)
    const second = await vs.search('Acme', 5)
    expect(second.every((r) => r.source === 'keyword')).toBe(true)
  })

  it('persists the warm index to the blob store', async () => {
    const storage = fakeBlobStore()
    const vs = createVectorEntrySearch({
      store: makeStore(),
      useMockModel: true,
      loadEngine: mockEngine,
      storage
    })
    void vs.search('warmup', 5)
    await waitUntil(() => vs.ready())
    await waitUntil(() => storage.map.size > 0)
    expect(storage.map.size).toBeGreaterThan(0)
  })

  it('restores from the blob store instead of re-embedding', async () => {
    const storage = fakeBlobStore()
    // Warm + persist with instance A.
    const a = createVectorEntrySearch({
      store: makeStore(),
      useMockModel: true,
      loadEngine: mockEngine,
      storage
    })
    void a.search('warmup', 5)
    await waitUntil(() => a.ready())
    await waitUntil(() => storage.map.size > 0)

    // Instance B over an EMPTY store: if it restored, the persisted vectors still
    // answer the query (a cold backfill of an empty store would find nothing).
    const indexSpy = vi.fn()
    const b = createVectorEntrySearch({
      store: { get: async () => null, list: async () => [] },
      useMockModel: true,
      loadEngine: () =>
        Promise.resolve({
          createSemanticSearch: (config) => {
            const search = createSemanticSearch({ ...config, useMockModel: true, minScore: 0.5 })
            const original = search.indexDocument.bind(search)
            search.indexDocument = (id: string, content: string) => {
              indexSpy()
              return original(id, content)
            }
            return search
          }
        }),
      storage
    })
    void b.search('warmup', 5)
    await waitUntil(() => b.ready())
    const results = await b.search('Acme Corporation account overview', 5)
    expect(results.map((r) => r.nodeId)).toContain('acme')
    expect(indexSpy).not.toHaveBeenCalled() // restored, not re-embedded
  })
})
