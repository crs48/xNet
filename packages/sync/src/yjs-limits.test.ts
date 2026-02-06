/**
 * Tests for Yjs Size and Rate Limits
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
  YjsRateLimiter,
  isUpdateTooLarge,
  isDocumentTooLarge,
  calculateChunkCount,
  chunkUpdate,
  reassembleChunks,
  MAX_YJS_UPDATE_SIZE,
  MAX_YJS_DOC_SIZE,
  YJS_SYNC_CHUNK_SIZE
} from './yjs-limits'

describe('YjsRateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('allows updates within rate limit', () => {
    const limiter = new YjsRateLimiter({ maxPerSecond: 30, maxPerMinute: 600, burstAllowance: 10 })

    for (let i = 0; i < 30; i++) {
      expect(limiter.allow('peer-1')).toBe(true)
    }
  })

  it('allows burst above per-second limit', () => {
    const limiter = new YjsRateLimiter({ maxPerSecond: 5, maxPerMinute: 600, burstAllowance: 5 })

    // Should allow 5 + 5 = 10 in burst
    for (let i = 0; i < 10; i++) {
      expect(limiter.allow('peer-1')).toBe(true)
    }

    // 11th should be rejected
    expect(limiter.allow('peer-1')).toBe(false)
  })

  it('rejects updates exceeding burst allowance', () => {
    const limiter = new YjsRateLimiter({ maxPerSecond: 5, maxPerMinute: 600, burstAllowance: 2 })

    for (let i = 0; i < 7; i++) {
      limiter.allow('peer-1')
    }

    expect(limiter.allow('peer-1')).toBe(false)
  })

  it('resets after second window expires', () => {
    const limiter = new YjsRateLimiter({ maxPerSecond: 2, maxPerMinute: 600, burstAllowance: 0 })

    expect(limiter.allow('peer-1')).toBe(true)
    expect(limiter.allow('peer-1')).toBe(true)
    expect(limiter.allow('peer-1')).toBe(false)

    // Advance 1.1 seconds
    vi.advanceTimersByTime(1100)

    expect(limiter.allow('peer-1')).toBe(true)
  })

  it('enforces per-minute sustained limit', () => {
    const limiter = new YjsRateLimiter({ maxPerSecond: 100, maxPerMinute: 10, burstAllowance: 0 })

    for (let i = 0; i < 10; i++) {
      expect(limiter.allow('peer-1')).toBe(true)
    }

    expect(limiter.allow('peer-1')).toBe(false)
  })

  it('resets minute window after expiry', () => {
    const limiter = new YjsRateLimiter({ maxPerSecond: 100, maxPerMinute: 5, burstAllowance: 0 })

    for (let i = 0; i < 5; i++) {
      limiter.allow('peer-1')
    }
    expect(limiter.allow('peer-1')).toBe(false)

    // Advance 61 seconds
    vi.advanceTimersByTime(61_000)

    expect(limiter.allow('peer-1')).toBe(true)
  })

  it('tracks different peers independently', () => {
    const limiter = new YjsRateLimiter({ maxPerSecond: 2, maxPerMinute: 600, burstAllowance: 0 })

    expect(limiter.allow('peer-1')).toBe(true)
    expect(limiter.allow('peer-1')).toBe(true)
    expect(limiter.allow('peer-1')).toBe(false)

    // peer-2 should still be able to send
    expect(limiter.allow('peer-2')).toBe(true)
    expect(limiter.allow('peer-2')).toBe(true)
  })

  it('returns rate info for peer', () => {
    const limiter = new YjsRateLimiter()

    expect(limiter.getInfo('peer-1')).toBeUndefined()

    limiter.allow('peer-1')
    limiter.allow('peer-1')

    const info = limiter.getInfo('peer-1')
    expect(info).toBeDefined()
    expect(info!.perSecond).toBe(2)
    expect(info!.perMinute).toBe(2)
  })

  it('removes peer state', () => {
    const limiter = new YjsRateLimiter({ maxPerSecond: 2, maxPerMinute: 600, burstAllowance: 0 })

    limiter.allow('peer-1')
    limiter.allow('peer-1')
    expect(limiter.allow('peer-1')).toBe(false)

    limiter.remove('peer-1')

    // After removal, peer starts fresh
    expect(limiter.allow('peer-1')).toBe(true)
  })

  it('clears all state', () => {
    const limiter = new YjsRateLimiter({
      maxPerSecond: 1,
      maxPerMinute: 600,
      burstAllowance: 0,
      cleanupIntervalMs: 0
    })

    limiter.allow('peer-1')
    limiter.allow('peer-2')

    expect(limiter.allow('peer-1')).toBe(false)
    expect(limiter.allow('peer-2')).toBe(false)

    limiter.clear()

    expect(limiter.allow('peer-1')).toBe(true)
    expect(limiter.allow('peer-2')).toBe(true)

    limiter.stopCleanup()
  })

  it('tracks peer count', () => {
    const limiter = new YjsRateLimiter({ cleanupIntervalMs: 0 })
    expect(limiter.peerCount).toBe(0)

    limiter.allow('peer-1')
    expect(limiter.peerCount).toBe(1)

    limiter.allow('peer-2')
    expect(limiter.peerCount).toBe(2)

    limiter.allow('peer-1') // Same peer
    expect(limiter.peerCount).toBe(2)

    limiter.stopCleanup()
  })

  it('cleanupStale removes entries with expired windows', () => {
    const limiter = new YjsRateLimiter({
      cleanupIntervalMs: 0,
      staleThresholdMs: 1000 // 1 second
    })

    limiter.allow('peer-1')
    limiter.allow('peer-2')
    expect(limiter.peerCount).toBe(2)

    // Advance past minute window expiry (60s) + stale threshold (1s) = 61s
    // This ensures both second and minute windows are stale
    vi.advanceTimersByTime(62_000)

    // Access peer-1 to keep it fresh (creates new windows)
    limiter.allow('peer-1')

    // Cleanup should remove peer-2 (both windows stale)
    const removed = limiter.cleanupStale()
    expect(removed).toBeGreaterThan(0)
    expect(limiter.peerCount).toBe(1)
  })

  it('auto-cleanup runs on interval', () => {
    const limiter = new YjsRateLimiter({
      cleanupIntervalMs: 100,
      staleThresholdMs: 50
    })

    limiter.allow('peer-1')
    expect(limiter.peerCount).toBe(1)

    // Advance past minute window expiry (60s) + stale threshold (50ms) + cleanup interval (100ms)
    vi.advanceTimersByTime(61_000)

    // Auto cleanup should have run
    expect(limiter.peerCount).toBe(0)

    limiter.stopCleanup()
  })

  it('stopCleanup prevents auto cleanup', () => {
    const limiter = new YjsRateLimiter({
      cleanupIntervalMs: 100,
      staleThresholdMs: 50
    })

    limiter.allow('peer-1')
    limiter.stopCleanup()

    // Advance past cleanup interval
    vi.advanceTimersByTime(1200)

    // Peer should still exist (cleanup didn't run)
    expect(limiter.peerCount).toBe(1)
  })

  it('destroy stops cleanup and clears state', () => {
    const limiter = new YjsRateLimiter({
      cleanupIntervalMs: 100,
      staleThresholdMs: 50
    })

    limiter.allow('peer-1')
    limiter.allow('peer-2')
    expect(limiter.peerCount).toBe(2)

    limiter.destroy()
    expect(limiter.peerCount).toBe(0)

    // Advance time - should not cause errors
    vi.advanceTimersByTime(200)
    expect(limiter.peerCount).toBe(0)
  })
})

describe('isUpdateTooLarge', () => {
  it('returns false for small update', () => {
    const update = new Uint8Array(1024)
    expect(isUpdateTooLarge(update)).toBe(false)
  })

  it('returns false for update at exact limit', () => {
    const update = new Uint8Array(MAX_YJS_UPDATE_SIZE)
    expect(isUpdateTooLarge(update)).toBe(false)
  })

  it('returns true for update exceeding limit', () => {
    const update = new Uint8Array(MAX_YJS_UPDATE_SIZE + 1)
    expect(isUpdateTooLarge(update)).toBe(true)
  })

  it('accepts custom max size', () => {
    const update = new Uint8Array(100)
    expect(isUpdateTooLarge(update, 50)).toBe(true)
    expect(isUpdateTooLarge(update, 200)).toBe(false)
  })
})

describe('isDocumentTooLarge', () => {
  it('returns false for small document', () => {
    const state = new Uint8Array(1024)
    expect(isDocumentTooLarge(state)).toBe(false)
  })

  it('returns true for document exceeding limit', () => {
    const state = new Uint8Array(MAX_YJS_DOC_SIZE + 1)
    expect(isDocumentTooLarge(state)).toBe(true)
  })
})

describe('calculateChunkCount', () => {
  it('returns 1 for small update', () => {
    expect(calculateChunkCount(1024)).toBe(1)
  })

  it('returns correct count for exact multiple', () => {
    expect(calculateChunkCount(YJS_SYNC_CHUNK_SIZE * 4)).toBe(4)
  })

  it('rounds up for non-exact multiple', () => {
    expect(calculateChunkCount(YJS_SYNC_CHUNK_SIZE * 2 + 100)).toBe(3)
  })

  it('accepts custom chunk size', () => {
    expect(calculateChunkCount(1000, 100)).toBe(10)
    expect(calculateChunkCount(1001, 100)).toBe(11)
  })
})

describe('chunkUpdate', () => {
  it('returns single chunk for small update', () => {
    const update = new Uint8Array([1, 2, 3, 4, 5])
    const chunks = chunkUpdate(update, 10)

    expect(chunks).toHaveLength(1)
    expect(chunks[0]).toEqual(update)
  })

  it('splits update into correct number of chunks', () => {
    const update = new Uint8Array(100)
    const chunks = chunkUpdate(update, 30)

    expect(chunks).toHaveLength(4) // 30 + 30 + 30 + 10
    expect(chunks[0].length).toBe(30)
    expect(chunks[1].length).toBe(30)
    expect(chunks[2].length).toBe(30)
    expect(chunks[3].length).toBe(10)
  })

  it('handles exact multiple', () => {
    const update = new Uint8Array(90)
    const chunks = chunkUpdate(update, 30)

    expect(chunks).toHaveLength(3)
    chunks.forEach((chunk) => expect(chunk.length).toBe(30))
  })

  it('preserves data correctly', () => {
    const update = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    const chunks = chunkUpdate(update, 3)

    expect(chunks[0]).toEqual(new Uint8Array([1, 2, 3]))
    expect(chunks[1]).toEqual(new Uint8Array([4, 5, 6]))
    expect(chunks[2]).toEqual(new Uint8Array([7, 8, 9]))
    expect(chunks[3]).toEqual(new Uint8Array([10]))
  })
})

describe('reassembleChunks', () => {
  it('reassembles chunks correctly', () => {
    const chunks = [new Uint8Array([1, 2, 3]), new Uint8Array([4, 5, 6]), new Uint8Array([7, 8])]

    const result = reassembleChunks(chunks)

    expect(result).toEqual(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]))
  })

  it('handles single chunk', () => {
    const chunks = [new Uint8Array([1, 2, 3])]
    const result = reassembleChunks(chunks)

    expect(result).toEqual(new Uint8Array([1, 2, 3]))
  })

  it('handles empty array', () => {
    const result = reassembleChunks([])
    expect(result).toEqual(new Uint8Array([]))
  })

  it('round-trips with chunkUpdate', () => {
    const original = new Uint8Array(1000).map((_, i) => i % 256)
    const chunks = chunkUpdate(original, 100)
    const reassembled = reassembleChunks(chunks)

    expect(reassembled).toEqual(original)
  })
})
