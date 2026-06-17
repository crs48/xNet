/**
 * @xnetjs/licenses — Ed25519-signed, DID-bound plugin license tokens.
 *
 * The offline-verifiable entitlement spine for the paid plugin marketplace
 * (exploration 0196). The hub mints a token on purchase with the platform
 * private key; the plugin runtime verifies it offline with the embedded public
 * key. MIT + a single `@xnetjs/crypto` dependency, so it bundles cleanly into
 * both the hub and the client.
 */

export type { PluginLicenseClaims, LicenseFailureReason, LicenseVerifyResult } from './token'
export { signPluginLicense, verifyPluginLicense } from './token'

export type { LicenseKeypairHex } from './keys'
export {
  generateLicenseKeypair,
  publicKeyFromHex,
  privateKeyFromHex,
  publicKeyHexFromPrivateHex
} from './keys'

export type {
  MintLicenseInput,
  LicenseCheckReason,
  LicenseDecision,
  LicenseRequirement
} from './mint'
export {
  mintPluginLicense,
  checkLicenseFor,
  PERPETUAL_EXPIRY_MS,
  DEFAULT_GRACE_SEC,
  DEFAULT_SUBSCRIPTION_TTL_MS
} from './mint'
