/**
 * @xnetjs/entitlements — Signed entitlement tokens.
 *
 * The control plane signs a tenant's resolved entitlements into a compact token
 * and injects it into the hub as the `HUB_PLAN` env var. The hub verifies it with
 * a shared secret and enforces the limits — so a hub can be told "you are a
 * `personal` plan with 50 GiB" without a runtime call back to the control plane.
 *
 * Token format:  base64url(JSON payload) + "." + base64url(HMAC-SHA256)
 * This is intentionally NOT a full JWT — no external dependency, no alg confusion,
 * one fixed algorithm. The signing secret lives only in the private ops repo.
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import { asPlanId, resolveEntitlements, type PlanEntitlements } from './plans'

const toBase64Url = (input: Buffer | string): string => Buffer.from(input).toString('base64url')

const fromBase64Url = (input: string): Buffer => Buffer.from(input, 'base64url')

const sign = (payload: string, secret: string): string =>
  toBase64Url(createHmac('sha256', secret).update(payload).digest())

/**
 * Serialize + sign entitlements into a `HUB_PLAN` token.
 */
export function signEntitlements(entitlements: PlanEntitlements, secret: string): string {
  if (!secret) throw new Error('A signing secret is required')
  const payload = toBase64Url(JSON.stringify(entitlements))
  return `${payload}.${sign(payload, secret)}`
}

/**
 * Verify a `HUB_PLAN` token and return its entitlements. Throws if the signature
 * is missing/invalid or the payload is malformed. Uses a constant-time compare.
 */
export function verifyEntitlements(token: string, secret: string): PlanEntitlements {
  if (!secret) throw new Error('A signing secret is required')
  const dot = token.indexOf('.')
  if (dot <= 0 || dot === token.length - 1) {
    throw new Error('Malformed entitlement token')
  }
  const payload = token.slice(0, dot)
  const provided = fromBase64Url(token.slice(dot + 1))
  const expected = fromBase64Url(sign(payload, secret))
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    throw new Error('Invalid entitlement token signature')
  }
  const parsed = JSON.parse(fromBase64Url(payload).toString('utf8')) as PlanEntitlements
  // Re-resolve through the catalog so a tampered-but-unsigned-path can't widen
  // limits beyond a known plan shape; the signed overrides are preserved.
  asPlanId(parsed.plan)
  return parsed
}

/**
 * Resolve a hub's entitlements from the environment.
 *
 * - If `HUB_PLAN` is present, verify and return it (requires `XNET_PLAN_SECRET`).
 * - Otherwise return the provided `fallback` (default: the `demo` plan), so a
 *   self-hosted hub with no cloud config keeps working with sane limits.
 */
export function entitlementsFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  fallback: PlanEntitlements = resolveEntitlements('demo')
): PlanEntitlements {
  const token = env.HUB_PLAN
  if (!token) return fallback
  const secret = env.XNET_PLAN_SECRET
  if (!secret) {
    throw new Error('HUB_PLAN is set but XNET_PLAN_SECRET is missing')
  }
  return verifyEntitlements(token, secret)
}
