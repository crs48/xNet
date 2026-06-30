/**
 * Tests for the single-worker priority scheduler (exploration 0228).
 *
 * These double as the "benchmark harness" the exploration calls for: they
 * deterministically prove an interactive read is never starved behind queued
 * writes, and that identical concurrent reads collapse to one execution.
 */
import { describe, it, expect, vi } from 'vitest'
import { WorkerScheduler, firstOpGapFields, type SchedulerOpReport } from './worker-scheduler'

/** A promise plus its resolver, so a test can release a job on demand. */
function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void } {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

describe('WorkerScheduler (0228)', () => {
  it('serves a queued interactive read ahead of queued writes', async () => {
    const sched = new WorkerScheduler()
    const order: string[] = []
    // The first job (empty queue) starts immediately. Everything queued behind
    // it is then drained highest-priority-first, so the interactive read beats
    // the remaining writes — the realistic case (Comlink calls arrive in
    // separate ticks, never one synchronous batch).
    const w1 = sched.schedule('write', async () => void order.push('w1'))
    const w2 = sched.schedule('write', async () => void order.push('w2'))
    const r = sched.schedule('interactive', async () => void order.push('r'))
    await Promise.all([w1, w2, r])
    expect(order).toEqual(['w1', 'r', 'w2'])
  })

  it('does not preempt an in-flight job, but the next pick is by priority', async () => {
    const sched = new WorkerScheduler()
    const order: string[] = []
    const gate = deferred<void>()

    // w1 starts immediately and blocks on the gate.
    const w1 = sched.schedule('write', async () => {
      order.push('w1-start')
      await gate.promise
      order.push('w1-end')
    })
    // Enqueued while w1 is in flight.
    const w2 = sched.schedule('write', async () => void order.push('w2'))
    const r = sched.schedule('interactive', async () => void order.push('r'))

    // Let w1 begin before releasing it.
    await Promise.resolve()
    gate.resolve()
    await Promise.all([w1, w2, r])
    // w1 ran to completion (no preemption); then interactive beat the queued write.
    expect(order).toEqual(['w1-start', 'w1-end', 'r', 'w2'])
  })

  it('coalesces identical concurrent reads into one execution', async () => {
    const sched = new WorkerScheduler()
    const fn = vi.fn(async () => 42)
    const [a, b, c] = await Promise.all([
      sched.schedule('interactive', fn, 'k'),
      sched.schedule('interactive', fn, 'k'),
      sched.schedule('interactive', fn, 'k')
    ])
    expect(fn).toHaveBeenCalledTimes(1)
    expect([a, b, c]).toEqual([42, 42, 42])
  })

  it('does not coalesce different keys', async () => {
    const sched = new WorkerScheduler()
    const fn = vi.fn(async () => 1)
    await Promise.all([
      sched.schedule('interactive', fn, 'k1'),
      sched.schedule('interactive', fn, 'k2')
    ])
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('re-runs an identical read after the previous one settles (fresh data)', async () => {
    const sched = new WorkerScheduler()
    const fn = vi.fn(async () => 'v')
    await sched.schedule('interactive', fn, 'k')
    await sched.schedule('interactive', fn, 'k')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('propagates rejection to the caller and keeps draining', async () => {
    const sched = new WorkerScheduler()
    const boom = sched.schedule('write', async () => {
      throw new Error('boom')
    })
    const ok = sched.schedule('write', async () => 'ok')
    await expect(boom).rejects.toThrow('boom')
    await expect(ok).resolves.toBe('ok')
  })

  it('reports per-op timing to the onOp reporter with lane + label (0229)', async () => {
    const reports: Array<{ lane: string; label?: string; queueMs: number; execMs: number }> = []
    const sched = new WorkerScheduler((r) => reports.push(r))
    await sched.schedule('interactive', async () => 1, undefined, 'query')
    await sched.schedule('write', async () => 2, undefined, 'run')
    expect(reports).toHaveLength(2)
    expect(reports[0]).toMatchObject({ lane: 'interactive', label: 'query' })
    expect(reports[1]).toMatchObject({ lane: 'write', label: 'run' })
    for (const r of reports) {
      expect(r.queueMs).toBeGreaterThanOrEqual(0)
      expect(r.execMs).toBeGreaterThanOrEqual(0)
    }
  })

  it('forwards the op detail (SQL text) to the reporter (0249)', async () => {
    const reports: Array<{ detail?: string }> = []
    const sched = new WorkerScheduler((r) => reports.push(r))
    await sched.schedule(
      'interactive',
      async () => 1,
      undefined,
      'query',
      'SELECT n.id FROM nodes n'
    )
    expect(reports).toHaveLength(1)
    expect(reports[0].detail).toBe('SELECT n.id FROM nodes n')
  })

  it('does not report coalesced duplicate reads twice (0229)', async () => {
    const reports: unknown[] = []
    const sched = new WorkerScheduler((r) => reports.push(r))
    const fn = vi.fn(async () => 'v')
    await Promise.all([
      sched.schedule('interactive', fn, 'k', 'query'),
      sched.schedule('interactive', fn, 'k', 'query')
    ])
    expect(fn).toHaveBeenCalledTimes(1)
    expect(reports).toHaveLength(1)
  })

  it('reports queue depth via snapshot', async () => {
    const sched = new WorkerScheduler()
    const gate = deferred<void>()
    const running = sched.schedule('write', async () => {
      await gate.promise
    })
    sched.schedule('interactive', async () => undefined)
    sched.schedule('write', async () => undefined)
    await Promise.resolve()
    const snap = sched.snapshot()
    expect(snap.inFlight).toBe(true)
    expect(snap.interactive).toBe(1)
    expect(snap.write).toBe(1)
    gate.resolve()
    await running
  })

  it('stamps each op report with enqueuedAt + startedAt on one clock (0253)', async () => {
    const reports: SchedulerOpReport[] = []
    const sched = new WorkerScheduler((r) => reports.push(r))
    await sched.schedule('interactive', async () => 1, undefined, 'query')
    expect(reports).toHaveLength(1)
    const r = reports[0]
    expect(typeof r.enqueuedAt).toBe('number')
    expect(typeof r.startedAt).toBe('number')
    // started no earlier than enqueued; queueMs is exactly their difference.
    expect(r.startedAt).toBeGreaterThanOrEqual(r.enqueuedAt)
    expect(Math.round(r.queueMs)).toBe(Math.round(r.startedAt - r.enqueuedAt))
  })
})

describe('firstOpGapFields (0253)', () => {
  it('measures idle (open→enqueue) and sinceOpen (open→exec) against open time', () => {
    // open() finished at t=100; the first op was enqueued at 117_000 and ran at 117_005.
    const fields = firstOpGapFields({ enqueuedAt: 117_000, startedAt: 117_005 }, 100)
    expect(fields).toEqual({
      firstOpAfterOpen: true,
      idleBeforeFirstOpMs: 116_900, // 17s the worker sat idle after open → wait is upstream
      sinceOpenMs: 116_905
    })
  })

  it('reports ≈0 when the first op was already enqueued the instant open finished', () => {
    // idle≈0 ⇒ the op was waiting to be scheduled the moment open finished, so
    // the ~17s wait WAS the open itself (read `[xNet] sqlite open phases`).
    const fields = firstOpGapFields({ enqueuedAt: 1000.4, startedAt: 1000.6 }, 1000)
    expect(fields.idleBeforeFirstOpMs).toBe(0)
    expect(fields.sinceOpenMs).toBe(1)
    expect(fields.firstOpAfterOpen).toBe(true)
  })
})
