/**
 * @xnetjs/identity/sharing - UCAN-based sharing and permissions
 */

// Types
export type {
  SharePermission,
  ShareOptions,
  ShareToken,
  ShareData,
  ShareLinkDelegation,
  Revocation
} from './types'

// Create shares
export { createShareToken, buildCapabilities } from './create-share'

// Parse shares
export {
  parseShareLink,
  parseAndVerifyShareLink,
  verifyShareToken,
  type ParsedShare
} from './parse-share'

// Link-keypair delegation chains (B2 of exploration 0169)
export {
  createShareLinkKeypair,
  encodeLinkSecret,
  decodeLinkSecret,
  createLinkDelegation,
  claimLinkDelegation,
  verifyLinkClaim,
  type ShareLinkKeypair,
  type CreateLinkDelegationOptions,
  type ClaimLinkDelegationOptions,
  type VerifiedLinkClaim
} from './link-delegation'

// Revocation
export {
  RevocationStore,
  createRevocation,
  computeTokenHash,
  serializeRevocation,
  deserializeRevocation,
  type RevocationPersistence,
  type SerializedRevocation
} from './revocation'
