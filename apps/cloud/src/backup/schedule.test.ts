import type { RestoreDrillResult } from './restore-drill'
import { describe, expect, it } from 'vitest'
import {
  backupHealthFrom,
  backupsHealthyFor,
  dayIndex,
  drillSampleSize,
  summarizeDrill,
  demotionDue,
  httpReadyProbe
} from './schedule'

describe('dayIndex', () => {
  it('advances once per UTC day and is stable within a day', () => {
    const d0 = dayIndex(0)
    expect(dayIndex(86_400_000 - 1)).toBe(d0)
    expect(dayIndex(86_400_000)).toBe(d0 + 1)
  })
})

describe('summarizeDrill', () => {
  const r = (tenantId: string, ok: boolean): RestoreDrillResult => ({ tenantId, ok })

  it('counts results and pages only on failure', () => {
    const clean = summarizeDrill([r('a', true), r('b', true)])
    expect(clean).toMatchObject({ total: 2, ok: 2, failed: 0, failures: [], alert: false })
    const broken = summarizeDrill([r('a', true), r('b', false), r('c', false)])
    expect(broken).toMatchObject({ total: 3, ok: 1, failed: 2, alert: true })
    expect(broken.failures).toEqual(['b', 'c'])
  })
})

describe('demotionDue', () => {
  const now = 10_000_000
  it('is due for a hot tenant idle past the threshold', () => {
    expect(demotionDue({ dataTier: 'hot', lastActiveMs: now - 60_000 }, now, 30_000)).toBe(true)
  })
  it('is not due when still within the window or already cold', () => {
    expect(demotionDue({ dataTier: 'hot', lastActiveMs: now - 10_000 }, now, 30_000)).toBe(false)
    expect(demotionDue({ dataTier: 'cold', lastActiveMs: 0 }, now, 30_000)).toBe(false)
  })
})

describe('httpReadyProbe', () => {
  it('is ready when /health answers, not ready when it does not', async () => {
    const up = httpReadyProbe((async () => ({ status: 'ok' })) as never)
    expect(await up.ready('https://h')).toBe(true)
    const down = httpReadyProbe((async () => null) as never)
    expect(await down.ready('https://h')).toBe(false)
  })
})

describe('backupHealthFrom (exploration 0418)', () => {
  it('is `off` when no object store is configured', () => {
    expect(backupHealthFrom(false, null)).toEqual({ state: 'off' })
    // History cannot make an unconfigured deployment look backed up.
    expect(backupHealthFrom(false, { ranAtMs: 1, failures: [] })).toEqual({ state: 'off' })
  })

  it('is `unproven` when configured but never drilled — NOT healthy', () => {
    expect(backupHealthFrom(true, null)).toEqual({ state: 'unproven' })
    expect(backupHealthFrom(true, undefined)).toEqual({ state: 'unproven' })
  })

  it('is `healthy` only after a drill passes', () => {
    expect(backupHealthFrom(true, { ranAtMs: 99, failures: [] })).toEqual({
      state: 'healthy',
      lastDrillMs: 99
    })
  })

  it('is `failing` — distinct from both off and unproven — when a drill failed', () => {
    expect(backupHealthFrom(true, { ranAtMs: 99, failures: ['acme'] })).toEqual({
      state: 'failing',
      lastDrillMs: 99,
      failures: ['acme']
    })
  })
})

describe('backupsHealthyFor', () => {
  it('never reports `unproven` as healthy on the public status page', () => {
    expect(backupsHealthyFor({ state: 'unproven' })).toBeNull()
    expect(backupsHealthyFor({ state: 'off' })).toBeNull()
    expect(backupsHealthyFor(undefined)).toBeNull()
  })

  it('maps proven states through', () => {
    expect(backupsHealthyFor({ state: 'healthy', lastDrillMs: 1 })).toBe(true)
    expect(backupsHealthyFor({ state: 'failing', lastDrillMs: 1, failures: ['a'] })).toBe(false)
  })
})

describe('drillSampleSize', () => {
  it('drills nothing when there is no fleet', () => {
    expect(drillSampleSize(0)).toBe(0)
  })

  it('covers a small fleet without over-provisioning throwaway hubs', () => {
    expect(drillSampleSize(1)).toBe(1)
    expect(drillSampleSize(3)).toBe(1)
    expect(drillSampleSize(10)).toBe(1)
  })

  it('scales with the fleet instead of sitting at a constant', () => {
    expect(drillSampleSize(50)).toBe(5)
    expect(drillSampleSize(120)).toBe(12)
  })

  it('caps the nightly cost as the fleet grows', () => {
    expect(drillSampleSize(500)).toBe(20)
    expect(drillSampleSize(50_000)).toBe(20)
  })

  it('never returns more than the fleet has to offer at the low end', () => {
    expect(drillSampleSize(2)).toBeLessThanOrEqual(2)
  })
})
