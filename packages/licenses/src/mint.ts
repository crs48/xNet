/**
 * @xnetjs/licenses — minting + requirement checking.
 *
 * `mintPluginLicense` is what a Stripe webhook (or a manual grant) calls after a
 * successful purchase; `checkLicenseFor` is what the install gate calls to
 * decide whether a paid plugin may run for a given buyer.
 */

import {
  signPluginLicense,
  verifyPluginLicense,
  type LicenseFailureReason,
  type PluginLicenseClaims
} from './token'

/** 2100-01-01 — a one-time license never expires in practice. */
export const PERPETUAL_EXPIRY_MS = 4102444800000
/** Default connectivity slack past expiry: 7 days. */
export const DEFAULT_GRACE_SEC = 7 * 24 * 60 * 60
/** Default subscription token lifetime when no period end is supplied: 31 days. */
export const DEFAULT_SUBSCRIPTION_TTL_MS = 31 * 24 * 60 * 60 * 1000

export interface MintLicenseInput {
  pluginId: string
  pluginVersion?: string
  buyerDid: string
  mode: 'one-time' | 'subscription'
  /** Issuance time, epoch ms (injected for determinism). */
  now: number
  /** For subscriptions: when the current paid period ends (epoch ms). */
  periodEnd?: number
  /** Override the connectivity grace (seconds). */
  graceSec?: number
  /** Signing-key id (for rotation). */
  kid?: string
}

/**
 * Build + sign a license token for a completed purchase. One-time purchases get a
 * perpetual expiry; subscriptions expire at `periodEnd` (or `now + 31d`) and are
 * re-minted on each successful renewal webhook.
 */
export function mintPluginLicense(input: MintLicenseInput, privateKey: Uint8Array): string {
  const expiresAt =
    input.mode === 'one-time'
      ? PERPETUAL_EXPIRY_MS
      : (input.periodEnd ?? input.now + DEFAULT_SUBSCRIPTION_TTL_MS)
  const claims: PluginLicenseClaims = {
    v: 1,
    pluginId: input.pluginId,
    ...(input.pluginVersion ? { pluginVersion: input.pluginVersion } : {}),
    buyerDid: input.buyerDid,
    mode: input.mode,
    issuedAt: input.now,
    expiresAt,
    graceSec: input.graceSec ?? DEFAULT_GRACE_SEC,
    ...(input.kid ? { kid: input.kid } : {})
  }
  return signPluginLicense(claims, privateKey)
}

/** Why a token is not acceptable for a specific plugin + buyer. */
export type LicenseCheckReason =
  | LicenseFailureReason
  | 'wrong-plugin'
  | 'wrong-buyer'
  | 'no-license'

export type LicenseDecision =
  | { ok: true; claims: PluginLicenseClaims }
  | { ok: false; reason: LicenseCheckReason }

export interface LicenseRequirement {
  pluginId: string
  buyerDid: string
  /** The platform public key bytes (see `publicKeyFromHex`). */
  publicKey: Uint8Array
  /** epoch ms. */
  now: number
}

/**
 * Verify a token AND confirm it unlocks this plugin for this buyer. Returns a
 * typed decision the install gate can surface ("Buy" vs "Restore purchase").
 */
export function checkLicenseFor(
  token: string | undefined | null,
  req: LicenseRequirement
): LicenseDecision {
  if (!token) return { ok: false, reason: 'no-license' }
  const verified = verifyPluginLicense(token, req.publicKey, req.now)
  if (!verified.ok) return verified
  if (verified.claims.pluginId !== req.pluginId) return { ok: false, reason: 'wrong-plugin' }
  if (verified.claims.buyerDid !== req.buyerDid) return { ok: false, reason: 'wrong-buyer' }
  return verified
}
