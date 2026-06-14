/**
 * Streak and habit-strength math.
 *
 * All `day` values are canonical UTC-midnight ms (see day.ts). `completedDays`
 * is the set of days on which the habit was actually done; `scheduledDays` is
 * the ascending list of days the habit was *due* (from schedule.ts) up to and
 * including today. A miss only breaks a streak on a scheduled day.
 */

/**
 * Current streak: consecutive scheduled days completed, counting back from the
 * most recent scheduled day. Today is never treated as a miss until it passes —
 * an as-yet-unlogged today is skipped rather than breaking the chain.
 */
export function computeStreak(
  completedDays: Set<number>,
  scheduledDays: number[],
  today: number
): number {
  let streak = 0
  for (let i = scheduledDays.length - 1; i >= 0; i--) {
    const day = scheduledDays[i]
    if (day > today) continue
    if (completedDays.has(day)) {
      streak++
    } else if (day === today) {
      continue // today not yet a miss
    } else {
      break
    }
  }
  return streak
}

/** Longest run of consecutive scheduled days completed, over all history. */
export function longestStreak(completedDays: Set<number>, scheduledDays: number[]): number {
  let longest = 0
  let run = 0
  for (const day of scheduledDays) {
    if (completedDays.has(day)) {
      run++
      if (run > longest) longest = run
    } else {
      run = 0
    }
  }
  return longest
}

/** Completion rate over a window: completed scheduled days / scheduled days. */
export function completionRate(completedDays: Set<number>, scheduledDays: number[]): number {
  if (scheduledDays.length === 0) return 0
  let done = 0
  for (const day of scheduledDays) if (completedDays.has(day)) done++
  return done / scheduledDays.length
}

/**
 * Habit strength — a 0..1 score that grows with consistent completion and
 * decays gracefully with misses (Loop Habit Tracker's design). An exponential
 * weighted moving average over the scheduled days, with `halfLifeDays`
 * controlling how quickly old behavior fades.
 *
 * Unlike a brittle integer streak, strength degrades rather than resetting to
 * zero on a single miss, which is both kinder and a better predictor.
 */
export function habitStrength(
  completedDays: Set<number>,
  scheduledDays: number[],
  options: { halfLifeDays?: number } = {}
): number {
  const halfLife = Math.max(1, options.halfLifeDays ?? 14)
  // alpha derived so that weight halves every `halfLife` scheduled occurrences.
  const alpha = 1 - Math.pow(0.5, 1 / halfLife)
  let strength = 0
  for (const day of scheduledDays) {
    const value = completedDays.has(day) ? 1 : 0
    strength += alpha * (value - strength)
  }
  return strength
}
