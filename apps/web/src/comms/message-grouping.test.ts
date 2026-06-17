import { describe, expect, it } from 'vitest'
import { dayLabel, formatTime, groupMessages, sameDay, type ChatRow } from './message-grouping'

const DAY = 24 * 60 * 60_000
const MIN = 60_000

function msg(id: string, createdBy: string, createdAt: number): ChatRow {
  return { id, createdBy, createdAt }
}

describe('sameDay', () => {
  it('is true within a day and false across midnight', () => {
    const noon = new Date(2026, 5, 17, 12).getTime()
    const evening = new Date(2026, 5, 17, 23).getTime()
    const nextMorning = new Date(2026, 5, 18, 1).getTime()
    expect(sameDay(noon, evening)).toBe(true)
    expect(sameDay(evening, nextMorning)).toBe(false)
  })

  it('is false when either side is missing', () => {
    expect(sameDay(undefined, Date.now())).toBe(false)
    expect(sameDay(Date.now(), undefined)).toBe(false)
  })
})

describe('dayLabel', () => {
  const now = new Date(2026, 5, 17, 10).getTime()
  it('labels today and yesterday relative to now', () => {
    expect(dayLabel(new Date(2026, 5, 17, 9).getTime(), now)).toBe('Today')
    expect(dayLabel(new Date(2026, 5, 16, 9).getTime(), now)).toBe('Yesterday')
  })
  it('labels older days with weekday + date', () => {
    const label = dayLabel(new Date(2026, 5, 10, 9).getTime(), now)
    expect(label).not.toBe('Today')
    expect(label).not.toBe('Yesterday')
    expect(label).toMatch(/Jun/)
  })
})

describe('formatTime', () => {
  it('returns empty string for missing timestamps', () => {
    expect(formatTime(undefined)).toBe('')
  })
  it('formats a real timestamp', () => {
    expect(formatTime(new Date(2026, 5, 17, 9, 24).getTime())).toMatch(/\d/)
  })
})

describe('groupMessages', () => {
  const t0 = new Date(2026, 5, 17, 9, 0).getTime()

  it('collapses consecutive same-author messages within the window', () => {
    const rows = groupMessages(
      [msg('a', 'alice', t0), msg('b', 'alice', t0 + MIN), msg('c', 'alice', t0 + 2 * MIN)],
      0,
      t0 + 3 * MIN
    )
    expect(rows.map((r) => r.startsGroup)).toEqual([true, false, false])
  })

  it('starts a new group when the author changes', () => {
    const rows = groupMessages([msg('a', 'alice', t0), msg('b', 'bob', t0 + MIN)], 0, t0 + 2 * MIN)
    expect(rows.map((r) => r.startsGroup)).toEqual([true, true])
  })

  it('starts a new group after a gap longer than the window', () => {
    const rows = groupMessages(
      [msg('a', 'alice', t0), msg('b', 'alice', t0 + 6 * MIN)],
      0,
      t0 + 7 * MIN
    )
    expect(rows.map((r) => r.startsGroup)).toEqual([true, true])
  })

  it('inserts a day separator and forces a group across a day boundary', () => {
    const rows = groupMessages([msg('a', 'alice', t0), msg('b', 'alice', t0 + DAY)], 0, t0 + DAY)
    expect(rows[0].daySeparator).toBe('Yesterday')
    expect(rows[1].daySeparator).toBe('Today')
    expect(rows[1].startsGroup).toBe(true)
  })

  it('flags exactly the first message past the read watermark', () => {
    const rows = groupMessages(
      [msg('a', 'alice', t0), msg('b', 'bob', t0 + MIN), msg('c', 'alice', t0 + 2 * MIN)],
      t0 + MIN,
      t0 + 3 * MIN
    )
    expect(rows.map((r) => r.firstUnread)).toEqual([false, false, true])
  })

  it('flags nothing when everything is already read', () => {
    const rows = groupMessages([msg('a', 'alice', t0)], t0 + DAY, t0 + DAY)
    expect(rows.some((r) => r.firstUnread)).toBe(false)
  })
})
