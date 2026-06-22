import { describe, expect, it } from 'vitest'
import {
  loadVectorTier,
  saveVectorTier,
  VECTOR_TIER_BLOB_KEY,
  type BlobStore,
  type SerializableIndex
} from './persist'

/** In-memory blob store. */
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

/** A SemanticSearch-shaped index whose serialized form contains a Uint8Array. */
function fakeIndex(initial?: { index: Uint8Array; docs: string[] }): SerializableIndex<{
  index: Uint8Array
  docs: string[]
}> & { state: { index: Uint8Array; docs: string[] } } {
  const self = {
    state: initial ?? { index: new Uint8Array(), docs: [] },
    serialize() {
      return self.state
    },
    restore(data: { index: Uint8Array; docs: string[] }) {
      self.state = data
    }
  }
  return self
}

describe('vector-tier persistence', () => {
  it('round-trips a serialized index (including Uint8Array bytes) through a blob store', async () => {
    const store = fakeBlobStore()
    const source = fakeIndex({ index: new Uint8Array([1, 2, 3, 255]), docs: ['a', 'b'] })
    await saveVectorTier(source, store)

    const target = fakeIndex()
    const loaded = await loadVectorTier(target, store)
    expect(loaded).toBe(true)
    expect(Array.from(target.state.index)).toEqual([1, 2, 3, 255])
    expect(target.state.docs).toEqual(['a', 'b'])
  })

  it('uses the default blob key', async () => {
    const store = fakeBlobStore()
    await saveVectorTier(fakeIndex({ index: new Uint8Array([9]), docs: [] }), store)
    expect(store.map.has(VECTOR_TIER_BLOB_KEY)).toBe(true)
  })

  it('reports a cold tier when no snapshot exists', async () => {
    const store = fakeBlobStore()
    const target = fakeIndex()
    expect(await loadVectorTier(target, store)).toBe(false)
  })

  it('treats a corrupt snapshot as cold rather than throwing', async () => {
    const store = fakeBlobStore()
    await store.setBlob(VECTOR_TIER_BLOB_KEY, new TextEncoder().encode('not json{'))
    const target = fakeIndex({ index: new Uint8Array([7]), docs: ['keep'] })
    expect(await loadVectorTier(target, store)).toBe(false)
    // Unchanged on failure.
    expect(target.state.docs).toEqual(['keep'])
  })

  it('honors a custom key', async () => {
    const store = fakeBlobStore()
    await saveVectorTier(fakeIndex({ index: new Uint8Array([1]), docs: [] }), store, 'custom:key')
    const target = fakeIndex()
    expect(await loadVectorTier(target, store, 'custom:key')).toBe(true)
  })
})
