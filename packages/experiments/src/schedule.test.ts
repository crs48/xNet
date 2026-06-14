import { describe, expect, it } from 'vitest'
import { isoToDay } from './day'
import { isScheduledOn, lastScheduledOnOrBefore, scheduledDaysInRange } from './schedule'

const day = (iso: string) => isoToDay(iso) as number

describe('habit schedules', () => {
  it('daily is scheduled every day', () => {
    expect(isScheduledOn(day('2026-06-14'), { schedule: 'daily' })).toBe(true)
  })

  it('specificDays matches only listed weekdays', () => {
    // Mon/Wed/Fri = [1,3,5]. 2026-06-15 is a Monday, 16 Tue, 17 Wed.
    const config = { schedule: 'specificDays' as const, scheduleDays: [1, 3, 5] }
    expect(isScheduledOn(day('2026-06-15'), config)).toBe(true) // Mon
    expect(isScheduledOn(day('2026-06-16'), config)).toBe(false) // Tue
    expect(isScheduledOn(day('2026-06-17'), config)).toBe(true) // Wed
  })

  it('weekly is anchored to one weekday (Monday default)', () => {
    expect(isScheduledOn(day('2026-06-15'), { schedule: 'weekly' })).toBe(true) // Mon
    expect(isScheduledOn(day('2026-06-16'), { schedule: 'weekly' })).toBe(false)
    expect(
      isScheduledOn(day('2026-06-14'), { schedule: 'weekly', scheduleDays: [0] })
    ).toBe(true) // anchored Sunday
  })

  it('none is never scheduled (ad-hoc / continuous metrics)', () => {
    expect(isScheduledOn(day('2026-06-14'), { schedule: 'none' })).toBe(false)
    expect(scheduledDaysInRange(day('2026-06-01'), day('2026-06-30'), { schedule: 'none' })).toEqual(
      []
    )
  })

  it('enumerates scheduled days in a range', () => {
    const days = scheduledDaysInRange(day('2026-06-15'), day('2026-06-21'), {
      schedule: 'specificDays',
      scheduleDays: [1, 3, 5]
    })
    // Mon 15, Wed 17, Fri 19
    expect(days.map((d) => d)).toEqual([day('2026-06-15'), day('2026-06-17'), day('2026-06-19')])
  })

  it('finds the last scheduled day on or before today', () => {
    const config = { schedule: 'specificDays' as const, scheduleDays: [1, 3, 5] }
    // 2026-06-16 is Tue → last scheduled is Mon 15.
    expect(lastScheduledOnOrBefore(day('2026-06-16'), config)).toBe(day('2026-06-15'))
    expect(lastScheduledOnOrBefore(day('2026-06-16'), { schedule: 'none' })).toBeNull()
  })
})
