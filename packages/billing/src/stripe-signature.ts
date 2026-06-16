/**
 * @xnetjs/billing — Stripe webhook signature verification.
 *
 * Pure local HMAC, no SDK, no network — same spirit as `@xnetjs/entitlements`'s
 * token HMAC. Stripe signs `${timestamp}.${rawBody}` with the endpoint's
 * `whsec_…` secret and sends `Stripe-Signature: t=<ts>,v1=<hex>[,v1=<hex>…]`.
 * We recompute the HMAC and constant-time compare against each `v1` candidate.
 */

import { createHmac, timingSafeEqual } from 'node:crypto'

export interface StripeSignatureOptions {
  /** Reject events older than this many seconds (0 disables the check). Default 300. */
  toleranceSec?: number
  /** Injectable clock (unix seconds) for deterministic tests. */
  nowSec?: number
}

/**
 * Verify a Stripe webhook signature against the raw body. Returns `true` only when
 * a `v1` signature matches and (if a tolerance is set) the timestamp is fresh.
 */
export function verifyStripeSignature(
  rawBody: string,
  signatureHeader: string | undefined,
  secret: string,
  options: StripeSignatureOptions = {}
): boolean {
  if (!signatureHeader || !secret) return false

  let timestamp = ''
  const v1: string[] = []
  for (const part of signatureHeader.split(',')) {
    const eq = part.indexOf('=')
    if (eq <= 0) continue
    const key = part.slice(0, eq).trim()
    const value = part.slice(eq + 1).trim()
    if (key === 't') timestamp = value
    else if (key === 'v1') v1.push(value)
  }
  if (!timestamp || v1.length === 0) return false

  const tolerance = options.toleranceSec ?? 300
  if (tolerance > 0) {
    const now = options.nowSec ?? Math.floor(Date.now() / 1000)
    const ts = Number(timestamp)
    if (!Number.isFinite(ts) || Math.abs(now - ts) > tolerance) return false
  }

  const expected = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest()
  return v1.some((candidate) => {
    let provided: Buffer
    try {
      provided = Buffer.from(candidate, 'hex')
    } catch {
      return false
    }
    return provided.length === expected.length && timingSafeEqual(provided, expected)
  })
}

/**
 * Build a `Stripe-Signature` header for a payload. Used by tests and the fake
 * provider; mirrors what Stripe's SDK `generateTestHeaderString` produces.
 */
export function signStripePayload(rawBody: string, secret: string, timestampSec: number): string {
  const sig = createHmac('sha256', secret).update(`${timestampSec}.${rawBody}`).digest('hex')
  return `t=${timestampSec},v1=${sig}`
}
