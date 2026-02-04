import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { NodePool } from '../src/pool/node-pool'
import { createMemoryStorage } from '../src/storage/memory'

describe('NodePool', () => {
  let storage = createMemoryStorage()
  let pool = new NodePool(storage, { maxWarmDocs: 1, persistDelay: 10 })

  beforeEach(() => {
    storage = createMemoryStorage()
    pool = new NodePool(storage, { maxWarmDocs: 1, persistDelay: 10 })
  })

  afterEach(async () => {
    await pool.persistAll()
    pool.destroy()
    await storage.close()
  })

  it('loads doc state from storage', async () => {
    const doc = new Y.Doc()
    doc.getText('content').insert(0, 'Loaded')
    const state = Y.encodeStateAsUpdate(doc)
    await storage.setDocState('doc-1', state)

    const loaded = await pool.get('doc-1')
    expect(loaded.getText('content').toString()).toBe('Loaded')
  })

  it('persists dirty docs after debounce', async () => {
    const doc = await pool.get('doc-2')
    doc.getText('content').insert(0, 'Persisted')
    pool.markDirty('doc-2')

    await new Promise((resolve) => setTimeout(resolve, 30))

    const stored = await storage.getDocState('doc-2')
    expect(stored).not.toBeNull()

    const restored = new Y.Doc()
    Y.applyUpdate(restored, stored!)
    expect(restored.getText('content').toString()).toBe('Persisted')
  })

  it('evicts warm docs when max is exceeded', async () => {
    await pool.get('doc-3')
    await pool.get('doc-4')

    const stats = pool.getStats()
    expect(stats.total).toBe(1)
  })
})
