/**
 * @xnet/identity - DID:key identity, UCAN authorization, key management
 */

// Types
export type { Identity, KeyBundle, StoredKey, UCANCapability, UCANToken } from './types'

// DID operations
export { createDID, parseDID, generateIdentity, identityFromPrivateKey, isValidDID } from './did'

// Key management
export {
  deriveKeyBundle,
  generateKeyBundle,
  serializeKeyBundle,
  deserializeKeyBundle
} from './keys'

// UCAN tokens
export {
  createUCAN,
  verifyUCAN,
  hasCapability,
  getCapabilities,
  isExpired,
  type CreateUCANOptions,
  type VerifyResult
} from './ucan'

// Legacy passkey storage (deprecated — use @xnet/identity/passkey instead)
export { type PasskeyStorage, BrowserPasskeyStorage, MemoryPasskeyStorage } from './passkey'

// Passkey authentication (WebAuthn + PRF)
export {
  createIdentityManager,
  detectPasskeySupport,
  createPasskeyIdentity,
  unlockPasskeyIdentity,
  createFallbackIdentity,
  unlockFallbackIdentity,
  getStoredIdentity,
  storeIdentity,
  clearStoredIdentity,
  deriveKeySeed,
  type IdentityManager,
  type PasskeyIdentity,
  type PasskeyUnlockResult,
  type PasskeyCreateOptions,
  type PasskeySupport,
  type FallbackStorage,
  type StoredPasskeyRecord
} from './passkey/index'
