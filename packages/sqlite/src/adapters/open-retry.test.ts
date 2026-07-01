/**
 * Tests for the web-open timeout/retry policy (exploration 0253).
 *
 * The proxy used to hard-fail on the first `open()` timeout ("Initialization
 * failed: Worker initialization timeout after 15s"). These prove it now abandons
 * the stuck worker (releasing its OPFS handle) and retries with a fresh one, so
 * the leaked-handle contention that made cold-open intermittently exceed 15 s
 * recovers instead of failing — while a genuinely stuck OPFS still fails cleanly.
 */
import { describe, expect, it, vi } from 'vitest'
import { openWithTimeoutRetry } from './open-retry'

/** A pending promise plus its resolver, so a test can settle an attempt on demand. */
function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void } {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

const noSleep = (): Promise<void> => Promise.resolve()

describe('openWithTimeoutRetry (0253)', () => {
  it('resolves without retry when the first attempt opens in time', async () => {
    const abandon = vi.fn()
    const makeAttempt = vi.fn(() => ({ open: Promise.resolve(), abandon }))

    await openWithTimeoutRetry(makeAttempt, { sleep: noSleep })

    expect(makeAttempt).toHaveBeenCalledTimes(1)
    expect(abandon).not.toHaveBeenCalled()
  })

  it('abandons a timed-out worker and recovers on a fresh attempt (the leaked-handle case)', async () => {
    vi.useFakeTimers()
    try {
      const attempts: Array<{ abandon: ReturnType<typeof vi.fn> }> = []
      const makeAttempt = vi.fn((n: number) => {
        const abandon = vi.fn()
        attempts.push({ abandon })
        // Attempt 1 never opens (stuck like a contended handle); attempt 2 opens.
        const open = n === 1 ? deferred<void>().promise : Promise.resolve()
        return { open, abandon }
      })

      const done = openWithTimeoutRetry(makeAttempt, { timeoutMs: 15000, sleep: noSleep })
      // Let attempt 1's timeout fire, then the retry runs.
      await vi.advanceTimersByTimeAsync(15000)
      await vi.runAllTimersAsync()
      await expect(done).resolves.toBeUndefined()

      expect(makeAttempt).toHaveBeenCalledTimes(2)
      expect(attempts[0].abandon).toHaveBeenCalledTimes(1) // stuck worker terminated → handle freed
      expect(attempts[1].abandon).not.toHaveBeenCalled() // the recovering attempt is kept
    } finally {
      vi.useRealTimers()
    }
  })

  it('gives up after maxAttempts, abandoning every stuck worker (genuinely broken OPFS)', async () => {
    vi.useFakeTimers()
    try {
      const abandons: Array<ReturnType<typeof vi.fn>> = []
      const makeAttempt = vi.fn(() => {
        const abandon = vi.fn()
        abandons.push(abandon)
        return { open: deferred<void>().promise, abandon } // never opens
      })

      const done = openWithTimeoutRetry(makeAttempt, {
        maxAttempts: 3,
        timeoutMs: 15000,
        sleep: noSleep
      }).catch((e) => e as Error)

      await vi.runAllTimersAsync()
      const err = await done
      expect(err).toBeInstanceOf(Error)
      expect((err as Error).message).toContain('timeout')
      expect(makeAttempt).toHaveBeenCalledTimes(3)
      expect(abandons).toHaveLength(3)
      for (const a of abandons) expect(a).toHaveBeenCalledTimes(1) // no leaked worker on final failure
    } finally {
      vi.useRealTimers()
    }
  })

  it('fires onRetry before each retry but not before the first or after the last', async () => {
    vi.useFakeTimers()
    try {
      const onRetry = vi.fn()
      const makeAttempt = vi.fn(() => ({ open: deferred<void>().promise, abandon: vi.fn() }))
      const done = openWithTimeoutRetry(makeAttempt, {
        maxAttempts: 3,
        timeoutMs: 1000,
        sleep: noSleep,
        onRetry
      }).catch(() => undefined)
      await vi.runAllTimersAsync()
      await done
      // 3 attempts → 2 retries → 2 onRetry calls (attempts 1 and 2).
      expect(onRetry).toHaveBeenCalledTimes(2)
      expect(onRetry.mock.calls[0][0]).toBe(1)
      expect(onRetry.mock.calls[1][0]).toBe(2)
    } finally {
      vi.useRealTimers()
    }
  })
})
