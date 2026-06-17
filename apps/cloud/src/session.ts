/**
 * xNet Cloud — control-plane session sealing.
 *
 * After WorkOS AuthKit returns a `code`, the callback exchanges it for a billing
 * user and seals a small session into an httpOnly cookie. We sign (HMAC-SHA256)
 * rather than pull in a crypto-cookie dependency — the payload (a WorkOS user id)
 * is not secret, only tamper-proof, and the cookie is httpOnly + SameSite=Lax so
 * the dashboard can read it on same-origin requests (exploration 0192).
 *
 * Pure + injectable-clock so it can be unit-tested with `app.request(...)`.
 */

import { createHmac, timingSafeEqual } from 'node:crypto'

/** What we remember about a signed-in billing identity. */
export interface SessionData {
  /** WorkOS user id — the custodial billing identity. */
  billingUserId: string
  email?: string
  /** Issue time (ms); used to expire the session. */
  issuedAtMs: number
}

/** Cookie name the dashboard reads on every authenticated request. */
export const SESSION_COOKIE = 'xnet_cloud_session'

const DEFAULT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

/** Seal a session into a signed `<payload>.<sig>` token. */
export function sealSession(secret: string, data: SessionData): string {
  const payload = Buffer.from(JSON.stringify(data)).toString('base64url')
  const sig = createHmac('sha256', secret).update(payload).digest('base64url')
  return `${payload}.${sig}`
}

/**
 * Verify + decode a sealed session. Returns null on a bad signature, malformed
 * payload, or an expired token (constant-time signature comparison).
 */
export function readSession(
  secret: string,
  token: string | undefined,
  opts: { maxAgeMs?: number; nowMs?: number } = {}
): SessionData | null {
  if (!token) return null
  const dot = token.lastIndexOf('.')
  if (dot <= 0) return null
  const payload = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  const expected = createHmac('sha256', secret).update(payload).digest('base64url')
  const got = Buffer.from(sig)
  const want = Buffer.from(expected)
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null

  let data: SessionData
  try {
    data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as SessionData
  } catch {
    return null
  }
  if (!data || typeof data.billingUserId !== 'string' || typeof data.issuedAtMs !== 'number') {
    return null
  }
  const maxAge = opts.maxAgeMs ?? DEFAULT_MAX_AGE_MS
  const now = opts.nowMs ?? Date.now()
  if (now - data.issuedAtMs > maxAge) return null
  return data
}
