/**
 * G2 regression suite (exploration 0411): background work must survive a deploy
 * and must be loud when it silently stops running.
 */

import { describe, expect, it, vi } from 'vitest'
import { InMemoryDocStore } from '../stores/durable'
import {
  claimable,
  isStale,
  jobHealth,
  runIfDue,
  stalenessMs,
  type JobRecord,
  type LeasedJobOptions
} from './leased'

const HOUR = 60 * 60_000

const opts = (over: Partial<LeasedJobOptions> = {}): LeasedJobOptions => ({
  jobId: 'restore-drill',
  intervalMs: 24 * HOUR,
  leaseMs: HOUR,
  holder: 'instance-a',
  ...over
})

const rec = (over: Partial<JobRecord> = {}): JobRecord => ({
  jobId: 'restore-drill',
  lastCompletedMs: null,
  lastOutcome: 'never',
  leaseUntilMs: 0,
  holder: 'instance-a',
  ...over
})

describe('claimable', () => {
  it('claims a job that has never run', () => {
    expect(claimable(null, opts(), 0)).toBe(true)
  })

  it('refuses a job completed more recently than its interval', () => {
    const r = rec({ lastCompletedMs: 100 * HOUR, lastOutcome: 'ok' })
    expect(claimable(r, opts(), 100 * HOUR + HOUR)).toBe(false)
  })

  it('claims once the interval has elapsed', () => {
    const r = rec({ lastCompletedMs: 100 * HOUR, lastOutcome: 'ok' })
    expect(claimable(r, opts(), 100 * HOUR + 24 * HOUR)).toBe(true)
  })

  it('refuses while another holder has a live lease', () => {
    const r = rec({ holder: 'instance-b', leaseUntilMs: 500, lastCompletedMs: null })
    expect(claimable(r, opts({ holder: 'instance-a' }), 100)).toBe(false)
  })

  it('lets the SAME holder re-enter its own lease after a crash', () => {
    const r = rec({ holder: 'instance-a', leaseUntilMs: 500, lastCompletedMs: null })
    expect(claimable(r, opts({ holder: 'instance-a' }), 100)).toBe(true)
  })

  it('claims once another holder lease has expired', () => {
    const r = rec({ holder: 'instance-b', leaseUntilMs: 500, lastCompletedMs: null })
    expect(claimable(r, opts({ holder: 'instance-a' }), 600)).toBe(true)
  })
})

describe('stalenessMs / isStale', () => {
  it('treats a never-run job as maximally stale', () => {
    expect(stalenessMs(null, 1_000)).toBe(Number.POSITIVE_INFINITY)
    expect(stalenessMs(rec(), 1_000)).toBe(Number.POSITIVE_INFINITY)
    expect(isStale(null, opts(), 1_000)).toBe(true)
  })

  it('measures age from the last SUCCESS, not the last attempt', () => {
    const r = rec({ lastCompletedMs: 10 * HOUR, lastOutcome: 'failed' })
    expect(stalenessMs(r, 12 * HOUR)).toBe(2 * HOUR)
  })

  it('is not stale within 2x the interval, and is beyond it', () => {
    const r = rec({ lastCompletedMs: 0, lastOutcome: 'ok' })
    expect(isStale(r, opts(), 47 * HOUR)).toBe(false)
    expect(isStale(r, opts(), 49 * HOUR)).toBe(true)
  })
})

