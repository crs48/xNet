/**
 * Canonical day helpers — kept local so `@xnetjs/crm` stays pure and
 * dependency-free (like `@xnetjs/experiments`). The invariant matches the rest
 * of xNet: an all-day value is **UTC midnight** of the intended calendar day,
 * so a "next touch" logged in one timezone lands on the same day everywhere
 * (the off-by-one class of bug documented in exploration 0172).
 */

export const DAY_MS = 86_400_000

/** UTC midnight of the calendar day containing `ms` (defaults to now). */
export function canonicalDay(ms: number = Date.now()): number {
  const d = new Date(ms)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}

/** The canonical day `offset` days from `day`. */
export function addDays(day: number, offset: number): number {
  return day + offset * DAY_MS
}

/** Whole calendar days from `a` to `b` (b − a); negative when b precedes a. */
export function daysBetween(a: number, b: number): number {
  return Math.round((b - a) / DAY_MS)
}
