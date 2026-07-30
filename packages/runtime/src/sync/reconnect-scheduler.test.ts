import { fixed, limitAttempts } from '@xnetjs/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createReconnectScheduler } from './reconnect-scheduler'

describe('createReconnectScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('fires onRetry after the policy delay and counts the attempt', () => {
    const onRetry = vi.fn()
    const scheduler = createReconnectScheduler({ policy: () => fixed(250), onRetry })

    expect(scheduler.schedule()).toBe(true)
    expect(scheduler.attempts).toBe(1)
    expect(scheduler.pending).toBe(true)

    vi.advanceTimersByTime(249)
    expect(onRetry).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onRetry).toHaveBeenCalledTimes(1)
    expect(scheduler.pending).toBe(false)
  })

  it('never double-arms: schedule() while pending is a no-op', () => {
    const onRetry = vi.fn()
    const scheduler = createReconnectScheduler({ policy: () => fixed(100), onRetry })

    expect(scheduler.schedule()).toBe(true)
    expect(scheduler.schedule()).toBe(false)
    expect(scheduler.attempts).toBe(1)

    vi.advanceTimersByTime(100)
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('gives up when the policy returns null (attempt cap)', () => {
    const onRetry = vi.fn()
    const scheduler = createReconnectScheduler({
      policy: () => limitAttempts(fixed(100), 2),
      onRetry
    })

    expect(scheduler.schedule()).toBe(true)
    vi.advanceTimersByTime(100)
    expect(scheduler.schedule()).toBe(true)
    vi.advanceTimersByTime(100)
    expect(scheduler.schedule()).toBe(false)
    expect(scheduler.pending).toBe(false)
    expect(onRetry).toHaveBeenCalledTimes(2)
  })

  it('reset() forgets attempt history so the policy starts over', () => {
    const scheduler = createReconnectScheduler({
      policy: () => limitAttempts(fixed(100), 1),
      onRetry: vi.fn()
    })

    expect(scheduler.schedule()).toBe(true)
    vi.advanceTimersByTime(100)
    expect(scheduler.schedule()).toBe(false)

    scheduler.reset()
    expect(scheduler.attempts).toBe(0)
    expect(scheduler.schedule()).toBe(true)
  })

  it('cancel() clears the armed timer without firing (no orphaned timers)', () => {
    const onRetry = vi.fn()
    const scheduler = createReconnectScheduler({ policy: () => fixed(100), onRetry })

    scheduler.schedule()
    scheduler.cancel()
    expect(scheduler.pending).toBe(false)

    vi.advanceTimersByTime(10_000)
    expect(onRetry).not.toHaveBeenCalled()
    // Attempt history survives cancel (matches legacy provider behavior).
    expect(scheduler.attempts).toBe(1)
  })

  it('consults the policy selector per attempt (rate-limit vs ordinary switch)', () => {
    let rateLimited = true
    const onRetry = vi.fn()
    const scheduler = createReconnectScheduler({
      policy: () => (rateLimited ? fixed(15_000) : fixed(250)),
      onRetry
    })

    scheduler.schedule()
    vi.advanceTimersByTime(15_000)
    expect(onRetry).toHaveBeenCalledTimes(1)

    rateLimited = false
    scheduler.schedule()
    vi.advanceTimersByTime(250)
    expect(onRetry).toHaveBeenCalledTimes(2)
  })
})
