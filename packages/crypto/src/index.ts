/**
 * @xnet/crypto - Encryption, signing, and hashing primitives
 */

// Hashing
export { hash, hashHex, hashBase64, type HashAlgorithm } from './hashing'

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
