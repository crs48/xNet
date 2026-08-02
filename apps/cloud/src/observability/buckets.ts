/**
 * xNet Cloud — durable, bucketed SLI storage (exploration 0433, decision 2/8).
 *
 * The rolling in-memory ring this replaces was wrong in two directions at once
 * (0431 Finding 1): it held 2000 samples at a 60s probe interval — **33 hours**
 * of a window labelled 30 days — and it died with the process, so every deploy
 * handed the error budget back at 100%. Because `rollout/engine.ts` gates fleet
 * upgrades on that budget, a restart silently unfroze deploys.
 *
 * Buckets fix both. One document per tenant per hour in the existing
 * {@link DocStore} port means the window survives restarts and is bounded by
 * construction: 720 buckets ≈ 43 KB per tenant per 30 days. Metrics deliberately
 * do NOT live on xNet — a per-tenant hourly time series is the high-frequency
 * stream exploration 0323 measured into a 318k-row cold-open stall.
 *
 * Everything here is content-free: counts and latencies, never anything about a
 * tenant's data.
 */

import type { DocStore } from '../stores/durable'
import { errorBudgetRemaining } from './sli'
import { budgetPolicy, type BudgetPolicy } from './slo'

export const HOUR_MS = 60 * 60 * 1000
export const DAY_MS = 24 * HOUR_MS

/** Floor a timestamp to the hour it belongs to. */
export const hourOf = (atMs: number): number => Math.floor(atMs / HOUR_MS) * HOUR_MS

/** Floor a timestamp to the UTC day it belongs to. */
export const dayOf = (atMs: number): number => Math.floor(atMs / DAY_MS) * DAY_MS

/** Document id for a bucket. Sorts by tenant then time, which `page()` relies on. */
export const bucketId = (tenantId: string, startMs: number): string =>
  `${tenantId}:${String(startMs).padStart(16, '0')}`

/**
 * One time-slice of probe results for one tenant.
 *
 * `coldStart` is counted separately from `failed` and treated as **valid-but-slow**:
 * the request eventually succeeded, so it is not unavailability. `sli.ts` always
 * documented this intent; the old probe contradicted it by aborting at 5s and
 * recording the abort as a failure.
 */
export interface SliBucket {
  tenantId: string
  /** Start of the slice (hour or day, per `span`). */
  startMs: number
  /** Slice width — hourly while raw, daily after rollup. */
  span: 'hour' | 'day'
  /** Probes that answered promptly. */
  ok: number
  /** Probes that answered, but only after the hub woke from cold. */
  coldStart: number
  /** Probes that did not answer. The only counter that burns error budget. */
  failed: number
  /** Sum of latencies over answering probes, for a mean. */
  latencySumMs: number
  maxLatencyMs: number
}

/** An empty bucket for a tenant/slice. */
const emptyBucket = (tenantId: string, startMs: number, span: 'hour' | 'day'): SliBucket => ({
  tenantId,
  startMs,
  span,
  ok: 0,
  coldStart: 0,
  failed: 0,
  latencySumMs: 0,
  maxLatencyMs: 0
})

/** How a single probe resolved. */
export type ProbeOutcome = 'ok' | 'cold-start' | 'failed'

/** Fold one probe result into a bucket (mutates and returns it). */
export function accumulate(bucket: SliBucket, outcome: ProbeOutcome, latencyMs: number): SliBucket {
  if (outcome === 'failed') {
    bucket.failed += 1
    return bucket
  }
  if (outcome === 'cold-start') bucket.coldStart += 1
  else bucket.ok += 1
  bucket.latencySumMs += latencyMs
  bucket.maxLatencyMs = Math.max(bucket.maxLatencyMs, latencyMs)
  return bucket
}

/** Probes in a bucket that count toward availability at all. */
export const validProbes = (b: SliBucket): number => b.ok + b.coldStart + b.failed

/** Probes in a bucket that count as available (cold starts DO count — they answered). */
export const okProbes = (b: SliBucket): number => b.ok + b.coldStart

/**
 * Durable per-tenant SLI buckets with an in-memory write-through for the current
 * hour, so the hot path stays a map write and the durable cost is one document
 * per tenant per hour.
 */
