/**
 * xNet hub — billing read-only mode (exploration 0418).
 *
 * The gentlest rung of the non-payment lifecycle: when a managed tenant's grace
 * window lapses, the control plane re-issues its signed entitlement with
 * `writesEnabled: false` and the hub stops accepting *new* data. Everything that
 * lets the customer read, export, and pay keeps working — the point is to stop
 * the meter, not to hold data hostage.
 *
 * Two rules, both deliberate:
 *
 *  1. **Block by method, allow by name.** Mutating verbs are refused; a small
 *     allowlist covers the POSTs that are reads in disguise (`/query`, `/search`)
 *     and the routes a customer needs in order to *stop being* read-only
 *     (billing, auth, export). A blanket "POST = write" rule would lock a paying
 *     customer out of the checkout page that takes their money.
 *  2. **Fail open on absence.** Only an explicit `writesEnabled: false` blocks
 *     anything — see `resolveWritesEnabled` in `config.ts`. A self-hosted hub has
 *     no entitlement token and is never affected.
 */

import type { Context, MiddlewareHandler, Next } from 'hono'

/** HTTP verbs that mutate. Everything else passes through untouched. */
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

/**
 * Path prefixes that stay writable in read-only mode.
 *
 * Each entry is here because blocking it would trap the customer rather than
 * meter them:
 *
 *  - `/billing` — checkout and the customer portal. This is the *exit* from
 *    read-only; blocking it would be self-defeating.
 *  - `/auth`, `/challenge` — signing in to reach any of the above.
 *  - `/export`, `/backup/export` — the Charter §6 vanish test. A customer must
 *    be able to take their data out of a hub they have stopped paying for.
 *  - `/query`, `/search` — POST-shaped reads.
 *  - `/health`, `/ready` — liveness, used by the restore drill and the fleet probe.
 */
const ALWAYS_WRITABLE: readonly string[] = [
  '/auth',
  '/backup/export',
  '/billing',
  '/challenge',
  '/export',
  '/health',
  '/query',
  '/ready',
  '/search'
]

/** Is this request exempt from the read-only block? */
export function isAlwaysWritable(path: string): boolean {
  return ALWAYS_WRITABLE.some((p) => path === p || path.startsWith(`${p}/`))
}

/** Would this request be refused by a hub in billing read-only mode? */
export function isBlockedWhenReadOnly(method: string, path: string): boolean {
  return MUTATING.has(method.toUpperCase()) && !isAlwaysWritable(path)
}

/** The body every blocked request gets — a typed code the app can branch on. */
export const READ_ONLY_BODY = {
  error:
    'This hub is read-only because a payment did not go through. ' +
    'Your data is safe and fully readable — update your billing details to restore writes.',
  code: 'billing_read_only'
} as const

/**
 * Hono middleware enforcing read-only mode. `writesEnabled` is read per-request
 * (not captured once at boot) so a re-issued entitlement takes effect on the
 * next request rather than the next deploy.
 *
 * Returns `507 Insufficient Storage` to match the hub's existing "we cannot
 * accept this write" responses (quota, disk-full), so clients that already
 * handle 507 degrade correctly; the `code` field is what distinguishes *why*.
 */
export function readOnlyGuard(writesEnabled: () => boolean): MiddlewareHandler {
  return async (c: Context, next: Next) => {
    if (!writesEnabled() && isBlockedWhenReadOnly(c.req.method, c.req.path)) {
      return c.json(READ_ONLY_BODY, 507)
    }
    return next()
  }
}
