/**
 * xNet Cloud — parse the dashboard "Managed AI spend cap" form (exploration 0244).
 *
 * Pure + I/O-free so it is unit-tested without a request. Turns the posted fields
 * (`cap`, `window`, `rollingDays`) into the argument {@link ControlPlane.setAiBudget}
 * expects: a `{ capUsd, window }` budget, `undefined` to clear it, or a typed error.
 */

import type { BudgetWindow } from '@xnetjs/cloud'

export type AiBudgetFormResult =
  | { ok: true; budget: { capUsd: number; window: BudgetWindow } | undefined }
  | { ok: false; error: 'bad_cap' | 'bad_window' | 'bad_days' }

const WINDOW_KINDS = new Set(['calendar-month', 'calendar-week', 'rolling'])

/** Parse the posted form body (Hono `parseBody` shape) into a setAiBudget arg. */
export function parseAiBudgetForm(body: Record<string, unknown>): AiBudgetFormResult {
  const capRaw = String(body.cap ?? '').trim()
  // Empty or an explicit "none" clears the cap (back to the full plan budget).
  if (capRaw === '' || capRaw.toLowerCase() === 'none') return { ok: true, budget: undefined }

  const capUsd = Number(capRaw)
  if (!Number.isFinite(capUsd) || capUsd < 0) return { ok: false, error: 'bad_cap' }

  const kind = String(body.window ?? 'calendar-month')
  if (!WINDOW_KINDS.has(kind)) return { ok: false, error: 'bad_window' }

  if (kind === 'rolling') {
    const days = Number(String(body.rollingDays ?? ''))
    if (!Number.isFinite(days) || days <= 0) return { ok: false, error: 'bad_days' }
    return { ok: true, budget: { capUsd, window: { kind: 'rolling', days: Math.floor(days) } } }
  }
  return { ok: true, budget: { capUsd, window: { kind } as BudgetWindow } }
}
