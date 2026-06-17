/**
 * @xnetjs/slack-compat — Slack request signing (exploration 0198).
 *
 * Slack signs every request to your app with the app's signing secret:
 * `v0=HMAC_SHA256(signingSecret, "v0:" + timestamp + ":" + rawBody)`, carried in
 * `x-slack-signature` with the timestamp in `x-slack-request-timestamp`. We use
 * the same scheme so an integration written against Slack verifies unchanged,
 * and we verify *inbound* deliveries the same way the GitHub webhook does
 * (`packages/hub/src/services/github-integration.ts`).
 */

import { createHmac, timingSafeEqual } from 'node:crypto'

/** Default replay window: reject deliveries whose timestamp is >5 minutes off. */
export const DEFAULT_TOLERANCE_SECONDS = 300

/** Compute the `v0=...` signature for a request body (used to verify and to sign). */
export function signSlackRequest(options: {
  signingSecret: string
  timestamp: string | number
  rawBody: string
}): string {
  const base = `v0:${options.timestamp}:${options.rawBody}`
  const digest = createHmac('sha256', options.signingSecret).update(base).digest('hex')
  return `v0=${digest}`
}

/** Constant-time string compare that tolerates length mismatch without throwing. */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

/**
 * Verify an inbound Slack-signed request. Returns `false` (never throws) on a
 * missing/blank secret, missing headers, a stale timestamp (replay), or a
 * signature mismatch.
 */
export function verifySlackSignature(options: {
  signingSecret: string | undefined
  timestamp: string | undefined
  signature: string | undefined
  rawBody: string
  /** Replay tolerance in seconds (default {@link DEFAULT_TOLERANCE_SECONDS}). */
  toleranceSeconds?: number
  /** Current time in seconds since epoch (injectable for tests). */
  nowSeconds?: number
}): boolean {
  const { signingSecret, timestamp, signature, rawBody } = options
  if (!signingSecret || !timestamp || !signature) return false

  const ts = Number(timestamp)
  if (!Number.isFinite(ts)) return false
  const now = options.nowSeconds ?? Math.floor(Date.now() / 1000)
  const tolerance = options.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS
  if (Math.abs(now - ts) > tolerance) return false

  const expected = signSlackRequest({ signingSecret, timestamp, rawBody })
  return safeEqual(expected, signature)
}
