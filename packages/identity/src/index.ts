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

// Passkey storage
export { type PasskeyStorage, BrowserPasskeyStorage, MemoryPasskeyStorage } from './passkey'
