import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { debounce, throttle, measure, measureAsync, requestIdle, cancelIdle } from './performance'

describe('debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('delays function execution', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 100)

    debounced()
    expect(fn).not.toHaveBeenCalled()

    vi.advanceTimersByTime(100)
    expect(fn).toHaveBeenCalledOnce()
  })

  it('resets timer on subsequent calls', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 100)

    debounced()
    vi.advanceTimersByTime(50)
    debounced() // Reset timer
    vi.advanceTimersByTime(50)
    expect(fn).not.toHaveBeenCalled()

    vi.advanceTimersByTime(50)
    expect(fn).toHaveBeenCalledOnce()
  })

  it('passes arguments to the function', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 100)

    debounced('a', 'b')
    vi.advanceTimersByTime(100)
    expect(fn).toHaveBeenCalledWith('a', 'b')
  })

  it('uses the latest arguments', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 100)

    debounced('first')
    debounced('second')
    vi.advanceTimersByTime(100)
    expect(fn).toHaveBeenCalledWith('second')
  })

  it('cancel() prevents execution', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 100)

    debounced()
    debounced.cancel()
    vi.advanceTimersByTime(200)
    expect(fn).not.toHaveBeenCalled()
  })

  it('cancel() is safe to call when no timer is pending', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 100)
    expect(() => debounced.cancel()).not.toThrow()
  })
})

describe('throttle', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('executes immediately on first call', () => {
    const fn = vi.fn()
    const throttled = throttle(fn, 100)

    throttled()
    expect(fn).toHaveBeenCalledOnce()
  })

  it('throttles subsequent calls within interval', () => {
    const fn = vi.fn()
    const throttled = throttle(fn, 100)

    throttled()
    throttled()
    throttled()
    expect(fn).toHaveBeenCalledOnce()
  })

  it('executes trailing call after interval', () => {
    const fn = vi.fn()
    const throttled = throttle(fn, 100)

    throttled()
    throttled() // queued
    expect(fn).toHaveBeenCalledOnce()

    vi.advanceTimersByTime(100)
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('allows calls after interval has passed', () => {
    const fn = vi.fn()
    const throttled = throttle(fn, 100)

    throttled()
    vi.advanceTimersByTime(100)
    throttled()
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('passes arguments to the function', () => {
    const fn = vi.fn()
    const throttled = throttle(fn, 100)

    throttled('hello')
    expect(fn).toHaveBeenCalledWith('hello')
  })

  it('cancel() clears pending trailing call', () => {
    const fn = vi.fn()
    const throttled = throttle(fn, 100)

    throttled()
    throttled() // queued trailing
    throttled.cancel()
    vi.advanceTimersByTime(200)
    expect(fn).toHaveBeenCalledOnce() // only the first immediate call
  })
})

describe('measure', () => {
  it('returns the function result', () => {
    const { result } = measure(() => 42)
    expect(result).toBe(42)
  })

  it('returns a duration >= 0', () => {
    const { duration } = measure(() => {
      let sum = 0
      for (let i = 0; i < 1000; i++) sum += i
      return sum
    })
    expect(duration).toBeGreaterThanOrEqual(0)
  })

  it('duration is a number in milliseconds', () => {
    const { duration } = measure(() => 'test')
    expect(typeof duration).toBe('number')
    expect(Number.isFinite(duration)).toBe(true)
  })
})

describe('measureAsync', () => {
  it('returns the async function result', async () => {
    const { result } = await measureAsync(async () => 'async result')
    expect(result).toBe('async result')
  })

  it('returns a duration >= 0', async () => {
    const { duration } = await measureAsync(async () => {
      return new Promise((resolve) => setTimeout(resolve, 10))
    })
    expect(duration).toBeGreaterThanOrEqual(0)
  })

  it('measures actual async work', async () => {
    const { duration } = await measureAsync(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50))
      return 'done'
    })
    // Should be at least ~50ms (with some tolerance for CI)
    expect(duration).toBeGreaterThanOrEqual(30)
  })
})

describe('requestIdle / cancelIdle', () => {
  it('calls the callback', async () => {
    const fn = vi.fn()
    requestIdle(fn)
    // Wait for the polyfill setTimeout(1ms) to fire
    await new Promise((resolve) => setTimeout(resolve, 60))
    expect(fn).toHaveBeenCalledOnce()
  })

  it('provides deadline object with timeRemaining', async () => {
    let deadline: any
    requestIdle((d) => {
      deadline = d
    })
    await new Promise((resolve) => setTimeout(resolve, 60))
    expect(deadline).toBeDefined()
    expect(typeof deadline.timeRemaining).toBe('function')
    expect(typeof deadline.didTimeout).toBe('boolean')
  })

  it('cancelIdle prevents callback', async () => {
    const fn = vi.fn()
    const id = requestIdle(fn)
    cancelIdle(id)
    await new Promise((resolve) => setTimeout(resolve, 60))
    expect(fn).not.toHaveBeenCalled()
  })
})
