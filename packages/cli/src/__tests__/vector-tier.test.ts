/**
 * The semantic tier's contract (exploration 0415).
 *
 * The point of these is the *failure* behaviour. A missing model or a broken
 * native binding must leave the daemon serving `bm25-graph` — a smaller claim,
 * truthfully made — rather than refusing to start or, far worse, reporting
 * `hybrid-graph` while running on nothing.
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createVectorTier, fileBlobStore } from '../utils/vector-tier.js'

type Doc = { id: string; text: string }

/** A stand-in for `SemanticSearch`: deterministic, no model download. */
function fakeEngine() {
  const docs: Doc[] = []
  const index = {
    initialize: async () => {},
    indexDocument: async (id: string, text: string) => {
      docs.push({ id, text })
    },
    search: async (query: string, options?: { maxResults?: number }) =>
      docs
        .filter((doc) => doc.text.toLowerCase().includes(query.toLowerCase()))
        .slice(0, options?.maxResults ?? 10)
        .map((doc, rank) => ({ id: doc.id, score: 1 - rank * 0.1 })),
    serialize: () => ({ docs: [...docs] }),
    restore: (data: { docs: Doc[] }) => {
      docs.length = 0
      docs.push(...data.docs)
    },
    clear: () => {
      docs.length = 0
    }
  }
  return { createSemanticSearch: () => index, docs }
}

function fakeStore(nodes: Array<{ id: string; properties: Record<string, unknown> }>) {
  return {
    get: async (id: string) => nodes.find((n) => n.id === id) ?? null,
    list: async () => nodes,
    create: async () => {
      throw new Error('not used')
    },
    update: async () => {
      throw new Error('not used')
    },
    delete: async () => {},
    subscribe: () => () => {}
  } as never
}

const NODES = [
  { id: 'n1', properties: { title: 'Cutover runbook', markdown: 'Rollback steps' } },
  { id: 'n2', properties: { title: 'Weekly notes', markdown: 'Routine updates' } }
]

describe('vector tier', () => {
  let dir: string
  let snapshotPath: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'xnet-vectors-'))
    snapshotPath = join(dir, 'v.json')
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('backfills from the store and serves entry hits', async () => {
    const engine = fakeEngine()
    const tier = await createVectorTier({
      store: fakeStore(NODES),
      snapshotPath,
      loadEngine: async () => engine as never
    })
    expect(tier).not.toBeNull()
    expect(tier?.restored).toBe(false)
    expect(tier?.documents).toBe(2)

    const hits = await tier!.entrySearch('cutover', 5)
    expect(hits.map((hit) => hit.nodeId)).toEqual(['n1'])
    expect(hits[0].source).toBe('vector')
  })

  it('restores from the snapshot instead of re-embedding', async () => {
    const first = fakeEngine()
    await createVectorTier({
      store: fakeStore(NODES),
      snapshotPath,
      loadEngine: async () => first as never
    })

    // A fresh engine, an empty store: everything it knows must come from disk.
    const second = fakeEngine()
    const tier = await createVectorTier({
      store: fakeStore([]),
      snapshotPath,
      loadEngine: async () => second as never
    })
    expect(tier?.restored).toBe(true)
    const hits = await tier!.entrySearch('cutover', 5)
    expect(hits.map((hit) => hit.nodeId)).toEqual(['n1'])
  })

  it('returns null — not a throw — when the engine cannot be loaded', async () => {
    const tier = await createVectorTier({
      store: fakeStore(NODES),
      snapshotPath,
      loadEngine: async () => {
        throw new Error('Cannot find module @xenova/transformers')
      }
    })
    expect(tier).toBeNull()
  })

  it('treats a corrupt snapshot as cold rather than restoring garbage', async () => {
    await writeFile(snapshotPath, 'not json at all', 'utf8')
    const engine = fakeEngine()
    const tier = await createVectorTier({
      store: fakeStore(NODES),
      snapshotPath,
      loadEngine: async () => engine as never
    })
    expect(tier?.restored).toBe(false)
    expect(tier?.documents).toBe(2)
  })

  it('fileBlobStore reports an absent snapshot as null, not as empty bytes', async () => {
    const blobs = fileBlobStore(join(dir, 'missing.json'))
    expect(await blobs.getBlob('k')).toBeNull()
    await blobs.setBlob('k', new Uint8Array([1, 2, 3]))
    expect(await blobs.getBlob('k')).toEqual(new Uint8Array([1, 2, 3]))
  })
})

describe('vector tier failure honesty', () => {
  let dir: string
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'xnet-vectors-fail-'))
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  // The bug this test exists for: an earlier draft swallowed the backfill error
  // and the daemon announced `tier hybrid-graph` over an index holding zero
  // documents. A tier that indexed nothing is not a tier.
  it('returns null when the backfill indexed nothing, rather than an empty tier', async () => {
    const engine = fakeEngine()
    const tier = await createVectorTier({
      store: fakeStore(NODES),
      snapshotPath: join(dir, 'v.json'),
      loadEngine: async () =>
        ({
          createSemanticSearch: () => ({
            ...engine.createSemanticSearch(),
            indexDocument: async () => {
              throw new Error('model failed to load weights')
            }
          })
        }) as never
    })
    expect(tier).toBeNull()
  })

  it('reports a partial backfill instead of hiding it', async () => {
    const engine = fakeEngine()
    let calls = 0
    const tier = await createVectorTier({
      store: fakeStore(NODES),
      snapshotPath: join(dir, 'v.json'),
      loadEngine: async () =>
        ({
          createSemanticSearch: () => {
            const real = engine.createSemanticSearch()
            return {
              ...real,
              indexDocument: async (id: string, text: string) => {
                if (++calls > 1) throw new Error('out of memory')
                return real.indexDocument(id, text)
              }
            }
          }
        }) as never
    })
    expect(tier?.documents).toBe(1)
    expect(tier?.backfillError).toMatch(/out of memory/)
  })
})
