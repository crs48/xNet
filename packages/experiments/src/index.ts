/**
 * @xnetjs/experiments — pure, dependency-free logic for the experiment journal
 * + habit tracker (exploration 0180).
 *
 * Three concerns, no UI and no data-layer coupling (functions take plain
 * arrays so they unit-test trivially and run anywhere):
 *   - canonical day handling (day.ts) + habit schedules (schedule.ts)
 *   - streaks and habit strength (streak.ts)
 *   - statistics + the honest verdict engine (stats.ts, verdict.ts)
 */

export {
  DAY_MS,
  canonicalDay,
  dayToIso,
  isoToDay,
  addDays,
  daysBetween,
  eachDay,
  dayOfWeek,
  weekStart
} from './day'

export {
  type MetricSchedule,
  type ScheduleConfig,
  isScheduledOn,
  scheduledDaysInRange,
  lastScheduledOnOrBefore
} from './schedule'

export { computeStreak, longestStreak, completionRate, habitStrength } from './streak'

export {
  mean,
  variance,
  stdDev,
  pooledStdDev,
  cohensD,
  percentChange,
  pearson,
  pointBiserial,
  linearRegression,
  pnd,
  tauU,
  meanDifferenceInterval,
  betaBinomialPosterior
} from './stats'

export {
  type Polarity,
  type VerdictDirection,
  type Caveat,
  type EvaluateInput,
  type Verdict,
  evaluate,
  describeCaveat
} from './verdict'
