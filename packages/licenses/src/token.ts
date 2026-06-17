/**
 * @xnetjs/licenses — the PluginLicense token.
 *
 * A paid plugin is unlocked by a compact, **Ed25519-signed** token bound to the
 * buyer's **DID** (not a device): the hub holds the platform private key and
 * mints a token on purchase; the plugin runtime embeds the public key and
 * verifies it **fully offline**. This mirrors `@xnetjs/entitlements`'s
 * sign/verify shape, but is intentionally **asymmetric**: the verifier (a
 * potentially-adversarial client) must not hold a secret it could use to forge a
 * license. HMAC is right for hub↔hub (`HUB_PLAN`); it is wrong here.
 *
 * Token format:  base64url(JSON claims) + "." + base64url(Ed25519 signature)
 * The signature is computed over the *base64url payload string bytes*, so a
 * verifier never has to canonicalize JSON.
 */

import { sign, verify, bytesToBase64url, base64urlToBytes } from '@xnetjs/crypto'

/** The claims carried by a license token. Version `1`. */
export interface PluginLicenseClaims {
  /** Token format version. */
  v: 1
  /** Reverse-domain plugin id this license unlocks. */
  pluginId: string
  /** Plugin version (or range) the purchase covers; informational. */
  pluginVersion?: string
  /** The buyer's DID. A license is bound to an identity, not a device, so it is
   *  portable across all of the buyer's devices and revocable hub-side. */
  buyerDid: string
  /** Whether this was a one-time purchase or a subscription. */
  mode: 'one-time' | 'subscription'
  /** When the license was issued (epoch ms). */
  issuedAt: number
  /** When the license expires (epoch ms). One-time licenses use a far-future value. */
  expiresAt: number
  /** Seconds of slack past `expiresAt` before the gate refuses (connectivity grace). */
  graceSec: number
  /** Signing-key id, so the platform can rotate keys without invalidating old tokens. */
  kid?: string
}

/** Why a token failed verification. */
export type LicenseFailureReason = 'malformed' | 'bad-signature' | 'expired' | 'unsupported-version'

export type LicenseVerifyResult =
  | { ok: true; claims: PluginLicenseClaims }
  | { ok: false; reason: LicenseFailureReason }

const encoder = new TextEncoder()
const decoder = new TextDecoder()

function encodeClaims(claims: PluginLicenseClaims): string {
  return bytesToBase64url(encoder.encode(JSON.stringify(claims)))
}

/**
 * Mint a signed license token from explicit claims. **Hub-side only** — needs the
 * platform Ed25519 private key. Most callers want {@link mintPluginLicense}.
 */
export function signPluginLicense(claims: PluginLicenseClaims, privateKey: Uint8Array): string {
  const payload = encodeClaims(claims)
  const signature = sign(encoder.encode(payload), privateKey)
  return `${payload}.${bytesToBase64url(signature)}`
}

function isClaims(value: unknown): value is PluginLicenseClaims {
  if (!value || typeof value !== 'object') return false
  const c = value as Record<string, unknown>
  return (
    typeof c.pluginId === 'string' &&
    typeof c.buyerDid === 'string' &&
    (c.mode === 'one-time' || c.mode === 'subscription') &&
    typeof c.issuedAt === 'number' &&
    typeof c.expiresAt === 'number' &&
    typeof c.graceSec === 'number'
  )
}

/**
 * Verify a license token against the platform public key, fully offline. Returns
 * the claims on success, or a typed failure reason. Does **not** check that the
 * token is for a particular plugin/buyer — see {@link checkLicenseFor}.
 *
 * @param now epoch ms (injected so it is deterministic + resume-safe).
 */
export function verifyPluginLicense(
  token: string,
  publicKey: Uint8Array,
  now: number
): LicenseVerifyResult {
  const dot = token.indexOf('.')
  if (dot <= 0 || dot === token.length - 1) return { ok: false, reason: 'malformed' }
  const payload = token.slice(0, dot)
  const sigPart = token.slice(dot + 1)

  let signature: Uint8Array
  try {
    signature = base64urlToBytes(sigPart)
  } catch {
    return { ok: false, reason: 'malformed' }
  }
  if (!verify(encoder.encode(payload), signature, publicKey)) {
    return { ok: false, reason: 'bad-signature' }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(decoder.decode(base64urlToBytes(payload)))
  } catch {
    return { ok: false, reason: 'malformed' }
  }
  if (!isClaims(parsed)) return { ok: false, reason: 'malformed' }
  if (parsed.v !== 1) return { ok: false, reason: 'unsupported-version' }
  if (now > parsed.expiresAt + parsed.graceSec * 1000) return { ok: false, reason: 'expired' }
  return { ok: true, claims: parsed }
}
