/**
 * Habit schedules — which calendar days a metric is "due".
 *
 * A `Metric` becomes a *habit* when it carries a recurring schedule. The
 * schedule drives the Today panel (what to check off) and the streak math
 * (which days count as scheduled, so a missed Tuesday only breaks a streak
 * if Tuesday was actually due).
 */

import { addDays, dayOfWeek, eachDay } from './day'

export type MetricSchedule = 'none' | 'daily' | 'weekly' | 'specificDays'

export interface ScheduleConfig {
  schedule: MetricSchedule
  /** Weekdays (0 = Sun … 6 = Sat) for `specificDays`, or the anchor for `weekly`. */
  scheduleDays?: number[]
}

/** Is the metric scheduled on this canonical day? */
export function isScheduledOn(day: number, config: ScheduleConfig): boolean {
  const dow = dayOfWeek(day)
  switch (config.schedule) {
    case 'daily':
      return true
    case 'weekly':
      // Anchored to the first listed weekday, defaulting to Monday.
      return dow === (config.scheduleDays?.[0] ?? 1)
    case 'specificDays':
      return (config.scheduleDays ?? []).includes(dow)
    case 'none':
    default:
      return false
  }
}

/** Every scheduled canonical day in `[start, end]` (inclusive). */
export function scheduledDaysInRange(
  start: number,
  end: number,
  config: ScheduleConfig
): number[] {
  if (config.schedule === 'none') return []
  return eachDay(start, end).filter((day) => isScheduledOn(day, config))
}

/**
 * Walk backwards from `today` to find the most recent scheduled day on or
 * before it — used to decide whether "today" is a pending check-in.
 */
export function lastScheduledOnOrBefore(today: number, config: ScheduleConfig): number | null {
  if (config.schedule === 'none') return null
  for (let i = 0; i < 366; i++) {
    const day = addDays(today, -i)
    if (isScheduledOn(day, config)) return day
  }
  return null
}
