/**
 * Date arithmetic for the exploration fallow ratchet.
 *
 * Split out of `check-exploration-fallow.mjs` so it can be tested without
 * shelling out to git or rewriting `STALE.md`.
 *
 * Everything here is a **UTC calendar day**, never an instant. That is the
 * whole point of the module.
 *
 * The bug it exists to prevent: `STALE.md` used to print a `Due` column floored
 * to a UTC date while computing its `Overdue` column from the raw commit
 * instant a default due date was derived from. Exploration 0079 was born
 * 14:56Z and 0080 at 02:37Z the next morning, so their due *dates* sat a day
 * apart while their due *instants* sat under twelve hours apart — and for the
 * stretch of each day between those two clock times, both rows reported the
 * same overdue count. Regenerating on 2026-08-01 gave 84d/83d; on 2026-08-02
 * at 05:14Z it gave 84d/84d, which cannot both be right.
 *
 * Quantising once, up front, also makes the report a function of today's UTC
 * date rather than of the moment it ran, so it stops churning on every
 * `pnpm check:exploration-fallow`.
 */

export const DAY_MS = 86_400_000

/** UTC midnight of the day `ms` falls in. The epoch is itself UTC midnight. */
export const utcDay = (ms) => Math.floor(ms / DAY_MS) * DAY_MS

/** Whole UTC days from `from` to `to`, ignoring the time of day in both. */
export const dayDiff = (to, from) => (utcDay(to) - utcDay(from)) / DAY_MS

/**
 * The UTC day an exploration falls due, or `null` when its age is unknowable.
 *
 * `review` wins when present; otherwise the document is due `windowDays` after
 * the *day* it was born — not `windowDays × 24h` after the commit that added
 * it, which is what carried a time of day into every downstream comparison.
 *
 * `null` is a third answer, distinct from both "due" and "not yet due": a
 * document with neither an explicit date nor a birth date has an *unreadable*
 * age, and AGENTS.md forbids folding that in with a document that is merely
 * young.
 */
export function dueDay({ review, bornMs, windowDays }) {
  if (review && /^\d{4}-\d{2}-\d{2}$/.test(review)) {
    const parsed = Date.parse(`${review}T00:00:00Z`)
    if (!Number.isNaN(parsed)) return parsed
  }
  if (bornMs !== undefined && bornMs !== null) return utcDay(bornMs) + windowDays * DAY_MS
  return null
}

/**
 * Whole UTC days elapsed since the due date — negative while still in hand.
 *
 * Consecutive due dates always differ by exactly one, which is the property the
 * old instant-based arithmetic could not hold.
 */
export const overdueDays = (dueMs, nowMs) => dayDiff(nowMs, dueMs)

/**
 * Whether a document is *past* its review date, which starts the day after it.
 *
 * A document due today has not lapsed yet; listing it under "Past review date"
 * at `0d` overdue was never true.
 */
export const isOverdue = (dueMs, nowMs) => overdueDays(dueMs, nowMs) > 0

/** The `YYYY-MM-DD` a due day prints as. Same quantisation as the count. */
export const formatDay = (dayMs) => new Date(dayMs).toISOString().slice(0, 10)
