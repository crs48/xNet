import type { Cut } from '@xnetjs/data'
import { describe, expect, it } from 'vitest'
import {
  activeCuts,
  addManualCut,
  cutAt,
  editedDurationMs,
  editedToSource,
  keptSpans,
  nextPlayheadMs,
  removedMs,
  restoreAll,
  sourceToEdited,
  summarizeCuts,
  toggleCut
} from './edl'

const cut = (
  startMs: number,
  endMs: number,
  enabled = true,
  reason: Cut['reason'] = 'silence'
): Cut => ({
  startMs,
  endMs,
  reason,
  enabled
})

describe('activeCuts', () => {
  it('drops disabled and empty cuts', () => {
    expect(activeCuts([cut(0, 100, false), cut(200, 200), cut(300, 400)])).toEqual([
      { startMs: 300, endMs: 400 }
    ])
  })

  it('sorts and merges overlapping spans so time is never double-counted', () => {
    expect(activeCuts([cut(500, 900), cut(100, 300), cut(250, 600)])).toEqual([
      { startMs: 100, endMs: 900 }
    ])
  })

  it('merges spans that only touch', () => {
    expect(activeCuts([cut(0, 100), cut(100, 200)])).toEqual([{ startMs: 0, endMs: 200 }])
  })
})

describe('removedMs / editedDurationMs', () => {
  it('sums merged spans, not raw ones', () => {
    expect(removedMs([cut(0, 1000), cut(500, 1500)])).toBe(1500)
  })

  it('shortens the duration by exactly the removed time', () => {
    expect(editedDurationMs(60_000, [cut(1_000, 2_000), cut(5_000, 5_500)])).toBe(58_500)
  })

  it('never goes negative even if cuts exceed the duration', () => {
    expect(editedDurationMs(1_000, [cut(0, 9_999)])).toBe(0)
  })

  it('disabling every cut restores the source duration exactly', () => {
    const cuts = [cut(1_000, 2_000), cut(5_000, 5_500), cut(9_000, 9_100, true, 'manual')]
    expect(editedDurationMs(60_000, restoreAll(cuts))).toBe(60_000)
  })
})

describe('sourceToEdited / editedToSource', () => {
  const cuts = [cut(1_000, 2_000), cut(5_000, 6_000)]

  it('leaves positions before the first cut untouched', () => {
    expect(sourceToEdited(500, cuts)).toEqual({ editedMs: 500, isCut: false })
  })

  it('subtracts preceding cuts', () => {
    expect(sourceToEdited(3_000, cuts)).toEqual({ editedMs: 2_000, isCut: false })
    expect(sourceToEdited(7_000, cuts)).toEqual({ editedMs: 5_000, isCut: false })
  })

  it('flags a position inside a cut instead of inventing an edited time', () => {
    expect(sourceToEdited(1_500, cuts)).toEqual({ editedMs: 1_000, isCut: true })
  })

  it('round-trips every kept position', () => {
    for (const sourceMs of [0, 999, 2_000, 3_500, 4_999, 6_000, 8_000]) {
      const { editedMs, isCut } = sourceToEdited(sourceMs, cuts)
      expect(isCut).toBe(false)
      expect(editedToSource(editedMs, cuts)).toBe(sourceMs)
    }
  })

  it('maps the edited origin back past a cut that starts at zero', () => {
    expect(editedToSource(0, [cut(0, 2_000)])).toBe(2_000)
  })
})

describe('cutAt / nextPlayheadMs', () => {
  const cuts = [cut(1_000, 2_000)]

  it('finds the containing cut, half-open at the end', () => {
    expect(cutAt(1_000, cuts)).toEqual({ startMs: 1_000, endMs: 2_000 })
    expect(cutAt(1_999, cuts)).not.toBeNull()
    expect(cutAt(2_000, cuts)).toBeNull()
  })

  it('returns the resume point inside a cut and null outside', () => {
    expect(nextPlayheadMs(1_500, cuts)).toBe(2_000)
    expect(nextPlayheadMs(2_500, cuts)).toBeNull()
  })

  it('collapses chained cuts into a single jump', () => {
    expect(nextPlayheadMs(100, [cut(0, 1_000), cut(1_000, 3_000)])).toBe(3_000)
  })
})

describe('keptSpans', () => {
  it('returns the surviving spans in order', () => {
    expect(keptSpans(10_000, [cut(2_000, 3_000), cut(7_000, 8_000)])).toEqual([
      { startMs: 0, endMs: 2_000 },
      { startMs: 3_000, endMs: 7_000 },
      { startMs: 8_000, endMs: 10_000 }
    ])
  })

  it('handles a cut at the very start and end', () => {
    expect(keptSpans(10_000, [cut(0, 1_000), cut(9_000, 10_000)])).toEqual([
      { startMs: 1_000, endMs: 9_000 }
    ])
  })

  it('returns nothing when everything is cut', () => {
    expect(keptSpans(5_000, [cut(0, 5_000)])).toEqual([])
  })

  it('kept spans total the edited duration', () => {
    const cuts = [cut(1_000, 2_000), cut(4_000, 4_500)]
    const total = keptSpans(10_000, cuts).reduce((n, s) => n + (s.endMs - s.startMs), 0)
    expect(total).toBe(editedDurationMs(10_000, cuts))
  })
})

describe('summarizeCuts', () => {
  it('breaks removed time down by reason so the UI can explain itself', () => {
    const summary = summarizeCuts([
      cut(0, 1_000),
      cut(2_000, 2_300, true, 'filler'),
      cut(5_000, 6_000, false)
    ])

    expect(summary.count).toBe(2)
    expect(summary.removedMs).toBe(1_300)
    expect(summary.byReason.silence).toEqual({ count: 1, removedMs: 1_000 })
    expect(summary.byReason.filler).toEqual({ count: 1, removedMs: 300 })
    expect(summary.byReason.manual).toBeUndefined()
  })
})

describe('editing helpers', () => {
  it('appends a manual cut without merging it into a proposal', () => {
    const next = addManualCut([cut(0, 1_000)], { startMs: 500, endMs: 1_500 })
    expect(next).toHaveLength(2)
    expect(next[1]).toEqual({ startMs: 500, endMs: 1_500, reason: 'manual', enabled: true })
  })

  it('ignores an empty or inverted manual span', () => {
    expect(addManualCut([], { startMs: 900, endMs: 900 })).toEqual([])
    expect(addManualCut([], { startMs: 900, endMs: 100 })).toEqual([])
  })

  it('toggles one cut and leaves the rest alone', () => {
    const cuts = [cut(0, 100), cut(200, 300)]
    expect(toggleCut(cuts, 1).map((c) => c.enabled)).toEqual([true, false])
    expect(toggleCut(cuts, 1, true).map((c) => c.enabled)).toEqual([true, true])
    expect(toggleCut(cuts, 9).map((c) => c.enabled)).toEqual([true, true])
  })
})
