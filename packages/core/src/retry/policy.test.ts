import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { capped, exponential, fixed, jittered, limitAttempts } from './policy'

const attempts = (count: number): number[] => Array.from({ length: count }, (_, i) => i + 1)

describe('retry policies', () => {
  it('fixed returns the same delay for every attempt', () => {
    const policy = fixed(2000)
    expect(attempts(4).map((a) => policy.delayFor(a))).toEqual([2000, 2000, 2000, 2000])
  })

  it('exponential doubles per attempt from the base delay', () => {
    const policy = exponential(1000)
    expect(attempts(4).map((a) => policy.delayFor(a))).toEqual([1000, 2000, 4000, 8000])
  })

  it('capped clamps the underlying delay', () => {
    const policy = capped(exponential(2000), 30000)
    expect(attempts(7).map((a) => policy.delayFor(a))).toEqual([
      2000, 4000, 8000, 16000, 30000, 30000, 30000
    ])
  })

  it('jittered adds up to ratio extra delay, deterministically via the injected rng', () => {
    expect(jittered(fixed(15000), 0.5, () => 0).delayFor(1)).toBe(15000)
    expect(jittered(fixed(15000), 0.5, () => 0.999).delayFor(1)).toBe(
      15000 + Math.floor(0.999 * 15000 * 0.5)
    )
  })

  it('limitAttempts gives up past maxAttempts and passes through before it', () => {
    const policy = limitAttempts(fixed(100), 2)
    expect(attempts(4).map((a) => policy.delayFor(a))).toEqual([100, 100, null, null])
  })

  it('capped and jittered pass null (give up) through', () => {
    const exhausted = limitAttempts(fixed(100), 0)
    expect(capped(exhausted, 1000).delayFor(1)).toBeNull()
    expect(jittered(exhausted, 0.5, () => 0.5).delayFor(1)).toBeNull()
  })

  // ── Golden sequences: the legacy hand-rolled formulas, byte-for-byte ──────

  it('golden: connection-manager ordinary reconnect (0204) — min(base * 2^(n-1), cap)', () => {
    const base = 2000
    const cap = 30000
    const policy = capped(exponential(base), cap)
    for (const attempt of attempts(12)) {
      expect(policy.delayFor(attempt)).toBe(Math.min(base * 2 ** (attempt - 1), cap))
    }
  })

  it('golden: connection-manager rate-limit backoff (0206) — base + floor(rng * base * 0.5)', () => {
    const base = 15000
    for (const rng of [0, 0.25, 0.5, 0.75, 0.999]) {
      const policy = jittered(fixed(base), 0.5, () => rng)
      expect(policy.delayFor(1)).toBe(base + Math.floor(rng * base * 0.5))
    }
  })

  it('golden: WebSocketSyncProvider reconnect — fixed delay, capped attempts', () => {
    const policy = limitAttempts(fixed(2000), 3)
    expect(attempts(5).map((a) => policy.delayFor(a))).toEqual([2000, 2000, 2000, null, null])
  })

  it('golden: webhook emitter retry — 1000 * 2^(attempt-1)', () => {
    const policy = exponential(1000)
    for (const attempt of attempts(5)) {
      expect(policy.delayFor(attempt)).toBe(1000 * Math.pow(2, attempt - 1))
    }
  })

  // ── Property tests (fast-check) ───────────────────────────────────────────

  it('property: exponential is non-decreasing in attempt', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 60000 }),
        fc.integer({ min: 1, max: 28 }),
        (base, attempt) => {
          const policy = exponential(base)
          return (policy.delayFor(attempt + 1) ?? 0) >= (policy.delayFor(attempt) ?? 0)
        }
      )
    )
  })

  it('property: capped never exceeds the cap and never increases the delay', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 60000 }),
        fc.integer({ min: 1, max: 120000 }),
        fc.integer({ min: 1, max: 28 }),
        (base, cap, attempt) => {
          const raw = exponential(base).delayFor(attempt)
          const clamped = capped(exponential(base), cap).delayFor(attempt)
          return clamped !== null && raw !== null && clamped <= cap && clamped <= raw
        }
      )
    )
  })

  it('property: jittered stays within [delay, delay * (1 + ratio))', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 120000 }),
        fc.double({ min: 0, max: 1, noNaN: true, maxExcluded: true }),
        (delay, rng) => {
          const ratio = 0.5
          const out = jittered(fixed(delay), ratio, () => rng).delayFor(1)
          return out !== null && out >= delay && out < delay * (1 + ratio)
        }
      )
    )
  })

  it('property: limitAttempts is null iff attempt exceeds maxAttempts', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 50 }),
        fc.integer({ min: 1, max: 60 }),
        (max, attempt) => {
          const out = limitAttempts(fixed(10), max).delayFor(attempt)
          return attempt > max ? out === null : out === 10
        }
      )
    )
  })
})
