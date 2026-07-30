/**
 * Search index behavior for AiSurfaceService (exploration 0394).
 *
 * Two properties the AI retrieval path depends on:
 *
 * 1. `schemaId` is pushed into the FTS query, not applied afterwards. Filtering
 *    a cross-schema BM25 window post-hoc silently returns fewer than `limit`
 *    results whenever that schema's matches rank below the window.
 * 2. When BM25 is unavailable the response says so. A silent substring scan
 *    reads to a model exactly like an exhaustive search, so it will answer
 *    "there is no such node" with unearned confidence.
 */

import type { NodeData, NodeStoreAPI, SchemaRegistryAPI } from '../services/local-api'
import { describe, expect, it } from 'vitest'
import { createAiSurfaceService } from './service'

const NOTE_SCHEMA = 'xnet://xnet.fyi/Note@1.0.0'
const TASK_SCHEMA = 'xnet://xnet.fyi/Task@1.0.0'

const schemas: SchemaRegistryAPI = {
  getAllIRIs: () => [NOTE_SCHEMA, TASK_SCHEMA],
  get: async (iri) => ({ iri, name: 'Fixture', properties: { title: { type: 'text' } } })
}

function node(id: string, schemaId: string, title: string): NodeData {
  return {
    id,
    schemaId,
    properties: { title },
    deleted: false,
    createdAt: 1,
    updatedAt: 1
  }
}

/** 30 Notes that match strongly, then 5 Tasks that match weakly. */
function createCorpus(): NodeData[] {
  const nodes: NodeData[] = []
  for (let i = 0; i < 30; i++) nodes.push(node(`note-${i}`, NOTE_SCHEMA, `roadmap ${i}`))
  for (let i = 0; i < 5; i++) nodes.push(node(`task-${i}`, TASK_SCHEMA, `roadmap task ${i}`))
  return nodes
}

interface StoreOptions {
  /** Omitted → the store has no FTS at all (memory adapter). */
  fts?: 'honors-schema' | 'ignores-schema' | 'returns-null' | 'throws'
  calls?: Array<{ query: string; limit: number; schemaId?: string }>
}

function createStore(seed: NodeData[], options: StoreOptions = {}): NodeStoreAPI {
  const nodes = new Map(seed.map((n) => [n.id, n]))
  const base: NodeStoreAPI = {
    get: async (id) => nodes.get(id) ?? null,
    list: async (opts) => {
      let result = Array.from(nodes.values())
      if (opts?.schemaId) result = result.filter((n) => n.schemaId === opts.schemaId)
      if (opts?.offset) result = result.slice(opts.offset)
      if (opts?.limit) result = result.slice(0, opts.limit)
      return result
    },
    create: async () => {
      throw new Error('not used')
    },
    update: async () => {
      throw new Error('not used')
    },
    delete: async () => {},
    subscribe: () => () => {}
  }
  if (!options.fts) return base

  return {
    ...base,
    searchText: async (query, limit, opts) => {
      options.calls?.push({ query, limit, schemaId: opts?.schemaId })
      if (options.fts === 'returns-null') return null
      if (options.fts === 'throws') throw new Error('fts exploded')
      // Rank: title order in the corpus, i.e. Notes first (they "match better").
      let pool = Array.from(nodes.values())
      if (options.fts === 'honors-schema' && opts?.schemaId) {
        pool = pool.filter((n) => n.schemaId === opts.schemaId)
      }
      return pool.slice(0, limit).map((n, index) => ({ nodeId: n.id, rank: -100 + index }))
    }
  }
}

describe('AiSurfaceService.search — schema scoping (0394)', () => {
  it('passes schemaId down to the index instead of filtering afterwards', async () => {
    const calls: StoreOptions['calls'] = []
    const store = createStore(createCorpus(), { fts: 'honors-schema', calls })
    const service = createAiSurfaceService({ store, schemas })

    await service.search({ query: 'roadmap', schemaId: TASK_SCHEMA, limit: 5 })

    expect(calls).toHaveLength(1)
    expect(calls[0].schemaId).toBe(TASK_SCHEMA)
  })

  it('returns a full page of the scoped schema even when it ranks below the window', async () => {
    const store = createStore(createCorpus(), { fts: 'honors-schema' })
    const service = createAiSurfaceService({ store, schemas })

    const scoped = await service.search({ query: 'roadmap', schemaId: TASK_SCHEMA, limit: 5 })
    const results = scoped.results as Array<{ id: string }>

    expect(scoped.index).toBe('fts5')
    expect(results).toHaveLength(5)
    expect(results.every((r) => r.id.startsWith('task-'))).toBe(true)
  })

  it('keeps the post-filter as a guard when an adapter ignores the option', async () => {
    // An older adapter that drops `options` must not leak other schemas.
    const store = createStore(createCorpus(), { fts: 'ignores-schema' })
    const service = createAiSurfaceService({ store, schemas })

    const scoped = await service.search({ query: 'roadmap', schemaId: TASK_SCHEMA, limit: 5 })
    const results = scoped.results as Array<{ id: string }>

    expect(results.every((r) => r.id.startsWith('task-'))).toBe(true)
  })
})

describe('AiSurfaceService.search — degraded-search signal (0394)', () => {
  it('marks the indexed path as not degraded', async () => {
    const store = createStore(createCorpus(), { fts: 'honors-schema' })
    const service = createAiSurfaceService({ store, schemas })

    const result = await service.search({ query: 'roadmap', limit: 5 })

    expect(result.index).toBe('fts5')
    expect(result.degraded).toBe(false)
    expect(result.notice).toBeUndefined()
  })

  it('flags a scan when the storage has no FTS at all', async () => {
    const store = createStore(createCorpus())
    const service = createAiSurfaceService({ store, schemas })

    const result = await service.search({ query: 'roadmap', limit: 5 })

    expect(result.index).toBe('scan')
    expect(result.degraded).toBe(true)
    expect(result.degradedReason).toBe('fts-unsupported-by-storage')
    expect(String(result.notice)).toContain('Full-text index unavailable')
  })

  it('flags a scan when the FTS probe returns null', async () => {
    const store = createStore(createCorpus(), { fts: 'returns-null' })
    const service = createAiSurfaceService({ store, schemas })

    const result = await service.search({ query: 'roadmap', limit: 5 })

    expect(result.degraded).toBe(true)
    expect(result.degradedReason).toBe('fts-unavailable')
  })

  it('flags a scan when the FTS probe throws', async () => {
    const store = createStore(createCorpus(), { fts: 'throws' })
    const service = createAiSurfaceService({ store, schemas })

    const result = await service.search({ query: 'roadmap', limit: 5 })

    expect(result.degraded).toBe(true)
    expect(result.degradedReason).toBe('fts-unavailable')
  })

  it('warns that results may be incomplete once the scan window is full', async () => {
    // 600 nodes > the 500-node default scan window.
    const many: NodeData[] = []
    for (let i = 0; i < 600; i++) many.push(node(`note-${i}`, NOTE_SCHEMA, `roadmap ${i}`))
    const service = createAiSurfaceService({ store: createStore(many), schemas })

    const result = await service.search({ query: 'roadmap', limit: 5 })

    expect(String(result.notice)).toContain('may be incomplete')
  })
})
