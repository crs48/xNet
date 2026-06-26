/**
 * Tests for NodePool ephemeral-doc handling (exploration 0227).
 *
 * Workspace presence docs (`presence-*`) must be in-memory only: never
 * cold-loaded from `yjs_state` (so they can't head-of-line block the boot
 * read path on the single SQLite worker) and never persisted back (so the
 * `gc:false` blob can't grow unboundedly). Non-ephemeral docs keep their
 * load/persist behaviour.
 */

import type { NodeStorageAdapter } from '@xnetjs/data'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as Y from 'yjs'
import { createNodePool, type NodePoolConfig } from './node-pool'

function makeStorage(): NodeStorageAdapter & {
  getDocumentContent: ReturnType<typeof vi.fn>
  setDocumentContent: ReturnType<typeof vi.fn>
} {
  const docs = new Map<string, Uint8Array>()
  return {
    getDocumentContent: vi.fn(async (id: string) => docs.get(id) ?? null),
    setDocumentContent: vi.fn(async (id: string, content: Uint8Array) => {
      docs.set(id, content)
    })
  } as unknown as NodeStorageAdapter & {
    getDocumentContent: ReturnType<typeof vi.fn>
    setDocumentContent: ReturnType<typeof vi.fn>
  }
}

function makePool(overrides: Partial<NodePoolConfig> = {}) {
  const storage = makeStorage()
  const pool = createNodePool({
    storage,
    metaBridge: { observe: () => () => {} } as unknown as NodePoolConfig['metaBridge'],
    ...overrides
  })
  return { pool, storage }
}

describe('NodePool ephemeral docs (0227)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('does NOT cold-load presence docs from storage', async () => {
    const { pool, storage } = makePool()
    const doc = await pool.acquire('presence-main')
    expect(doc).toBeInstanceOf(Y.Doc)
    expect(storage.getDocumentContent).not.toHaveBeenCalled()
  })

  it('does NOT persist presence docs on update or flush', async () => {
    const { pool, storage } = makePool()
    const doc = await pool.acquire('presence-main')
    doc.getMap('meta').set('viewing', 'tasks') // marks the entry dirty
    await pool.flushAll()
    expect(storage.setDocumentContent).not.toHaveBeenCalled()
  })

  it('still cold-loads and persists non-ephemeral docs', async () => {
    const { pool, storage } = makePool()
    const doc = await pool.acquire('page-123')
    expect(storage.getDocumentContent).toHaveBeenCalledWith('page-123')
    doc.getMap('content').set('k', 'v')
    await pool.flushAll()
    expect(storage.setDocumentContent).toHaveBeenCalledWith('page-123', expect.any(Uint8Array))
  })

  it('honours a custom isEphemeral predicate', async () => {
    const { pool, storage } = makePool({ isEphemeral: (id) => id.startsWith('tmp-') })
    await pool.acquire('tmp-x')
    expect(storage.getDocumentContent).not.toHaveBeenCalled()
    await pool.acquire('presence-main') // not ephemeral under the custom predicate
    expect(storage.getDocumentContent).toHaveBeenCalledWith('presence-main')
  })

  it('emits the one-shot xnet:docpool:first-acquire boot mark', async () => {
    const mark = vi.spyOn(performance, 'mark')
    const { pool } = makePool()
    await pool.acquire('presence-main')
    await pool.acquire('page-1')
    const calls = mark.mock.calls.filter((c) => c[0] === 'xnet:docpool:first-acquire')
    expect(calls).toHaveLength(1)
  })
})