export class SliBucketStore {
  /** Open (still-accumulating) buckets, keyed by document id. */
  private readonly open = new Map<string, SliBucket>()

  constructor(private readonly docs: DocStore<SliBucket>) {}

  /** Record one probe result into the current hour's bucket. */
  record(tenantId: string, outcome: ProbeOutcome, latencyMs: number, nowMs: number): void {
    const startMs = hourOf(nowMs)
    const id = bucketId(tenantId, startMs)
    const bucket = this.open.get(id) ?? emptyBucket(tenantId, startMs, 'hour')
    this.open.set(id, accumulate(bucket, outcome, latencyMs))
  }

  /**
   * Persist buckets. Slices strictly older than the current hour are written and
   * dropped from memory; the current hour is written too (so a crash loses at most
   * the probes since the last flush) but stays open for further accumulation.
   *
   * Returns the number of documents written.
   */
  async flush(nowMs: number): Promise<number> {
    const currentHour = hourOf(nowMs)
    let written = 0
    for (const [id, bucket] of [...this.open]) {
      await this.docs.put(id, bucket)
      written += 1
      if (bucket.startMs < currentHour) this.open.delete(id)
    }
    return written
  }

  /**
   * Every bucket for a tenant, newest last. Merges the durable rows with any open
   * in-memory bucket so a read immediately after a probe is not missing the
   * current hour.
   */
  async buckets(tenantId: string): Promise<SliBucket[]> {
    const stored = await this.docs.findWhere('tenantId', tenantId)
    const byStart = new Map<number, SliBucket>()
    for (const b of stored) byStart.set(b.startMs, b)
    for (const b of this.open.values()) if (b.tenantId === tenantId) byStart.set(b.startMs, b)
    return [...byStart.values()].sort((a, b) => a.startMs - b.startMs)
  }
}

/**
 * Why a tenant's window can or cannot be read as availability.
 *
 * The distinction between `stale` and `young` is the whole point (decision 8).
 * Treating them alike gives you either a gate that freezes on every new signup —
 * which trains you to switch it off — or one that cannot tell a stopped probe
 * from a healthy fleet, which is the hazard this substrate exists to remove.
 */
export type WindowState =
  | { kind: 'measured'; tenantId: string; availability: number; probes: number }
  /** Newest bucket older than 2x the probe interval: measurement is BROKEN. */
  | { kind: 'stale'; tenantId: string; newestMs: number }
  /** Too few buckets because the tenant is new: benign, not evidence of harm. */
  | { kind: 'young'; tenantId: string; buckets: number }

export interface WindowOptions {
  nowMs: number
  windowMs: number
  probeIntervalMs: number
  /** Buckets required before a window is judged. Below this a tenant is `young`. */
  minBuckets?: number
}

/** Default: two hours of history before a tenant's window is used for the gate. */
export const DEFAULT_MIN_BUCKETS = 2

/** Classify a tenant's window. */
export function windowState(
  tenantId: string,
  buckets: SliBucket[],
  opts: WindowOptions
): WindowState {
  const minBuckets = opts.minBuckets ?? DEFAULT_MIN_BUCKETS
  const inWindow = buckets.filter((b) => b.startMs >= opts.nowMs - opts.windowMs)
  if (inWindow.length === 0) return { kind: 'young', tenantId, buckets: 0 }

  const newestMs = Math.max(...inWindow.map((b) => b.startMs))
  // Reuses the jobs registry's existing definition of stale (2x the interval), so
  // "this job stopped" and "this measurement stopped" mean the same thing. The
  // grace is measured from the END of the newest slice, not its start.
  const spanMs = inWindow.some((b) => b.span === 'day') ? DAY_MS : HOUR_MS
  if (opts.nowMs - (newestMs + spanMs) > 2 * opts.probeIntervalMs) {
    return { kind: 'stale', tenantId, newestMs }
  }
  if (inWindow.length < minBuckets) return { kind: 'young', tenantId, buckets: inWindow.length }

  let ok = 0
  let valid = 0
  for (const b of inWindow) {
    ok += okProbes(b)
    valid += validProbes(b)
  }
  if (valid === 0) return { kind: 'young', tenantId, buckets: inWindow.length }
  return { kind: 'measured', tenantId, availability: ok / valid, probes: valid }
}

