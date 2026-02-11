import type { StorageAdapter } from '../types'
import type { ContentId } from '@xnet/core'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { BatchWriter, createBatchWriter } from './batch-writer'

function createMockAdapter(): StorageAdapter & {
  blobs: Map<string, Uint8Array>
  setCalls: number
} {
  const blobs = new Map<string, Uint8Array>()
  let setCalls = 0

  return {
    blobs,
    get setCalls() {
      return setCalls
    },
    async open() {},
    async close() {},
    async clear() {
      blobs.clear()
    },
    async getBlob(cid) {
      return blobs.get(cid) ?? null
    },
    async setBlob(cid, data) {
      setCalls++
      blobs.set(cid, data)
    },
    async hasBlob(cid) {
      return blobs.has(cid)
    }
  }
}

describe('BatchWriter', () => {
  let adapter: ReturnType<typeof createMockAdapter>
  let batcher: BatchWriter

  beforeEach(() => {
    vi.useFakeTimers()
    adapter = createMockAdapter()
    batcher = createBatchWriter(adapter, { maxBatchSize: 5, maxWaitMs: 100 })
  })

  describe('blob operations', () => {
    it('should batch setBlob calls', async () => {
      const cid1 = 'cid:blake3:abc123' as ContentId
      const cid2 = 'cid:blake3:def456' as ContentId
      const data1 = new Uint8Array([1, 2, 3])
      const data2 = new Uint8Array([4, 5, 6])

      await batcher.setBlob(cid1, data1)
      await batcher.setBlob(cid2, data2)

      expect(await batcher.getBlob(cid1)).toEqual(data1)
      expect(await batcher.hasBlob(cid2)).toBe(true)

      expect(adapter.setCalls).toBe(0)

      await batcher.flush()

      expect(adapter.setCalls).toBe(2)
    })

    it('should dedupe blobs with same cid', async () => {
      const cid = 'cid:blake3:abc123' as ContentId
      const data = new Uint8Array([1, 2, 3])

      await batcher.setBlob(cid, data)
      await batcher.setBlob(cid, data)

      expect(batcher.pendingCount).toBe(1)
    })

    it('should auto-flush when maxBatchSize reached', async () => {
      for (let i = 0; i < 5; i++) {
        await batcher.setBlob(`cid:blake3:blob${i}` as ContentId, new Uint8Array([i]))
      }

      await vi.runAllTimersAsync()

      expect(adapter.setCalls).toBe(5)
    })

    it('should auto-flush after maxWaitMs', async () => {
      await batcher.setBlob('cid:blake3:abc' as ContentId, new Uint8Array([1]))

      expect(adapter.setCalls).toBe(0)

      await vi.advanceTimersByTimeAsync(150)

      expect(adapter.setCalls).toBe(1)
    })
  })

  describe('flush behavior', () => {
    it('should handle concurrent flushes', async () => {
      await batcher.setBlob('cid:blake3:abc' as ContentId, new Uint8Array([1]))

      const flush1 = batcher.flush()
      const flush2 = batcher.flush()
      const flush3 = batcher.flush()

      await Promise.all([flush1, flush2, flush3])

      expect(adapter.setCalls).toBe(1)
    })

    it('should flush on close', async () => {
      await batcher.setBlob('cid:blake3:abc' as ContentId, new Uint8Array([1]))

      expect(adapter.setCalls).toBe(0)

      await batcher.close()

      expect(adapter.setCalls).toBe(1)
    })
  })
})
