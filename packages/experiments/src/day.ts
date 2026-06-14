/**
 * Canonical day helpers — the single source of truth for "which calendar
 * day is this" across the experiment journal + habit tracker.
 *
 * An Observation's `day` is an all-day value with one invariant: the stored
 * number is **UTC midnight** of the intended calendar day (`Date.UTC(y, m, d)`).
 * Every surface — the Today panel, the calendar heatmap, the verdict engine —
 * must convert through these helpers so a check-in logged in one timezone
 * lands on the same calendar day everywhere.
 *
 * Never build a `day` from a local-time `Date` (`new Date(y, m, d)`) or read it
 * back with local getters; that reintroduces the all-day off-by-one bug for
 * users west/east of UTC. See exploration 0172 (task due dates), where the same
 * class of bug was first documented.
 */

export const DAY_MS = 86_400_000

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

/** UTC midnight of the calendar day that contains `ms` (defaults to now). */
export function canonicalDay(ms: number = Date.now()): number {
  const d = new Date(ms)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}

/** UTC-midnight ms → "YYYY-MM-DD" (UTC getters, never local). */
export function dayToIso(day: number): string {
  const d = new Date(day)
  const year = d.getUTCFullYear()
  const month = String(d.getUTCMonth() + 1).padStart(2, '0')
  const date = String(d.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${date}`
}

/** "YYYY-MM-DD" → UTC-midnight ms, or null when not a real calendar day. */
export function isoToDay(iso: string): number | null {
  if (!ISO_DAY.test(iso)) return null
  const [year, month, date] = iso.split('-').map(Number)
  const ms = Date.UTC(year, month - 1, date)
  // Round-trip guard rejects overflow like 2026-02-31.
  return Number.isNaN(ms) || dayToIso(ms) !== iso ? null : ms
}

/** The canonical day `offset` days away from `day`. */
export function addDays(day: number, offset: number): number {
  return day + offset * DAY_MS
}

/** Whole calendar days from `a` to `b` (b − a). Negative when b precedes a. */
export function daysBetween(a: number, b: number): number {
  return Math.round((b - a) / DAY_MS)
}

/** Inclusive list of every canonical day from `start` to `end`. */
export function eachDay(start: number, end: number): number[] {
  const days: number[] = []
  for (let d = start; d <= end; d += DAY_MS) days.push(d)
  return days
}

/** Day of week in UTC: 0 = Sunday … 6 = Saturday. */
export function dayOfWeek(day: number): number {
  return new Date(day).getUTCDay()
}

/**
 * The canonical day starting the week containing `day`. `weekStartsOn`
 * follows JS conventions (0 = Sunday, 1 = Monday — the default).
 */
export function weekStart(day: number, weekStartsOn: number = 1): number {
  const dow = dayOfWeek(day)
  const diff = (dow - weekStartsOn + 7) % 7
  return addDays(day, -diff)
}
