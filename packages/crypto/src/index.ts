/**
 * @xnet/crypto - Encryption, signing, and hashing primitives
 */

// Hashing and key derivation
export { hash, hashHex, hashBase64, hkdf, type HashAlgorithm } from './hashing'

// Symmetric encryption
export {
  generateKey,
  encrypt,
  decrypt,
  encryptWithNonce,
  decryptWithNonce,
  KEY_SIZE,
  NONCE_SIZE,
  TAG_SIZE,
  type EncryptedData
} from './symmetric'

// Key exchange
export {
  generateKeyPair,
  deriveSharedSecret,
  deriveSharedSecretWithContext,
  getPublicKeyFromPrivate,
  type KeyPair
} from './asymmetric'

// Signing
export {
  generateSigningKeyPair,
  sign,
  verify,
  getSigningPublicKeyFromPrivate,
  type SigningKeyPair
} from './signing'

// Random
export { randomBytes } from './random'

// Utilities
export {
  toHex,
  fromHex,
  toBase64,
  fromBase64,
  bytesToHex,
  hexToBytes,
  bytesToBase64,
  base64ToBytes,
  bytesToBase64url,
  base64urlToBytes,
  constantTimeEqual,
  concatBytes
} from './utils'

// ─── Multi-Level Cryptography ────────────────────────────────────

// Security levels
export type { SecurityLevel, SecurityLevelConfig } from './security-level'
export {
  SECURITY_LEVELS,
  DEFAULT_SECURITY_LEVEL,
  isSecurityLevel,
  getSecurityLevelConfig,
  requiresEd25519,
  requiresMlDsa
} from './security-level'

// Unified signatures
export type {
  UnifiedSignature,
  SignatureOptions,
  VerificationResult,
  VerificationOptions
} from './unified-signature'
export { validateSignature, signatureSize, isUnifiedSignature } from './unified-signature'

// Signature encoding
export type { SignatureWire } from './signature-codec'
export {
  encodeSignature,
  decodeSignature,
  encodeSignatureBinary,
  decodeSignatureBinary,
  estimateSignatureSize
} from './signature-codec'

// Algorithm size constants
export {
  // Ed25519
  ED25519_PUBLIC_KEY_SIZE,
  ED25519_PRIVATE_KEY_SIZE,
  ED25519_SIGNATURE_SIZE,
  // ML-DSA-65
  ML_DSA_65_PUBLIC_KEY_SIZE,
  ML_DSA_65_PRIVATE_KEY_SIZE,
  ML_DSA_65_SIGNATURE_SIZE,
  ML_DSA_65_SIGNATURE_SIZE_MIN,
  ML_DSA_65_SIGNATURE_SIZE_MAX,
  // ML-KEM-768
  ML_KEM_768_PUBLIC_KEY_SIZE,
  ML_KEM_768_PRIVATE_KEY_SIZE,
  ML_KEM_768_CIPHERTEXT_SIZE,
  ML_KEM_768_SHARED_SECRET_SIZE,
  // X25519
  X25519_PUBLIC_KEY_SIZE,
  X25519_PRIVATE_KEY_SIZE,
  X25519_SHARED_SECRET_SIZE,
  // Hybrid
  HYBRID_SIGNATURE_SIZE_LEVEL_0,
  HYBRID_SIGNATURE_SIZE_LEVEL_1,
  HYBRID_SIGNATURE_SIZE_LEVEL_2,
  HYBRID_PUBLIC_KEY_SIZE,
  HYBRID_PRIVATE_KEY_SIZE
} from './constants'

// Hybrid signing
export type {
  HybridSigningKey,
  HybridPublicKey,
  VerifyBatchItem,
  CachedVerificationOptions
} from './hybrid-signing'
export {
  hybridSign,
  hybridVerify,
  hybridVerifyQuick,
  hybridVerifyCached,
  hybridVerifyCachedQuick,
  requiredKeysForLevel,
  canSignAtLevel,
  canVerifyAtLevel,
  maxSecurityLevel,
  hybridSignBatch,
  hybridVerifyBatch,
  hybridVerifyBatchAsync,
  hybridVerifyAll,
  hybridVerifyAllAsync
} from './hybrid-signing'

// Verification cache
export type { VerificationCacheOptions, CacheStats } from './cache/verification-cache'
export {
  VerificationCache,
  getVerificationCache,
  setVerificationCache,
  clearVerificationCache
} from './cache/verification-cache'

// Performance metrics
export type { CryptoMetrics, LevelMetrics, MetricAverages } from './metrics/crypto-metrics'
export { CryptoMetricsCollector, cryptoMetrics } from './metrics/crypto-metrics'

// Hybrid key generation
export type {
  HybridKeyPair,
  KeyGenOptions,
  KeyDerivationOptions,
  SerializedPublicKeys
} from './hybrid-keygen'
export {
  generateHybridKeyPair,
  deriveHybridKeyPair,
  extractSigningKeys,
  extractPublicKeys,
  keyPairSecurityLevel,
  keyPairCanSignAt,
  keyPairSize,
  serializePublicKeys,
  deserializePublicKeys,
  publicKeysEqual
} from './hybrid-keygen'
