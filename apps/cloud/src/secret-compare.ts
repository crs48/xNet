/**
 * Constant-time secret comparison (exploration 0433, decision 11).
 *
 * `===` on a secret is a timing oracle: it returns on the first differing byte,
 * so response time leaks how long a shared prefix an attacker has guessed. The
 * practical risk over the internet is low, but the fix costs nothing and the
 * secret this guarded reached `/internal/account/recover`.
 */

import { timingSafeEqual } from 'node:crypto'

/**
 * Compare two secrets without leaking their contents through timing.
 *
 * Length is compared first and NOT in constant time — `timingSafeEqual` throws on
 * unequal lengths, and a secret's length is not the part worth protecting.
 * `undefined`/empty candidates are rejected outright so a missing header can never
 * match a missing config.
 */
export function timingSafeEqualStr(
  candidate: string | undefined | null,
  expected: string | undefined | null
): boolean {
  if (!candidate || !expected) return false
  const a = Buffer.from(candidate, 'utf8')
  const b = Buffer.from(expected, 'utf8')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
