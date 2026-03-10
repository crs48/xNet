import { describe, expect, it, vi } from 'vitest'
import {
  createAnimationFrameBatcher,
  type AnimationFrameBatcherScheduler
} from '../hooks/animation-frame-batcher'

type SchedulerMock = AnimationFrameBatcherScheduler & {
  flush: (timestamp?: number) => void
}

function createSchedulerMock(): SchedulerMock {
  let nextFrameId = 0
  const callbacks = new Map<number, FrameRequestCallback>()

  return {
    requestFrame: vi.fn((callback: FrameRequestCallback) => {
      nextFrameId += 1
      callbacks.set(nextFrameId, callback)
      return nextFrameId
    }),
    cancelFrame: vi.fn((frameId: number) => {
      callbacks.delete(frameId)
    }),
    flush: (timestamp = 16) => {
      const pending = Array.from(callbacks.values())
      callbacks.clear()
      for (const callback of pending) {
        callback(timestamp)
      }
    }
  }
}

describe('createAnimationFrameBatcher', () => {
  it('coalesces repeated schedules into a single animation frame commit', () => {
    const scheduler = createSchedulerMock()
    const commit = vi.fn()
    const batcher = createAnimationFrameBatcher(commit, scheduler)

    batcher.schedule()
    batcher.schedule()
    batcher.schedule()

    expect(scheduler.requestFrame).toHaveBeenCalledTimes(1)
    expect(batcher.isScheduled()).toBe(true)
    expect(commit).not.toHaveBeenCalled()

    scheduler.flush()

    expect(commit).toHaveBeenCalledTimes(1)
    expect(batcher.isScheduled()).toBe(false)
  })

  it('cancels pending frame work and supports immediate flushes', () => {
    const scheduler = createSchedulerMock()
    const commit = vi.fn()
    const batcher = createAnimationFrameBatcher(commit, scheduler)

    batcher.schedule()

    expect(batcher.isScheduled()).toBe(true)

    batcher.cancel()

    expect(scheduler.cancelFrame).toHaveBeenCalledTimes(1)
    expect(batcher.isScheduled()).toBe(false)

    scheduler.flush()

    expect(commit).not.toHaveBeenCalled()

    batcher.flush()

    expect(commit).toHaveBeenCalledTimes(1)
  })

  it('falls back to synchronous commits when no animation-frame scheduler is available', () => {
    const commit = vi.fn()
    const batcher = createAnimationFrameBatcher(commit, null)

    batcher.schedule()

    expect(commit).toHaveBeenCalledTimes(1)
    expect(batcher.isScheduled()).toBe(false)
  })
})
