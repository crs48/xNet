/**
 * @xnet/identity/passkey - WebAuthn passkey authentication types
 */
import type { Identity, KeyBundle } from '../types'

// ─── Passkey Identity ────────────────────────────────────────

/**
 * Public identity info persisted in IndexedDB.
 * The private key is NEVER stored — it's derived on-demand via PRF.
 */
export interface PasskeyIdentity {
  /** The DID derived from the public key */
  did: string

  /** Ed25519 public key (safe to store) */
  publicKey: Uint8Array

  /** WebAuthn credential ID (needed for authentication) */
  credentialId: Uint8Array

  /** When the identity was created */
  createdAt: number

  /** Relying party ID (usually the domain) */
  rpId: string

  /** Whether this identity uses PRF or fallback encrypted storage */
  mode: 'prf' | 'fallback'
}

// ─── Create / Unlock Results ─────────────────────────────────

/**
 * Result of creating or unlocking a passkey identity.
 * Contains the full KeyBundle (ephemeral — don't persist the private keys!).
 */
export interface PasskeyUnlockResult {
  /** Full key bundle with signing + encryption keys */
  keyBundle: KeyBundle

  /** Public identity info (safe to persist) */
  passkey: PasskeyIdentity
}

// ─── Options ─────────────────────────────────────────────────

export interface PasskeyCreateOptions {
  /** User-friendly name for the passkey (default: "xNet Identity") */
  displayName?: string

  /** Relying party ID (default: current hostname) */
  rpId?: string

  /** Require user verification (default: 'required') */
  userVerification?: 'required' | 'preferred' | 'discouraged'
}

// ─── Fallback Storage ────────────────────────────────────────

/**
 * Encrypted private key storage for authenticators that don't support PRF.
 * Stored alongside PasskeyIdentity in IndexedDB.
 */
export interface FallbackStorage {
  /** Encrypted serialized KeyBundle (XChaCha20-Poly1305) */
  encryptedBundle: Uint8Array

  /** Nonce used for encryption */
  nonce: Uint8Array

  /** Salt used for HKDF key derivation */
  salt: Uint8Array
}

// ─── Stored Record ───────────────────────────────────────────

/**
 * Full stored record in IndexedDB.
 * For PRF identities, fallback is undefined.
 */
export interface StoredPasskeyRecord {
  passkey: PasskeyIdentity
  fallback?: FallbackStorage
}

// ─── Support Detection ───────────────────────────────────────

export interface PasskeySupport {
  /** Browser supports WebAuthn at all */
  webauthn: boolean

  /** Browser supports PRF extension */
  prf: boolean

  /** Platform authenticator available (Touch ID, Face ID, Windows Hello) */
  platform: boolean

  /** Passkey sync available (iCloud Keychain, Google Password Manager) */
  sync: boolean
}
