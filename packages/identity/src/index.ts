/**
 * @xnet/identity - DID:key identity, UCAN authorization, key management
 */

// Types
export type {
  DID,
  Identity,
  KeyBundle,
  HybridKeyBundle,
  CreateKeyBundleOptions,
  StoredKey,
  UCANCapability,
  UCANToken
} from './types'

// DID operations
export { createDID, parseDID, generateIdentity, identityFromPrivateKey, isValidDID } from './did'

// Key management (legacy - use key-bundle.ts for new code)
export {
  deriveKeyBundle,
  generateKeyBundle,
  serializeKeyBundle,
  deserializeKeyBundle
} from './keys'

// Hybrid key bundle (new)
export {
  createKeyBundle,
  createKeyBundleWithAttestation,
  signWithBundle,
  verifyWithBundle,
  bundleSecurityLevel,
  bundleCanSignAt,
  bundleSize,
  extractPublicKeys,
  bundlesMatch
} from './key-bundle'

// Key bundle serialization (new)
export type { SerializedKeyBundle } from './key-bundle-storage'
export {
  serializeHybridKeyBundle,
  deserializeHybridKeyBundle,
  serializeKeyBundleToJSON,
  deserializeKeyBundleFromJSON,
  serializeKeyBundleToBinary,
  deserializeKeyBundleFromBinary
} from './key-bundle-storage'

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
  discoverExistingPasskey,
  unlockDiscoveredPasskey,
  isTestBypassEnabled,
  createTestIdentity,
  createTestIdentityManager,
  type IdentityManager,
  type DiscoveredPasskey,
  type PasskeyIdentity,
  type PasskeyUnlockResult,
  type PasskeyCreateOptions,
  type PasskeySupport,
  type FallbackStorage,
  type StoredPasskeyRecord
} from './passkey/index'

// Sharing (UCAN-based)
export {
  createShareToken,
  buildCapabilities,
  parseShareLink,
  verifyShareToken,
  RevocationStore,
  createRevocation,
  computeTokenHash,
  type SharePermission,
  type ShareOptions,
  type ShareToken,
  type ShareData,
  type Revocation,
  type ParsedShare
} from './sharing/index'

// PQ Key Attestation
export type {
  PQAlgorithm,
  PQKeyAttestation,
  PQKeyAttestationWire,
  AttestationVerificationResult
} from './pq-attestation'
export {
  createPQKeyAttestation,
  verifyPQKeyAttestation,
  serializeAttestation,
  deserializeAttestation
} from './pq-attestation'

// PQ Key Registry
export type { PQKeyRegistry } from './pq-registry'
export { MemoryPQKeyRegistry, createPQKeyRegistry } from './pq-registry'
