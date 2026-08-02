import { describe, expect, it } from 'vitest'
import { InMemoryDocStore } from '../stores/durable'
import {
  DAY_MS,
  HOUR_MS,
  SliBucketStore,
  bucketId,
  fleetGate,
  hourOf,
  pruneDaily,
  rollUpToDaily,
  windowState,
  type SliBucket,
  type WindowState
} from './buckets'

const PROBE_MS = 60_000
const WINDOW_MS = 30 * DAY_MS
const T0 = Date.UTC(2026, 6, 1, 0, 0, 0)

const opts = (nowMs: number, minBuckets = 2) => ({
  nowMs,
  windowMs: WINDOW_MS,
  probeIntervalMs: PROBE_MS,
  minBuckets
})

/** N hourly buckets ending at `endMs`, each with `ok` successes and `failed` failures. */
function hours(
  tenantId: string,
  endMs: number,
  count: number,
  per: { ok?: number; failed?: number; coldStart?: number } = {}
): SliBucket[] {
  return Array.from({ length: count }, (_, i) => ({
    tenantId,
    startMs: hourOf(endMs) - (count - 1 - i) * HOUR_MS,
    span: 'hour' as const,
    ok: per.ok ?? 60,
    coldStart: per.coldStart ?? 0,
    failed: per.failed ?? 0,
    latencySumMs: 1000,
    maxLatencyMs: 50
  }))
}

describe('SliBucketStore', () => {
  it('accumulates into the current hour and survives a reload from the doc store', async () => {
    const docs = new InMemoryDocStore<SliBucket>()
    const store = new SliBucketStore(docs)
    store.record('t_a', 'ok', 20, T0)
    store.record('t_a', 'ok', 30, T0 + 60_000)
    store.record('t_a', 'failed', 0, T0 + 120_000)
    await store.flush(T0 + 120_000)

    // A NEW store over the same docs — the restart that used to zero the window.
    const reloaded = await new SliBucketStore(docs).buckets('t_a')
    expect(reloaded).toHaveLength(1)
    expect(reloaded[0]).toMatchObject({ ok: 2, failed: 1, coldStart: 0, maxLatencyMs: 30 })
  })

  it('closes a bucket once its hour has passed but keeps the current one open', async () => {
    const docs = new InMemoryDocStore<SliBucket>()
    const store = new SliBucketStore(docs)
    store.record('t_a', 'ok', 10, T0)
    await store.flush(T0 + HOUR_MS) // T0's hour is now past
    store.record('t_a', 'ok', 10, T0 + HOUR_MS)
    await store.flush(T0 + HOUR_MS)
    const all = await store.buckets('t_a')
    expect(all.map((b) => b.startMs)).toEqual([T0, T0 + HOUR_MS])
  })

  it('counts a cold start as available, separately from a failure', async () => {
    const docs = new InMemoryDocStore<SliBucket>()
    const store = new SliBucketStore(docs)
    store.record('t_a', 'cold-start', 8000, T0)
    store.record('t_a', 'ok', 20, T0)
    await store.flush(T0)
    const [b] = await store.buckets('t_a')
    expect(b).toMatchObject({ ok: 1, coldStart: 1, failed: 0 })
    const state = windowState('t_a', [b], opts(T0 + 60_000, 1))
    expect(state).toMatchObject({ kind: 'measured', availability: 1 })
  })

  it('keeps tenants separate', async () => {
    const docs = new InMemoryDocStore<SliBucket>()
    const store = new SliBucketStore(docs)
    store.record('t_a', 'ok', 10, T0)
    store.record('t_b', 'failed', 0, T0)
    await store.flush(T0)
    expect(await store.buckets('t_a')).toHaveLength(1)
    expect((await store.buckets('t_b'))[0].failed).toBe(1)
  })
})

describe('windowState', () => {
  const now = T0 + 10 * HOUR_MS

  it('is measured when there is recent, sufficient history', () => {
    const s = windowState('t_a', hours('t_a', now, 5), opts(now))
    expect(s).toMatchObject({ kind: 'measured', availability: 1, probes: 300 })
  })

  it('is young when the tenant has too little history — NOT stale, NOT healthy', () => {
    const s = windowState('t_a', hours('t_a', now, 1), opts(now))
    expect(s).toMatchObject({ kind: 'young', buckets: 1 })
  })

  it('is young with no buckets at all', () => {
    expect(windowState('t_a', [], opts(now))).toMatchObject({ kind: 'young', buckets: 0 })
  })

  it('is stale when the newest bucket is older than 2x the probe interval', () => {
    // Newest slice ended 3 hours ago; the grace is 2 minutes.
    const s = windowState('t_a', hours('t_a', now - 3 * HOUR_MS, 5), opts(now))
    expect(s.kind).toBe('stale')
  })

  it('is not stale merely because the current hour is still open', () => {
    // Newest bucket started this hour, so it ends in the future — well inside grace.
    const s = windowState('t_a', hours('t_a', now, 5), opts(now))
    expect(s.kind).toBe('measured')
  })

  it('computes availability from failures only', () => {
    const s = windowState('t_a', hours('t_a', now, 4, { ok: 99, failed: 1 }), opts(now))
    expect(s).toMatchObject({ kind: 'measured' })
    if (s.kind === 'measured') expect(s.availability).toBeCloseTo(0.99, 5)
  })

  it('ignores buckets older than the window', () => {
    const old = hours('t_a', now - 40 * DAY_MS, 3)
    const recent = hours('t_a', now, 3)
    const s = windowState('t_a', [...old, ...recent], opts(now))
    expect(s).toMatchObject({ kind: 'measured', probes: 180 })
  })
})