/**
 * The fleet deploy gate.
 *
 * `stale` freezes: a fleet nobody is measuring is not a healthy fleet, and a
 * silently-stopped probe is exactly the failure that used to look like perfect
 * health. `young` is EXCLUDED rather than frozen, so a new signup never blocks a
 * rollout. No states at all — probing itself has stopped — freezes.
 */
export function fleetGate(states: WindowState[], objective: number | null): BudgetPolicy {
  if (states.length === 0) return 'freeze'
  if (states.some((s) => s.kind === 'stale')) return 'freeze'
  const measured = states.filter(
    (s): s is Extract<WindowState, { kind: 'measured' }> => s.kind === 'measured'
  )
  // Every tenant young: nothing has been measured yet, so there is no evidence of
  // health to deploy against. Absent is not healthy.
  if (measured.length === 0) return 'freeze'
  const worst = Math.min(...measured.map((m) => errorBudgetRemaining(m.availability, objective)))
  return budgetPolicy(worst)
}

/**
 * Roll hourly buckets older than `rawRetentionMs` into daily ones.
 *
 * Keeps 30 days of hourly resolution for the SLO window and a year-plus of daily
 * resolution for quarterly SLA evidence (decision 15), while bounding growth:
 * without this, hourly rows accumulate forever.
 *
 * Returns the ids written and deleted so a caller can log the compaction.
 */
export async function rollUpToDaily(
  docs: DocStore<SliBucket>,
  tenantId: string,
  opts: { nowMs: number; rawRetentionMs: number }
): Promise<{ written: string[]; deleted: string[] }> {
  const cutoff = opts.nowMs - opts.rawRetentionMs
  const all = await docs.findWhere('tenantId', tenantId)
  const stale = all.filter((b) => b.span === 'hour' && b.startMs < cutoff)
  if (stale.length === 0) return { written: [], deleted: [] }

  const byDay = new Map<number, SliBucket>()
  for (const b of stale) {
    const day = dayOf(b.startMs)
    const acc = byDay.get(day) ?? emptyBucket(tenantId, day, 'day')
    acc.ok += b.ok
    acc.coldStart += b.coldStart
    acc.failed += b.failed
    acc.latencySumMs += b.latencySumMs
    acc.maxLatencyMs = Math.max(acc.maxLatencyMs, b.maxLatencyMs)
    byDay.set(day, acc)
  }

  const written: string[] = []
  for (const [day, acc] of byDay) {
    const id = bucketId(tenantId, day)
    // Merge into an existing daily bucket rather than overwrite — a rollup that
    // runs twice must not discard the first run's counts.
    const existing = await docs.get(id)
    if (existing && existing.span === 'day') {
      acc.ok += existing.ok
      acc.coldStart += existing.coldStart
      acc.failed += existing.failed
      acc.latencySumMs += existing.latencySumMs
      acc.maxLatencyMs = Math.max(acc.maxLatencyMs, existing.maxLatencyMs)
    }
    await docs.put(id, acc)
    written.push(id)
  }

  const deleted: string[] = []
  for (const b of stale) {
    const id = bucketId(tenantId, b.startMs)
    // A daily bucket shares the day's midnight id only if an hourly bucket started
    // exactly at midnight — never delete the row we just wrote.
    if (written.includes(id)) continue
    await docs.delete(id)
    deleted.push(id)
  }
  return { written, deleted }
}

/** Drop daily buckets past the long-term retention horizon (default 13 months). */
export async function pruneDaily(
  docs: DocStore<SliBucket>,
  tenantId: string,
  opts: { nowMs: number; retentionMs: number }
): Promise<string[]> {
  const cutoff = opts.nowMs - opts.retentionMs
  const all = await docs.findWhere('tenantId', tenantId)
  const dropped: string[] = []
  for (const b of all) {
    if (b.span !== 'day' || b.startMs >= cutoff) continue
    const id = bucketId(tenantId, b.startMs)
    await docs.delete(id)
    dropped.push(id)
  }
  return dropped
}
