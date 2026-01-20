/**
 * Identity types for xNet
 */

/**
 * A decentralized identity
 */
export interface Identity {
  did: string // did:key:z6Mk...
  publicKey: Uint8Array // Ed25519 public key
  created: number
}

/**
 * A bundle of signing and encryption keys
 */
export interface KeyBundle {
  signingKey: Uint8Array // Ed25519 private key
  encryptionKey: Uint8Array // X25519 private key
  identity: Identity
}

/**
 * An encrypted key stored with passkey protection
 */
export interface StoredKey {
  id: string
  encryptedKey: Uint8Array // Encrypted with passkey
  salt: Uint8Array
  created: number
}

/**
 * A UCAN capability
 */
export interface UCANCapability {
  with: string // Resource URI
  can: string // Action (read, write, etc.)
}

/**
 * A UCAN token payload
 */
export interface UCANToken {
  iss: string // Issuer DID
  aud: string // Audience DID
  exp: number // Expiration timestamp
  att: UCANCapability[] // Capabilities
  prf: string[] // Proof chain (parent UCANs)
  sig: Uint8Array // Signature
}