describe('runIfDue', () => {
  it('runs a never-run job and records success', async () => {
    const store = new InMemoryDocStore<JobRecord>()
    const work = vi.fn().mockResolvedValue(undefined)

    expect(await runIfDue(store, opts({ nowMs: () => 5_000 }), work)).toBe('ran')
    expect(work).toHaveBeenCalledTimes(1)

    const saved = await store.get('restore-drill')
    expect(saved).toMatchObject({ lastOutcome: 'ok', lastCompletedMs: 5_000, leaseUntilMs: 0 })
  })

  it('skips a job that is not yet due', async () => {
    const store = new InMemoryDocStore<JobRecord>()
    await store.put('restore-drill', rec({ lastCompletedMs: 100 * HOUR, lastOutcome: 'ok' }))
    const work = vi.fn()

    const outcome = await runIfDue(store, opts({ nowMs: () => 100 * HOUR + HOUR }), work)
    expect(outcome).toBe('not-due')
    expect(work).not.toHaveBeenCalled()
  })

  it('SURVIVES A DEPLOY: an overdue job runs on the next tick of a fresh process', async () => {
    // The G2 bug: with setInterval, a process that started at 02:59 would wait a
    // full interval from boot and skip the 03:00 run entirely.
    const store = new InMemoryDocStore<JobRecord>()
    await store.put('restore-drill', rec({ lastCompletedMs: 0, lastOutcome: 'ok' }))
    const work = vi.fn().mockResolvedValue(undefined)

    // Fresh process, first tick, 25h since the last success.
    const outcome = await runIfDue(store, opts({ nowMs: () => 25 * HOUR }), work)
    expect(outcome).toBe('ran')
    expect(work).toHaveBeenCalledTimes(1)
  })

  it('a second replica skips while the first holds the lease', async () => {
    const store = new InMemoryDocStore<JobRecord>()
    const slow = vi.fn().mockImplementation(() => new Promise((r) => setTimeout(r, 5)))

    const first = runIfDue(store, opts({ holder: 'a', nowMs: () => 1_000 }), slow)
    // While `first` is mid-flight the lease is written, so B must skip.
    await Promise.resolve()
    const second = await runIfDue(store, opts({ holder: 'b', nowMs: () => 1_001 }), slow)

    expect(second).toBe('leased-elsewhere')
    expect(await first).toBe('ran')
    expect(slow).toHaveBeenCalledTimes(1)
  })

  it('a failed run does NOT advance the schedule and rethrows', async () => {
    const store = new InMemoryDocStore<JobRecord>()
    await store.put('restore-drill', rec({ lastCompletedMs: 1_000, lastOutcome: 'ok' }))
    const boom = vi.fn().mockRejectedValue(new Error('restore failed'))

    await expect(runIfDue(store, opts({ nowMs: () => 1_000 + 25 * HOUR }), boom)).rejects.toThrow(
      'restore failed'
    )

    const saved = await store.get('restore-drill')
    // Completion time unchanged → still due → retried next tick. A permanently
    // broken drill must not look like it ran every night.
    expect(saved).toMatchObject({ lastCompletedMs: 1_000, lastOutcome: 'failed', leaseUntilMs: 0 })
  })

  it('releases the lease after a failure so the next tick can retry', async () => {
    const store = new InMemoryDocStore<JobRecord>()
    const boom = vi.fn().mockRejectedValue(new Error('nope'))
    await runIfDue(store, opts({ nowMs: () => 1_000 }), boom).catch(() => undefined)

    const ok = vi.fn().mockResolvedValue(undefined)
    expect(await runIfDue(store, opts({ nowMs: () => 2_000 }), ok)).toBe('ran')
  })
})

describe('jobHealth — G2 loudness', () => {
  it('reports a never-run job as stale with null age', () => {
    expect(jobHealth(null, { jobId: 'restore-drill', intervalMs: 24 * HOUR }, 5_000)).toEqual({
      jobId: 'restore-drill',
      lastOutcome: 'never',
      stalenessMs: null,
      stale: true
    })
  })

  it('ALERTS when a job has not completed in 2x its interval — no failure needed', async () => {
    // The whole point of G2: success is silence, so absence must be the signal.
    const store = new InMemoryDocStore<JobRecord>()
    await store.put('restore-drill', rec({ lastCompletedMs: 0, lastOutcome: 'ok' }))

    const health = jobHealth(
      await store.get('restore-drill'),
      { jobId: 'restore-drill', intervalMs: 24 * HOUR },
      49 * HOUR
    )
    expect(health.stale).toBe(true)
    expect(health.lastOutcome).toBe('ok') // last run PASSED — staleness is the only signal
    expect(health.stalenessMs).toBe(49 * HOUR)
  })

  it('is quiet for a healthy job', async () => {
    const store = new InMemoryDocStore<JobRecord>()
    await store.put('restore-drill', rec({ lastCompletedMs: 40 * HOUR, lastOutcome: 'ok' }))

    const health = jobHealth(
      await store.get('restore-drill'),
      { jobId: 'restore-drill', intervalMs: 24 * HOUR },
      41 * HOUR
    )
    expect(health.stale).toBe(false)
  })
})