describe('fleetGate', () => {
  const measured = (availability: number): WindowState => ({
    kind: 'measured',
    tenantId: 't',
    availability,
    probes: 1000
  })

  it('freezes when nothing is measured at all — probing itself has stopped', () => {
    expect(fleetGate([], 0.999)).toBe('freeze')
  })

  it('freezes on a stale tenant, however healthy the rest look', () => {
    const states: WindowState[] = [measured(1), { kind: 'stale', tenantId: 't_b', newestMs: T0 }]
    expect(fleetGate(states, 0.999)).toBe('freeze')
  })

  it('freezes when every tenant is young — absent is not healthy', () => {
    expect(fleetGate([{ kind: 'young', tenantId: 't', buckets: 1 }], 0.999)).toBe('freeze')
  })

  it('EXCLUDES young tenants rather than freezing when others are measured', () => {
    const states: WindowState[] = [measured(1), { kind: 'young', tenantId: 't_new', buckets: 0 }]
    expect(fleetGate(states, 0.999)).toBe('ship')
  })

  it('ships on a healthy budget and freezes on an exhausted one', () => {
    expect(fleetGate([measured(1)], 0.999)).toBe('ship')
    expect(fleetGate([measured(0.999)], 0.999)).toBe('freeze')
  })

  it('takes the worst tenant, not the average', () => {
    expect(fleetGate([measured(1), measured(0.999)], 0.999)).toBe('freeze')
  })

  it('never freezes a plan with no published objective', () => {
    expect(fleetGate([measured(0.5)], null)).toBe('ship')
  })
})

describe('rollUpToDaily', () => {
  const now = T0 + 40 * DAY_MS

  it('folds hourly buckets older than the retention into one daily bucket', async () => {
    const docs = new InMemoryDocStore<SliBucket>()
    const day = T0 + 1 * DAY_MS
    for (let h = 0; h < 4; h++) {
      const b: SliBucket = {
        tenantId: 't_a',
        startMs: day + h * HOUR_MS,
        span: 'hour',
        ok: 50,
        coldStart: 1,
        failed: 2,
        latencySumMs: 500,
        maxLatencyMs: 40 + h
      }
      await docs.put(bucketId('t_a', b.startMs), b)
    }
    await rollUpToDaily(docs, 't_a', { nowMs: now, rawRetentionMs: 30 * DAY_MS })

    const remaining = await docs.findWhere('tenantId', 't_a')
    expect(remaining).toHaveLength(1)
    expect(remaining[0]).toMatchObject({
      span: 'day',
      startMs: day,
      ok: 200,
      coldStart: 4,
      failed: 8,
      maxLatencyMs: 43
    })
  })

  it('leaves buckets inside the raw retention window alone', async () => {
    const docs = new InMemoryDocStore<SliBucket>()
    const recent = hourOf(now) - 2 * HOUR_MS
    await docs.put(bucketId('t_a', recent), {
      tenantId: 't_a',
      startMs: recent,
      span: 'hour',
      ok: 60,
      coldStart: 0,
      failed: 0,
      latencySumMs: 100,
      maxLatencyMs: 10
    })
    const res = await rollUpToDaily(docs, 't_a', { nowMs: now, rawRetentionMs: 30 * DAY_MS })
    expect(res).toEqual({ written: [], deleted: [] })
    expect(await docs.findWhere('tenantId', 't_a')).toHaveLength(1)
  })

  it('is idempotent — a second run does not double-count or lose the first', async () => {
    const docs = new InMemoryDocStore<SliBucket>()
    const day = T0 + 1 * DAY_MS
    await docs.put(bucketId('t_a', day + HOUR_MS), {
      tenantId: 't_a',
      startMs: day + HOUR_MS,
      span: 'hour',
      ok: 10,
      coldStart: 0,
      failed: 0,
      latencySumMs: 10,
      maxLatencyMs: 5
    })
    const args = { nowMs: now, rawRetentionMs: 30 * DAY_MS }
    await rollUpToDaily(docs, 't_a', args)
    await rollUpToDaily(docs, 't_a', args)
    const remaining = await docs.findWhere('tenantId', 't_a')
    expect(remaining).toHaveLength(1)
    expect(remaining[0].ok).toBe(10)
  })
})

describe('pruneDaily', () => {
  it('drops daily buckets past the long-term horizon and keeps the rest', async () => {
    const docs = new InMemoryDocStore<SliBucket>()
    const now = T0 + 500 * DAY_MS
    const mk = (startMs: number): SliBucket => ({
      tenantId: 't_a',
      startMs,
      span: 'day',
      ok: 1,
      coldStart: 0,
      failed: 0,
      latencySumMs: 1,
      maxLatencyMs: 1
    })
    const old = now - 400 * DAY_MS
    const keep = now - 100 * DAY_MS
    await docs.put(bucketId('t_a', old), mk(old))
    await docs.put(bucketId('t_a', keep), mk(keep))

    const dropped = await pruneDaily(docs, 't_a', { nowMs: now, retentionMs: 395 * DAY_MS })
    expect(dropped).toHaveLength(1)
    const remaining = await docs.findWhere('tenantId', 't_a')
    expect(remaining.map((b) => b.startMs)).toEqual([keep])
  })
})
