import { isoToDay } from '@xnetjs/experiments'
import { describe, expect, it } from 'vitest'
import {
  habitSummary,
  isDueToday,
  isHabit,
  observationsByDay,
  todaysHabits,
  type MetricLike,
  type ObservationLike
} from './habit-logic'

const day = (iso: string) => isoToDay(iso) as number

const meditate: MetricLike = {
  id: 'm1',
  name: 'Meditate',
  kind: 'boolean',
  schedule: 'daily'
}

function obs(metric: string, d: number, value = 1): ObservationLike {
  return { id: `${metric}-${d}`, metric, day: d, value }
}

describe('habit-logic', () => {
  it('classifies habits by schedule', () => {
    expect(isHabit(meditate)).toBe(true)
    expect(isHabit({ id: 'mood', kind: 'scale', schedule: 'none' })).toBe(false)
  })

  it('respects specificDays scheduling for "due today"', () => {
    const mwf: MetricLike = { id: 'm', schedule: 'specificDays', scheduleDays: [1, 3, 5] }
    expect(isDueToday(mwf, day('2026-06-15'))).toBe(true) // Mon
    expect(isDueToday(mwf, day('2026-06-16'))).toBe(false) // Tue
  })

  it('keeps the most recent observation per day', () => {
    const observations = [obs('m1', day('2026-06-14'), 0), obs('m1', day('2026-06-14'), 1)]
    const byDay = observationsByDay(observations, 'm1')
    // desc-ordered queries put the latest first; first-seen wins.
    expect(byDay.get(day('2026-06-14'))?.value).toBe(0)
  })

  it('computes streak/strength over scheduled days only', () => {
    const today = day('2026-06-14')
    const observations = [
      obs('m1', day('2026-06-12')),
      obs('m1', day('2026-06-13')),
      obs('m1', today)
    ]
    const summary = habitSummary(meditate, observations, today)
    expect(summary.done).toBe(true)
    expect(summary.streak).toBe(3)
    expect(summary.strength).toBeGreaterThan(0)
  })

  it('treats a boolean value of 0 as not done', () => {
    const today = day('2026-06-14')
    const summary = habitSummary(meditate, [obs('m1', today, 0)], today)
    expect(summary.done).toBe(false)
  })

  it('lists only habits due today', () => {
    const tueOnly: MetricLike = {
      id: 'm2',
      name: 'Gym',
      schedule: 'specificDays',
      scheduleDays: [2]
    }
    const today = day('2026-06-15') // Monday
    const list = todaysHabits([meditate, tueOnly], [], today)
    expect(list.map((h) => h.metric.id)).toEqual(['m1']) // gym (Tue) excluded
  })
})
