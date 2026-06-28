/**
 * @xnetjs/cloud/billing — AI budget windows.
 *
 * A user's self-set AI spend cap applies over a *window*. We support three
 * (exploration 0244):
 *
 *  - `calendar-month` — resets the 1st at 00:00 UTC. The default, aligned to the
 *    Stripe invoice period.
 *  - `calendar-week` — resets Monday 00:00 UTC, aligned to OpenRouter's native
 *    weekly key reset so the provider-side backstop stays in lockstep.
 *  - `rolling` — a trailing `days`-day lookback ("spend in the last N days"); the
 *    most intuitive reading of "this much in a week", but it has no OpenRouter
 *    calendar equivalent, so the key backstop falls back to monthly.
 *
 * {@link windowStartMs} is the one pure function the metered gateway's
 * `periodStartMsFor` calls to scope the ledger sum. Pure + I/O-free so it can be
 * exhaustively unit-tested.
 */

/** A spend-cap window. `rolling.days` is the trailing lookback length in days. */
export type BudgetWindow =
  | { kind: 'calendar-month' }
  | { kind: 'calendar-week' }
  | { kind: 'rolling'; days: number }

const DAY_MS = 86_400_000

/** The default window when a tenant sets a cap without choosing one. */
export const DEFAULT_BUDGET_WINDOW: BudgetWindow = { kind: 'calendar-month' }

/**
 * Start (ms since epoch) of the window containing `nowMs`. The metered gateway
 * sums ledger spend since this instant, so the cap "resets" at each boundary.
 *
 * - month / week boundaries are UTC calendar-aligned;
 * - rolling subtracts `days` (clamped ≥ 0) from `nowMs`.
 */
export function windowStartMs(window: BudgetWindow, nowMs: number): number {
  const d = new Date(nowMs)
  switch (window.kind) {
    case 'calendar-month':
      return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)
    case 'calendar-week': {
      // getUTCDay(): 0 = Sunday … 6 = Saturday. Shift so Monday = 0.
      const dow = (d.getUTCDay() + 6) % 7
      const midnight = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
      return midnight - dow * DAY_MS
    }
    case 'rolling':
      return nowMs - Math.max(0, window.days) * DAY_MS
  }
}

/**
 * The OpenRouter key `limit_reset` that best backstops `window`. OpenRouter only
 * offers fixed calendar resets, so a `rolling` window backstops to `monthly` (the
 * coarsest provider ceiling); the ledger window remains the precise control.
 */
export function keyResetFor(window: BudgetWindow): 'weekly' | 'monthly' {
  return window.kind === 'calendar-week' ? 'weekly' : 'monthly'
}

/** Narrow unknown JSON (e.g. a persisted record) to a {@link BudgetWindow}. */
export function isBudgetWindow(value: unknown): value is BudgetWindow {
  if (typeof value !== 'object' || value === null) return false
  const w = value as { kind?: unknown; days?: unknown }
  if (w.kind === 'calendar-month' || w.kind === 'calendar-week') return true
  return w.kind === 'rolling' && typeof w.days === 'number' && Number.isFinite(w.days) && w.days > 0
}
