import { describe, expect, it } from 'vitest'
import { dayIndex, summarizeDrill, demotionDue, httpReadyProbe } from './schedule'
import type { RestoreDrillResult } from './restore-drill'

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
