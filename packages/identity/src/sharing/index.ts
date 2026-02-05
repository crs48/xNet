/**
 * @xnet/identity/sharing - UCAN-based sharing and permissions
 */

// Types
export type { SharePermission, ShareOptions, ShareToken, ShareData, Revocation } from './types'

// Create shares
export { createShareToken, buildCapabilities } from './create-share'

// Parse shares
export {
  parseShareLink,
  parseAndVerifyShareLink,
  verifyShareToken,
  type ParsedShare
} from './parse-share'

// Revocation
export { RevocationStore, createRevocation, computeTokenHash } from './revocation'
