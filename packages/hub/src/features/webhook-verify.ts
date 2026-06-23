/**
 * @xnetjs/hub — webhook signature verification strategies (exploration 0213).
 *
 * The inbound-webhook spine ({@link ./webhooks}) takes a `verify(rawBody,
 * headers, secret) => boolean`. Most providers converge on HMAC-SHA256 over the
 * raw body (optionally with a timestamp), so this module is a small library of
 * ready-made strategies — GitHub, Stripe, Slack-`v0`, and the Standard Webhooks
 * spec — so a new declarative webhook becomes a one-line `verify:` choice
 * instead of hand-rolled crypto.
 *
 * The hub runs on Node, so we use `node:crypto` (synchronous) — that keeps
 * `DeclarativeWebhook.verify` synchronous, matching the existing GitHub handler.
 * (Browser-bundled packages such as `@xnetjs/slack-compat` use Web Crypto
 * instead; that asymmetry is intentional and host-appropriate.)
 */

import { createHmac, timingSafeEqual } from 'node:crypto'

/** Default replay window: reject deliveries whose timestamp is older than this. */
export const DEFAULT_TOLERANCE_SECONDS = 300

/** Constant-time compare of two equal-length strings (utf8). false on mismatch. */
export function safeEqualStrings(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  return timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'))
}

function hmacHex(secret: string, message: string): string {
  return createHmac('sha256', secret).update(message).digest('hex')
}

function hmacBase64(secret: Buffer, message: string): string {
  return createHmac('sha256', secret).update(message).digest('base64')
}

/**
 * GitHub: `X-Hub-Signature-256: sha256=<hex>` over the raw body. Mirrors the
 * existing `verifyWebhookSignature` so both call sites agree.
 */
export function verifyGithubSignature(
  secret: string,
  rawBody: string,
  signatureHeader: string | undefined
): boolean {
  if (!secret || !signatureHeader?.startsWith('sha256=')) return false
  const provided = signatureHeader.slice('sha256='.length)
  const expected = hmacHex(secret, rawBody)
  return safeEqualStrings(provided, expected)
}

/**
 * Stripe: `Stripe-Signature: t=<ts>,v1=<hex>[,v1=<hex>...]`. The signed content
 * is `${t}.${rawBody}`. Any one matching `v1` passes (key rotation), and the
 * timestamp must be within the tolerance window (replay protection).
 */
export function verifyStripeSignature(options: {
  secret: string | undefined
  rawBody: string
  signatureHeader: string | undefined
  toleranceSeconds?: number
  nowSeconds?: number
}): boolean {
  const { secret, rawBody, signatureHeader } = options
  if (!secret || !signatureHeader) return false

  let timestamp: string | undefined
  const candidates: string[] = []
  for (const part of signatureHeader.split(',')) {
    const [key, value] = part.split('=', 2)
    if (key === 't') timestamp = value
    else if (key === 'v1' && value) candidates.push(value)
  }
  if (!timestamp || candidates.length === 0) return false

  const ts = Number(timestamp)
  if (!Number.isFinite(ts)) return false
  const now = options.nowSeconds ?? Math.floor(Date.now() / 1000)
  const tolerance = options.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS
  if (Math.abs(now - ts) > tolerance) return false

  const expected = hmacHex(secret, `${timestamp}.${rawBody}`)
  return candidates.some((candidate) => safeEqualStrings(candidate, expected))
}

/**
 * Standard Webhooks (standardwebhooks.com): symmetric `whsec_<base64>` secret,
 * signed content `${id}.${timestamp}.${rawBody}`, header a space-delimited list
 * of `v1,<base64>` signatures (multiple active keys for rotation). The
 * `webhook-timestamp` header gates the replay window.
 */
export function verifyStandardWebhooksSignature(options: {
  secret: string | undefined
  rawBody: string
  id: string | undefined
  timestamp: string | undefined
  signatureHeader: string | undefined
  toleranceSeconds?: number
  nowSeconds?: number
}): boolean {
  const { secret, rawBody, id, timestamp, signatureHeader } = options
  if (!secret || !id || !timestamp || !signatureHeader) return false

  const ts = Number(timestamp)
  if (!Number.isFinite(ts)) return false
  const now = options.nowSeconds ?? Math.floor(Date.now() / 1000)
  const tolerance = options.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS
  if (Math.abs(now - ts) > tolerance) return false

  const rawSecret = secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret
  const key = Buffer.from(rawSecret, 'base64')
  const expected = hmacBase64(key, `${id}.${timestamp}.${rawBody}`)

  // Header is a space-delimited list of `version,signature` pairs.
  return signatureHeader.split(' ').some((entry) => {
    const comma = entry.indexOf(',')
    const candidate = comma === -1 ? entry : entry.slice(comma + 1)
    return candidate.length > 0 && safeEqualStrings(candidate, expected)
  })
}

/**
 * Sentry: `Sentry-Hook-Signature: <hex>` — HMAC-SHA256 of the raw body with the
 * integration's client secret, no version prefix.
 */
export function verifySentrySignature(
  secret: string | undefined,
  rawBody: string,
  signatureHeader: string | undefined
): boolean {
  if (!secret || !signatureHeader) return false
  return safeEqualStrings(signatureHeader, hmacHex(secret, rawBody))
}

/**
 * PagerDuty v3: `X-PagerDuty-Signature: v1=<hex>[,v1=<hex>...]` — HMAC-SHA256 of
 * the raw body with the webhook's signing secret. Any candidate may match
 * (rotation).
 */
export function verifyPagerDutySignature(
  secret: string | undefined,
  rawBody: string,
  signatureHeader: string | undefined
): boolean {
  if (!secret || !signatureHeader) return false
  const expected = hmacHex(secret, rawBody)
  return signatureHeader.split(',').some((part) => {
    const [key, value] = part.split('=', 2)
    return key === 'v1' && value && safeEqualStrings(value, expected)
  })
}

/**
 * URL-token strategy: the path token *is* the credential (Slack/Discord-style
 * incoming webhooks). Constant-time compare against the configured secret.
 */
export function verifyUrlToken(provided: string | undefined, secret: string): boolean {
  if (!secret || !provided) return false
  return safeEqualStrings(provided, secret)
}
