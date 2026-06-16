/**
 * Keep-in-touch cadence — the personal-CRM heartbeat. Given a contact's last
 * touch and a cadence in days, decide when the next touch is due and surface
 * overdue contacts. All day math goes through the canonical-day helpers.
 */

import { addDays, canonicalDay, daysBetween } from './day'

export interface CadenceContact {
  lastTouchAt?: number | null
  nextTouchAt?: number | null
  touchEveryDays?: number | null
}

/**
 * The canonical day of the next touch, derived from the last touch + cadence.
 * Returns `null` when there is no cadence (cadence is opt-in). When no last
 * touch is recorded, the cadence is measured from today.
 */
export function computeNextTouch(
  lastTouchAt: number | null | undefined,
  touchEveryDays: number | null | undefined,
  now: number = Date.now()
): number | null {
  if (touchEveryDays == null || touchEveryDays <= 0) return null
  const base = lastTouchAt != null ? canonicalDay(lastTouchAt) : canonicalDay(now)
  return addDays(base, touchEveryDays)
}

/**
 * The effective next-touch day: a stored `nextTouchAt` wins, otherwise it is
 * derived. `null` when the contact has no cadence and no stored date.
 */
export function effectiveNextTouch(c: CadenceContact, now: number = Date.now()): number | null {
  if (c.nextTouchAt != null) return canonicalDay(c.nextTouchAt)
  return computeNextTouch(c.lastTouchAt, c.touchEveryDays, now)
}

/** Whole days until the next touch (negative = overdue); `null` when no cadence. */
export function daysUntilTouch(c: CadenceContact, now: number = Date.now()): number | null {
  const next = effectiveNextTouch(c, now)
  if (next == null) return null
  return daysBetween(canonicalDay(now), next)
}

/** True when the next touch is today or in the past. */
export function isOverdue(c: CadenceContact, now: number = Date.now()): boolean {
  const days = daysUntilTouch(c, now)
  return days != null && days <= 0
}

/**
 * The subset of contacts due for follow-up (overdue or due today), most
 * overdue first. Contacts without a cadence are excluded.
 */
export function dueForFollowUp<T extends CadenceContact>(
  contacts: T[],
  now: number = Date.now()
): T[] {
  return contacts
    .map((c) => ({ c, days: daysUntilTouch(c, now) }))
    .filter((x): x is { c: T; days: number } => x.days != null && x.days <= 0)
    .sort((a, b) => a.days - b.days)
    .map((x) => x.c)
}
