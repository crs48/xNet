import { describe, expect, it, vi } from 'vitest'
import { singleFlight } from './single-flight'

function deferred<T>(): {
  promise: Promise<T>
  resolve: (v: T) => void
  reject: (e: unknown) => void
} {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('singleFlight', () => {
  it('concurrent callers share one in-flight promise', async () => {
    const map = new Map<string, Promise<number>>()
    const gate = deferred<number>()
    const fn = vi.fn(() => gate.promise)

    const a = singleFlight(map, 'k', fn)
    const b = singleFlight(map, 'k', fn)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(a).toBe(b)

    gate.resolve(42)
    await expect(a).resolves.toBe(42)
  })

  it("retain 'settled' (default) removes the entry once settled — next call re-runs", async () => {
    const map = new Map<string, Promise<number>>()
    let n = 0
    const fn = () => Promise.resolve(++n)

    await expect(singleFlight(map, 'k', fn)).resolves.toBe(1)
    expect(map.has('k')).toBe(false)
    await expect(singleFlight(map, 'k', fn)).resolves.toBe(2)
  })

  it("retain 'keep' memoizes successes until the caller evicts", async () => {
    const map = new Map<string, Promise<number>>()
    let n = 0
    const fn = () => Promise.resolve(++n)

    await expect(singleFlight(map, 'k', fn, { retain: 'keep' })).resolves.toBe(1)
    expect(map.has('k')).toBe(true)
    await expect(singleFlight(map, 'k', fn, { retain: 'keep' })).resolves.toBe(1)

    map.delete('k')
    await expect(singleFlight(map, 'k', fn, { retain: 'keep' })).resolves.toBe(2)
  })

  it("retain 'keep' never memoizes rejections — next caller retries", async () => {
    const map = new Map<string, Promise<number>>()
    let calls = 0
    const fn = () => (++calls === 1 ? Promise.reject(new Error('boom')) : Promise.resolve(7))

    await expect(singleFlight(map, 'k', fn, { retain: 'keep' })).rejects.toThrow('boom')
    expect(map.has('k')).toBe(false)
    await expect(singleFlight(map, 'k', fn, { retain: 'keep' })).resolves.toBe(7)
  })

  it('does not evict an entry the call site already replaced', async () => {
    const map = new Map<string, Promise<number>>()
    const slow = deferred<number>()

    const first = singleFlight(map, 'k', () => slow.promise)
    // Call site invalidates and re-primes the key while `first` is in flight.
    map.delete('k')
    const second = singleFlight(map, 'k', () => Promise.resolve(2), { retain: 'keep' })

    slow.resolve(1)
    await first
    // The stale settle must not have deleted the replacement entry.
    expect(map.get('k')).toBe(second)
    await expect(second).resolves.toBe(2)
  })

  it('distinct keys run independently', async () => {
    const map = new Map<string, Promise<string>>()
    const a = singleFlight(map, 'a', () => Promise.resolve('a'))
    const b = singleFlight(map, 'b', () => Promise.resolve('b'))
    await expect(a).resolves.toBe('a')
    await expect(b).resolves.toBe('b')
  })
})
