/**
 * @xnetjs/slack-compat — Slack request signing (exploration 0198).
 *
 * Slack signs every request to your app with the app's signing secret:
 * `v0=HMAC_SHA256(signingSecret, "v0:" + timestamp + ":" + rawBody)`, carried in
 * `x-slack-signature` with the timestamp in `x-slack-request-timestamp`. We use
 * the same scheme so an integration written against Slack verifies unchanged,
 * and we verify *inbound* deliveries the same way the GitHub webhook does
 * (`packages/hub/src/services/github-integration.ts`).
 *
 * Implemented over the **Web Crypto API** (`crypto.subtle`), not `node:crypto`,
 * so the package stays isomorphic — it's pulled into the browser/renderer bundle
 * via the plugins connector, where a `node:crypto` import would break the build.
 * `crypto.subtle` is a global in Node 20+ and every browser. The HMAC is async
 * as a result.
 */

/** Default replay window: reject deliveries whose timestamp is >5 minutes off. */
export const DEFAULT_TOLERANCE_SECONDS = 300

/** HMAC-SHA256 of `message` under `secret`, hex-encoded (Web Crypto). */
async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message))
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

/** Compute the `v0=...` signature for a request body (used to verify and to sign). */
export async function signSlackRequest(options: {
  signingSecret: string
  timestamp: string | number
  rawBody: string
}): Promise<string> {
  const digest = await hmacSha256Hex(
    options.signingSecret,
    `v0:${options.timestamp}:${options.rawBody}`
  )
  return `v0=${digest}`
}

/** Constant-time string compare that tolerates length mismatch without leaking it. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/**
 * Verify an inbound Slack-signed request. Returns `false` (never throws) on a
 * missing/blank secret, missing headers, a stale timestamp (replay), or a
 * signature mismatch.
 */
export async function verifySlackSignature(options: {
  signingSecret: string | undefined
  timestamp: string | undefined
  signature: string | undefined
  rawBody: string
  /** Replay tolerance in seconds (default {@link DEFAULT_TOLERANCE_SECONDS}). */
  toleranceSeconds?: number
  /** Current time in seconds since epoch (injectable for tests). */
  nowSeconds?: number
}): Promise<boolean> {
  const { signingSecret, timestamp, signature, rawBody } = options
  if (!signingSecret || !timestamp || !signature) return false

  const ts = Number(timestamp)
  if (!Number.isFinite(ts)) return false
  const now = options.nowSeconds ?? Math.floor(Date.now() / 1000)
  const tolerance = options.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS
  if (Math.abs(now - ts) > tolerance) return false

  const expected = await signSlackRequest({ signingSecret, timestamp, rawBody })
  return safeEqual(expected, signature)
}
