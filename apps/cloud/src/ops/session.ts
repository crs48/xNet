/**
 * xNet Cloud — the operator session (exploration 0433, decision 4).
 *
 * A **separate sealed cookie** from the tenant session, deliberately. Sharing one
 * would mean a tenant session could be mistaken for an operator session by any
 * future code path that forgot to re-check the role — and the two have opposite
 * blast radii. Distinct names make that mistake impossible rather than unlikely.
 *
 * Authorisation is the WorkOS organisation role, read from the access token's
 * claims. The claim is verified once at sign-in and sealed into this cookie, so
 * the request path never calls WorkOS: an operator console that cannot
 * authenticate during a WorkOS outage is an operator console that cannot help
 * during an incident.
 */

import { hasOperatorRole, OPERATOR_COOKIE, type OperatorIdentity } from './operator'
import { sealSession, readSession, type SessionData } from '../session'

export { OPERATOR_COOKIE }

/** What we seal: the tenant session shape plus the resolved operator facts. */
interface OperatorSessionData extends SessionData {
  /** Bound signing key at sign-in time, if the operator has completed a claim. */
  operatorDid?: string
}

/** Operator sessions are short: 12 hours, not the tenant session's 7 days. */
export const OPERATOR_MAX_AGE_MS = 12 * 60 * 60 * 1000

/** Seal an operator session cookie value. */
export function sealOperatorSession(
  secret: string,
  data: { workosUserId: string; email?: string; did?: string; issuedAtMs: number }
): string {
  const payload: OperatorSessionData = {
    billingUserId: data.workosUserId,
    issuedAtMs: data.issuedAtMs,
    ...(data.email ? { email: data.email } : {}),
    ...(data.did ? { operatorDid: data.did } : {})
  }
  return sealSession(secret, payload)
}

/** Read and verify an operator session cookie, or null. */
export function readOperatorSession(
  secret: string,
  cookie: string | undefined,
  opts: { nowMs: number }
): OperatorIdentity | null {
  const data = readSession(secret, cookie, {
    nowMs: opts.nowMs,
    maxAgeMs: OPERATOR_MAX_AGE_MS
  }) as OperatorSessionData | null
  if (!data) return null
  return {
    workosUserId: data.billingUserId,
    ...(data.email ? { email: data.email } : {}),
    ...(data.operatorDid ? { did: data.operatorDid } : {})
  }
}

/**
 * Decode the claims of a WorkOS access token WITHOUT verifying its signature.
 *
 * Safe only because of where it is called: immediately after the OAuth code
 * exchange, on a token this server just received over TLS directly from WorkOS.
 * It is NOT a request-path authenticator — the sealed cookie is. Calling this on
 * an attacker-supplied token would authorise anyone who can base64 a JSON object.
 */
export function claimsFromAccessToken(accessToken: string): Record<string, unknown> | null {
  const parts = accessToken.split('.')
  if (parts.length !== 3) return null
  try {
    const json = Buffer.from(parts[1], 'base64url').toString('utf8')
    const parsed: unknown = JSON.parse(json)
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/** Whether a freshly-exchanged WorkOS access token carries the operator role. */
export function tokenGrantsOperator(accessToken: string): boolean {
  return hasOperatorRole(claimsFromAccessToken(accessToken))
}
