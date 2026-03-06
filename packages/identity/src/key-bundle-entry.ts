/**
 * @xnetjs/identity/key-bundle - Stable key bundle entrypoint
 */

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
export type { HybridKeyBundle, CreateKeyBundleOptions } from './types'
export type { SerializedKeyBundle } from './key-bundle-storage'
export {
  serializeHybridKeyBundle,
  deserializeHybridKeyBundle,
  serializeKeyBundleToJSON,
  deserializeKeyBundleFromJSON,
  serializeKeyBundleToBinary,
  deserializeKeyBundleFromBinary
} from './key-bundle-storage'
