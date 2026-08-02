/**
 * NEGATIVE CONTROL for the SLI deploy gate (exploration 0430's rule, 0433 Phase 0).
 *
 * A gate that cannot be shown to go red is unfalsifiable: a `fleetGate` that
 * quietly started returning `ship` for everything would look exactly like a
 * healthy fleet, and the regression would be invisible forever. Every case below
 * plants a violation the gate **MUST** flag, and asserts *why* it flagged — a
 * gate that freezes for the wrong reason fails here too.
 *
 * Fixtures are built in memory and never touch disk, so a control can never leak
 * into a production scan (`AGENTS.md`).
 *
 * Driven standalone by `scripts/check-sli-gate.mjs`, and by the normal test run.
 */

import { describe, expect, it } from 'vitest'
import { HOUR_MS, fleetGate, windowState, type SliBucket, type WindowState } from './buckets'

const OBJECTIVE = 0.999
const PROBE_MS = 60_000
const WINDOW_MS = 30 * 24 * HOUR_MS
const NOW = Date.UTC(2026, 6, 1, 12, 0, 0)

const opts = { nowMs: NOW, windowMs: WINDOW_MS, probeIntervalMs: PROBE_MS, minBuckets: 2 }

/** `count` hourly buckets whose newest slice ended `endHoursAgo` hours ago. */
function hours(
  tenantId: string,
  count: number,
  { endHoursAgo = 0, ok = 60, failed = 0 } = {}
): SliBucket[] {
  const newest = Math.floor((NOW - endHoursAgo * HOUR_MS) / HOUR_MS) * HOUR_MS
  return Array.from({ length: count }, (_, i) => ({
    tenantId,
    startMs: newest - (count - 1 - i) * HOUR_MS,
    span: 'hour' as const,
    ok,
    coldStart: 0,
    failed,
    latencySumMs: 100,
    maxLatencyMs: 20
  }))
}

const state = (tenantId: string, buckets: SliBucket[]): WindowState =>
  windowState(tenantId, buckets, opts)

describe('SLI gate — negative controls (the gate MUST flag each of these)', () => {
  it('freezes when probing has stopped fleet-wide', () => {
    expect(fleetGate([], OBJECTIVE)).toBe('freeze')
  })

  it('freezes on a tenant whose probe silently stopped', () => {
    const s = state('t_stale', hours('t_stale', 5, { endHoursAgo: 6 }))
    expect(s.kind).toBe('stale')
    expect(fleetGate([s], OBJECTIVE)).toBe('freeze')
  })

  it('freezes on one stale tenant even when the rest look perfect', () => {
    const healthy = state('t_ok', hours('t_ok', 10))
    const stale = state('t_stale', hours('t_stale', 5, { endHoursAgo: 6 }))
    expect([healthy.kind, stale.kind]).toEqual(['measured', 'stale'])
    expect(fleetGate([healthy, stale], OBJECTIVE)).toBe('freeze')
  })

  it('freezes when the error budget is exhausted by real failures', () => {
    const s = state('t_burn', hours('t_burn', 5, { ok: 998, failed: 2 }))
    expect(s.kind).toBe('measured')
    expect(fleetGate([s], OBJECTIVE)).toBe('freeze')
  })

  it('freezes when nothing has been measured yet — absent is not healthy', () => {
    const s = state('t_new', hours('t_new', 1))
    expect(s.kind).toBe('young')
    expect(fleetGate([s], OBJECTIVE)).toBe('freeze')
  })
})

describe('SLI gate — positive controls (the gate MUST NOT flag these)', () => {
  // A gate that only ever freezes is as useless as one that never does: it gets
  // switched off, and then nothing is gated at all.
  it('ships on a healthy, measured fleet', () => {
    expect(fleetGate([state('t_ok', hours('t_ok', 10))], OBJECTIVE)).toBe('ship')
  })

  it('does not let a brand-new tenant block a healthy fleet', () => {
    const healthy = state('t_ok', hours('t_ok', 10))
    const fresh = state('t_new', hours('t_new', 1))
    expect([healthy.kind, fresh.kind]).toEqual(['measured', 'young'])
    expect(fleetGate([healthy, fresh], OBJECTIVE)).toBe('ship')
  })

  it('never freezes a plan with no published objective', () => {
    const burning = state('t_burn', hours('t_burn', 5, { ok: 500, failed: 500 }))
    expect(fleetGate([burning], null)).toBe('ship')
  })

  it('does not call the still-open current hour stale', () => {
    expect(state('t_ok', hours('t_ok', 3)).kind).toBe('measured')
  })
})
