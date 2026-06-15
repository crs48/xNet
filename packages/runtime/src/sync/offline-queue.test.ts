import { MemoryNodeStorageAdapter } from '@xnetjs/data'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createOfflineQueue } from './offline-queue'

describe('createOfflineQueue', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('persists queued updates and replays them in FIFO order', async () => {
    const storage = new MemoryNodeStorageAdapter()
    const queue = createOfflineQueue({
      storage,
      storageKey: '_xnet_offline_queue_test'
    })

    await queue.load()

    const firstEnqueue = queue.enqueue('node-1', Uint8Array.from([1, 2, 3]))
    const secondEnqueue = queue.enqueue('node-2', Uint8Array.from([4, 5, 6]))

    await vi.advanceTimersByTimeAsync(100)
    await Promise.all([firstEnqueue, secondEnqueue])

    const reloaded = createOfflineQueue({
      storage,
      storageKey: '_xnet_offline_queue_test'
    })
    await reloaded.load()

    const drainedNodeIds: string[] = []
    const drainedCount = await reloaded.drain(async (entry) => {
      drainedNodeIds.push(entry.nodeId)
    })

    expect(reloaded.size).toBe(0)
    expect(drainedCount).toBe(2)
    expect(drainedNodeIds).toEqual(['node-1', 'node-2'])

    const postDrain = createOfflineQueue({
      storage,
      storageKey: '_xnet_offline_queue_test'
    })
    await postDrain.load()
    expect(postDrain.size).toBe(0)
  })

  it('keeps pending entries when replay stops on a failure', async () => {
    const storage = new MemoryNodeStorageAdapter()
    const queue = createOfflineQueue({
      storage,
      storageKey: '_xnet_offline_queue_failure_test'
    })

    await queue.load()

    const firstEnqueue = queue.enqueue('node-1', Uint8Array.from([1]))
    const secondEnqueue = queue.enqueue('node-2', Uint8Array.from([2]))

    await vi.advanceTimersByTimeAsync(100)
    await Promise.all([firstEnqueue, secondEnqueue])

    const drainedCount = await queue.drain(async () => {
      throw new Error('network unavailable')
    })

    expect(drainedCount).toBe(0)
    expect(queue.size).toBe(2)
  })
})
