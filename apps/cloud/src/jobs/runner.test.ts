import { describe, expect, it, vi } from 'vitest'
import { InMemoryDocStore } from '../stores/durable'
import { type JobRecord } from './leased'
import { JobRegistry, anyStale } from './runner'

const HOUR = 60 * 60_000

function registry(nowRef: { t: number }, store = new InMemoryDocStore<JobRecord>()) {
  const errors: { jobId: string; error: unknown }[] = []
  const reg = new JobRegistry({
    store,
    holder: 'instance-a',
    nowMs: () => nowRef.t,
    onError: (jobId, error) => errors.push({ jobId, error })
  })
  return { reg, store, errors }
}

describe('JobRegistry', () => {
  it('runs a registered job on tick and records completion', async () => {
    const now = { t: 1_000 }
    const { reg, store } = registry(now)
    const work = vi.fn().mockResolvedValue(undefined)
    reg.add({ jobId: 'drill', intervalMs: 24 * HOUR, work })

    await reg.tick('drill')
    expect(work).toHaveBeenCalledTimes(1)
    expect(await store.get('drill')).toMatchObject({ lastOutcome: 'ok', lastCompletedMs: 1_000 })
  })

  it('does not re-run a job before it is due', async () => {
    const now = { t: 1_000 }
    const { reg } = registry(now)
    const work = vi.fn().mockResolvedValue(undefined)
    reg.add({ jobId: 'drill', intervalMs: 24 * HOUR, work })

    await reg.tick('drill')
    now.t += HOUR
    await reg.tick('drill')
    expect(work).toHaveBeenCalledTimes(1)

    now.t += 24 * HOUR
    await reg.tick('drill')
    expect(work).toHaveBeenCalledTimes(2)
  })

  it('G2: a fresh process catches up a drill the deploy would have skipped', async () => {
    const store = new InMemoryDocStore<JobRecord>()
    // A previous process completed the drill 25h ago, then was replaced.
    await store.put('drill', {
      jobId: 'drill',
      lastCompletedMs: 0,
      lastOutcome: 'ok',
      leaseUntilMs: 0,
      holder: 'old-revision'
    })

    const now = { t: 25 * HOUR }
    const { reg } = registry(now, store)
    const work = vi.fn().mockResolvedValue(undefined)
    reg.add({ jobId: 'drill', intervalMs: 24 * HOUR, tickMs: HOUR, work })

    // start() fires an immediate catch-up pass — the actual fix.
    const stop = reg.start()
    await vi.waitFor(() => expect(work).toHaveBeenCalledTimes(1))
    stop()
  })

  it('reports a job failure without killing the loop, and keeps it due', async () => {
    const now = { t: 1_000 }
    const { reg, store, errors } = registry(now)
    const work = vi.fn().mockRejectedValue(new Error('restore failed'))
    reg.add({ jobId: 'drill', intervalMs: 24 * HOUR, work })

    await expect(reg.tick('drill')).resolves.toBeUndefined() // does NOT throw
    expect(errors).toHaveLength(1)
    expect(errors[0]?.jobId).toBe('drill')
    expect(await store.get('drill')).toMatchObject({ lastOutcome: 'failed' })

    // Still due, because the failure did not advance the schedule.
    now.t += 60_000
    await reg.tick('drill')
    expect(work).toHaveBeenCalledTimes(2)
  })

  it('throws for an unregistered job id', async () => {
    const { reg } = registry({ t: 0 })
    await expect(reg.tick('nope')).rejects.toThrow(/No such job/)
  })

  it('health() reports a never-run job as stale', async () => {
    const now = { t: 5_000 }
    const { reg } = registry(now)
    reg.add({ jobId: 'drill', intervalMs: 24 * HOUR, work: async () => undefined })

    const health = await reg.health()
    expect(health).toEqual([
      { jobId: 'drill', lastOutcome: 'never', stalenessMs: null, stale: true }
    ])
    expect(anyStale(health)).toBe(true)
  })

  it('health() goes quiet after a successful run and loud again when overdue', async () => {
    const now = { t: 1_000 }
    const { reg } = registry(now)
    reg.add({ jobId: 'drill', intervalMs: 24 * HOUR, work: async () => undefined })

    await reg.tick('drill')
    expect(anyStale(await reg.health())).toBe(false)

    // Simulate the job silently not running for two days.
    now.t += 49 * HOUR
    const health = await reg.health()
    expect(health[0]?.stale).toBe(true)
    expect(health[0]?.lastOutcome).toBe('ok') // last run PASSED — absence is the signal
  })

  it('tickAll runs every registered job', async () => {
    const now = { t: 1_000 }
    const { reg } = registry(now)
    const a = vi.fn().mockResolvedValue(undefined)
    const b = vi.fn().mockResolvedValue(undefined)
    reg.add({ jobId: 'a', intervalMs: HOUR, work: a })
    reg.add({ jobId: 'b', intervalMs: HOUR, work: b })

    await reg.tickAll()
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(1)
  })

  it('a second holder skips a job the first is running', async () => {
    const now = { t: 1_000 }
    const store = new InMemoryDocStore<JobRecord>()
    const { reg: regA } = registry(now, store)
    const regB = new JobRegistry({ store, holder: 'instance-b', nowMs: () => now.t })

    const slow = vi.fn().mockImplementation(() => new Promise((r) => setTimeout(r, 5)))
    regA.add({ jobId: 'drill', intervalMs: HOUR, work: slow })
    regB.add({ jobId: 'drill', intervalMs: HOUR, leaseMs: HOUR, work: slow })

    const inflight = regA.tick('drill')
    await Promise.resolve()
    await regB.tick('drill')
    await inflight

    expect(slow).toHaveBeenCalledTimes(1)
  })
})
