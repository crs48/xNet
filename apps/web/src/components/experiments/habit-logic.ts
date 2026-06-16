/**
 * Pure selectors that turn Metric + Observation nodes into the per-habit state
 * the Today panel and dashboard widgets render. Kept free of React and the data
 * layer so it unit-tests trivially; all day math goes through
 * @xnetjs/experiments so "which day is this" is canonical everywhere.
 */
import {
  addDays,
  canonicalDay,
  completionRate,
  computeStreak,
  habitStrength,
  isScheduledOn,
  longestStreak,
  scheduledDaysInRange,
  type MetricSchedule
} from '@xnetjs/experiments'

export interface MetricLike {
  id: string
  name?: unknown
  kind?: unknown
  schedule?: unknown
  scheduleDays?: unknown
  color?: unknown
  icon?: unknown
  unit?: unknown
  scaleMin?: unknown
  scaleMax?: unknown
  target?: unknown
  polarity?: unknown
  cue?: unknown
  experiment?: unknown
}

export interface ObservationLike {
  id: string
  metric?: unknown
  day?: unknown
  value?: unknown
  note?: unknown
}

export function metricName(metric: MetricLike): string {
  return typeof metric.name === 'string' && metric.name ? metric.name : 'Untitled metric'
}

export function metricKind(metric: MetricLike): string {
  return typeof metric.kind === 'string' ? metric.kind : 'boolean'
}

export function metricScheduleConfig(metric: MetricLike): {
  schedule: MetricSchedule
  scheduleDays?: number[]
} {
  const schedule = (
    typeof metric.schedule === 'string' ? metric.schedule : 'none'
  ) as MetricSchedule
  const scheduleDays = Array.isArray(metric.scheduleDays)
    ? metric.scheduleDays.filter((d): d is number => typeof d === 'number')
    : undefined
  return { schedule, scheduleDays }
}

/** A Metric is a habit when it carries a recurring schedule. */
export function isHabit(metric: MetricLike): boolean {
  return metricScheduleConfig(metric).schedule !== 'none'
}

/** Observations for one metric, keyed by canonical day. */
export function observationsByDay(
  observations: ObservationLike[],
  metricId: string
): Map<number, ObservationLike> {
  const map = new Map<number, ObservationLike>()
  for (const obs of observations) {
    if (obs.metric !== metricId) continue
    if (typeof obs.day !== 'number') continue
    const day = canonicalDay(obs.day)
    // Last write wins for a given day (queries are ordered desc by day).
    if (!map.has(day)) map.set(day, obs)
  }
  return map
}

/** Did this observation count as "completed"? Booleans need value ≥ 1. */
export function isCompletedObservation(
  metric: MetricLike,
  obs: ObservationLike | undefined
): boolean {
  if (!obs) return false
  if (metricKind(metric) === 'boolean') {
    return typeof obs.value === 'number' && obs.value >= 1
  }
  return obs.value !== undefined && obs.value !== null
}

export interface HabitSummary {
  done: boolean
  streak: number
  longest: number
  strength: number
  rate30: number
  completedDays: Set<number>
  byDay: Map<number, ObservationLike>
}

/**
 * Everything the Today panel needs for one habit, as of `today` (canonical).
 * Streak/strength/rate are computed only over *scheduled* days so a metric that
 * is only due Mon/Wed/Fri isn't punished for a skipped Tuesday.
 */
export function habitSummary(
  metric: MetricLike,
  observations: ObservationLike[],
  today: number
): HabitSummary {
  const byDay = observationsByDay(observations, metric.id)
  const completedDays = new Set<number>()
  for (const [day, obs] of byDay) {
    if (isCompletedObservation(metric, obs)) completedDays.add(day)
  }

  const config = metricScheduleConfig(metric)
  // Window back far enough for a meaningful streak/strength read.
  const windowStart = addDays(today, -400)
  const scheduled = scheduledDaysInRange(windowStart, today, config)
  const last30Start = addDays(today, -29)
  const scheduled30 = scheduledDaysInRange(last30Start, today, config)

  return {
    done: isCompletedObservation(metric, byDay.get(today)),
    streak: computeStreak(completedDays, scheduled, today),
    longest: longestStreak(completedDays, scheduled),
    strength: habitStrength(completedDays, scheduled),
    rate30: completionRate(completedDays, scheduled30),
    completedDays,
    byDay
  }
}

/** Is this habit due on `today`? */
export function isDueToday(metric: MetricLike, today: number): boolean {
  return isScheduledOn(today, metricScheduleConfig(metric))
}

/** Habits scheduled for today, with their summaries — the Today panel list. */
export function todaysHabits(
  metrics: MetricLike[],
  observations: ObservationLike[],
  today: number
): Array<{ metric: MetricLike; summary: HabitSummary }> {
  return metrics
    .filter((m) => isHabit(m) && isDueToday(m, today))
    .map((metric) => ({ metric, summary: habitSummary(metric, observations, today) }))
}
