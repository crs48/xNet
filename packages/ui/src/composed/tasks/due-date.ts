/**
 * Canonical due-date conversions.
 *
 * A task's `dueDate` is an all-day value with one invariant: the stored
 * number is UTC midnight of the intended calendar day (`Date.UTC(y, m, d)`).
 * Every surface — the inline form, the page editor's `<time>` chip, the
 * projection sync — must convert through these helpers so a date set in one
 * timezone renders as the same calendar day everywhere.
 *
 * Never build a `dueDate` from a local-time `Date` (`new Date(y, m, d)`) or
 * read it back with local getters; that reintroduces the all-day off-by-one
 * bug for users west/east of UTC. See exploration 0172.
 */

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/
const DAY_MS = 86_400_000

/** UTC-midnight ms → "YYYY-MM-DD" (UTC getters, never local). */
export function dueDateMsToIso(ms: number): string {
  const date = new Date(ms)
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** "YYYY-MM-DD" → UTC-midnight ms, or null when not a real calendar day. */
export function isoToDueDateMs(iso: string): number | null {
  if (!ISO_DAY.test(iso)) return null
  const [year, month, day] = iso.split('-').map(Number)
  const ms = Date.UTC(year, month - 1, day)
  // Round-trip guard rejects overflow like 2026-02-31.
  return Number.isNaN(ms) || dueDateMsToIso(ms) !== iso ? null : ms
}

/** UTC midnight of the calendar day `offset` days from `now`. */
export function utcDayFromNow(offset: number, now = Date.now()): number {
  const date = new Date(now)
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) + offset * DAY_MS
}

/** `<input type="date">` value for a nullable due date ('' when unset). */
export function dueDateInputValue(ms: number | null | undefined): string {
  return ms == null ? '' : dueDateMsToIso(ms)
}
