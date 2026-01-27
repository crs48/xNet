/**
 * Tests for YjsBatcher - Batching Yjs updates for efficient hash chain integration
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { YjsBatcher, DEFAULT_BATCHER_CONFIG, type BatchFlushCallback } from './yjs-batcher'

describe('YjsBatcher', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('basic batching', () => {
    it('batches updates within time window', () => {
      const flushed: { update: Uint8Array; count: number }[] = []
      const onFlush: BatchFlushCallback = (update, count) => {
        flushed.push({ update, count })
      }

      const batcher = new YjsBatcher(onFlush, { batchWindowMs: 100 })

      batcher.add(new Uint8Array([1]))
      batcher.add(new Uint8Array([2]))
      batcher.add(new Uint8Array([3]))

      // Not flushed yet
      expect(flushed).toHaveLength(0)
      expect(batcher.pendingCount()).toBe(3)

      // Advance time past window
      vi.advanceTimersByTime(150)

      // Now flushed
      expect(flushed).toHaveLength(1)
      expect(flushed[0].count).toBe(3)
      expect(batcher.pendingCount()).toBe(0)
    })

    it('resets timer when adding updates', () => {
      const flushed: { count: number }[] = []
      const batcher = new YjsBatcher((_, count) => flushed.push({ count }), {
        batchWindowMs: 100
      })

      batcher.add(new Uint8Array([1]))
      vi.advanceTimersByTime(50) // 50ms elapsed

      batcher.add(new Uint8Array([2]))
      vi.advanceTimersByTime(50) // 50ms more, but timer was reset

      // Still not flushed (only 50ms since last add)
      expect(flushed).toHaveLength(0)

      vi.advanceTimersByTime(60) // Now past 100ms since last add

      expect(flushed).toHaveLength(1)
      expect(flushed[0].count).toBe(2)
    })
  })

  describe('maxBatchSize', () => {
    it('flushes when batch size is reached', () => {
      const flushed: { count: number }[] = []
      const batcher = new YjsBatcher((_, count) => flushed.push({ count }), {
        maxBatchSize: 3,
        batchWindowMs: 10000 // Long window, shouldn't trigger
      })

      batcher.add(new Uint8Array([1]))
      batcher.add(new Uint8Array([2]))
      expect(flushed).toHaveLength(0)

      batcher.add(new Uint8Array([3])) // Hits maxBatchSize

      expect(flushed).toHaveLength(1)
      expect(flushed[0].count).toBe(3)
      expect(batcher.pendingCount()).toBe(0)
    })

    it('continues accepting after max size flush', () => {
      const flushed: { count: number }[] = []
      const batcher = new YjsBatcher((_, count) => flushed.push({ count }), {
        maxBatchSize: 2,
        batchWindowMs: 10000
      })

      batcher.add(new Uint8Array([1]))
      batcher.add(new Uint8Array([2])) // Flush
      batcher.add(new Uint8Array([3]))
      batcher.add(new Uint8Array([4])) // Flush again

      expect(flushed).toHaveLength(2)
      expect(flushed[0].count).toBe(2)
      expect(flushed[1].count).toBe(2)
    })
  })

  describe('flushOnParagraph', () => {
    it('flushes on paragraph break when enabled', () => {
      const flushed: { count: number }[] = []
      const batcher = new YjsBatcher((_, count) => flushed.push({ count }), {
        flushOnParagraph: true,
        batchWindowMs: 10000
      })

      batcher.add(new Uint8Array([1]))
      batcher.add(new Uint8Array([2]))
      expect(flushed).toHaveLength(0)

      batcher.add(new Uint8Array([3]), true) // Paragraph break

      expect(flushed).toHaveLength(1)
      expect(flushed[0].count).toBe(3)
    })

    it('does not flush on paragraph break when disabled', () => {
      const flushed: { count: number }[] = []
      const batcher = new YjsBatcher((_, count) => flushed.push({ count }), {
        flushOnParagraph: false,
        batchWindowMs: 10000
      })

      batcher.add(new Uint8Array([1]))
      batcher.add(new Uint8Array([2]), true) // Paragraph break, but disabled

      expect(flushed).toHaveLength(0)
      expect(batcher.pendingCount()).toBe(2)
    })
  })

  describe('manual flush', () => {
    it('flush() empties pending updates', () => {
      const flushed: { count: number }[] = []
      const batcher = new YjsBatcher((_, count) => flushed.push({ count }), {
        batchWindowMs: 10000
      })

      batcher.add(new Uint8Array([1]))
      batcher.add(new Uint8Array([2]))
      expect(batcher.pendingCount()).toBe(2)

      batcher.flush()

      expect(flushed).toHaveLength(1)
      expect(flushed[0].count).toBe(2)
      expect(batcher.pendingCount()).toBe(0)
    })

    it('flush() is safe when empty', () => {
      const flushed: { count: number }[] = []
      const batcher = new YjsBatcher((_, count) => flushed.push({ count }))

      batcher.flush() // Should not throw
      expect(flushed).toHaveLength(0)
    })

    it('flush() clears pending timer', () => {
      const flushed: { count: number }[] = []
      const batcher = new YjsBatcher((_, count) => flushed.push({ count }), {
        batchWindowMs: 100
      })

      batcher.add(new Uint8Array([1]))
      batcher.flush()

      // Timer should be cleared, advancing time should not cause another flush
      vi.advanceTimersByTime(200)

      expect(flushed).toHaveLength(1) // Only the manual flush
    })
  })

  describe('destroy', () => {
    it('destroy() flushes remaining updates', () => {
      const flushed: { count: number }[] = []
      const batcher = new YjsBatcher((_, count) => flushed.push({ count }), {
        batchWindowMs: 10000
      })

      batcher.add(new Uint8Array([1]))
      batcher.add(new Uint8Array([2]))

      batcher.destroy()

      expect(flushed).toHaveLength(1)
      expect(flushed[0].count).toBe(2)
    })

    it('ignores add() calls after destroy', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const flushed: { count: number }[] = []
      const batcher = new YjsBatcher((_, count) => flushed.push({ count }))

      batcher.destroy()
      batcher.add(new Uint8Array([1]))

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('after destroy'))
      expect(batcher.pendingCount()).toBe(0)

      warnSpy.mockRestore()
    })

    it('destroy() is idempotent', () => {
      const flushed: { count: number }[] = []
      const batcher = new YjsBatcher((_, count) => flushed.push({ count }))

      batcher.add(new Uint8Array([1]))
      batcher.destroy()
      batcher.destroy() // Should not throw or double-flush

      expect(flushed).toHaveLength(1)
    })

    it('isDestroyed() returns correct state', () => {
      const batcher = new YjsBatcher(() => {})

      expect(batcher.isDestroyed()).toBe(false)
      batcher.destroy()
      expect(batcher.isDestroyed()).toBe(true)
    })
  })

  describe('hasPending', () => {
    it('returns correct state', () => {
      const batcher = new YjsBatcher(() => {}, { batchWindowMs: 10000 })

      expect(batcher.hasPending()).toBe(false)

      batcher.add(new Uint8Array([1]))
      expect(batcher.hasPending()).toBe(true)

      batcher.flush()
      expect(batcher.hasPending()).toBe(false)
    })
  })

  describe('merge function', () => {
    it('uses provided merge function', () => {
      const flushed: { update: Uint8Array }[] = []

      // Custom merge that prefixes with 0xFF
      const customMerge = (updates: Uint8Array[]): Uint8Array => {
        const total = updates.reduce((sum, u) => sum + u.length, 0)
        const merged = new Uint8Array(total + 1)
        merged[0] = 0xff // Marker
        let offset = 1
        for (const u of updates) {
          merged.set(u, offset)
          offset += u.length
        }
        return merged
      }

      const batcher = new YjsBatcher(
        (update) => flushed.push({ update }),
        { batchWindowMs: 10000 },
        customMerge
      )

      batcher.add(new Uint8Array([1, 2]))
      batcher.add(new Uint8Array([3, 4]))
      batcher.flush()

      expect(flushed).toHaveLength(1)
      expect(flushed[0].update).toEqual(new Uint8Array([0xff, 1, 2, 3, 4]))
    })

    it('uses default concatenation if no merge function provided', () => {
      const flushed: { update: Uint8Array }[] = []

      const batcher = new YjsBatcher((update) => flushed.push({ update }), {
        batchWindowMs: 10000
      })

      batcher.add(new Uint8Array([1, 2]))
      batcher.add(new Uint8Array([3, 4]))
      batcher.flush()

      expect(flushed).toHaveLength(1)
      expect(flushed[0].update).toEqual(new Uint8Array([1, 2, 3, 4]))
    })
  })

  describe('error handling', () => {
    it('catches and logs errors in flush callback', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const batcher = new YjsBatcher(() => {
        throw new Error('Callback error')
      })

      batcher.add(new Uint8Array([1]))
      batcher.flush() // Should not throw

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error in flush callback'),
        expect.any(Error)
      )

      errorSpy.mockRestore()
    })
  })

  describe('default config', () => {
    it('uses DEFAULT_BATCHER_CONFIG values', () => {
      expect(DEFAULT_BATCHER_CONFIG.batchWindowMs).toBe(2000)
      expect(DEFAULT_BATCHER_CONFIG.maxBatchSize).toBe(50)
      expect(DEFAULT_BATCHER_CONFIG.flushOnParagraph).toBe(true)
    })
  })
})
