/**
 * @xnet/identity/passkey - WebAuthn passkey authentication types
 */
import type { KeyBundle, HybridKeyBundle, DID } from '../types'

// ─── Passkey Identity ────────────────────────────────────────

/**
 * Public identity info persisted in IndexedDB.
 * The private key is NEVER stored — it's derived on-demand via PRF.
 */
export type PasskeyIdentity = {
  /** The DID derived from the public key */
  did: DID

  /** Ed25519 public key (safe to store) */
  publicKey: Uint8Array

  /** ML-DSA-65 public key (safe to store, for reference) */
  pqPublicKey?: Uint8Array

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
 * Contains the full HybridKeyBundle (ephemeral — don't persist the private keys!).
 */
export type PasskeyUnlockResult = {
  /** Full hybrid key bundle with classical + PQ keys */
  keyBundle: HybridKeyBundle

  /** Public identity info (safe to persist) */
  passkey: PasskeyIdentity
}

/**
 * @deprecated Use PasskeyUnlockResult instead
 * Result with legacy KeyBundle for backward compatibility
 */
export type PasskeyUnlockResultLegacy = {
  /** Legacy key bundle (Ed25519/X25519 only) */
  keyBundle: KeyBundle

  /** Public identity info */
  passkey: PasskeyIdentity
}

// ─── Options ─────────────────────────────────────────────────

export type PasskeyCreateOptions = {
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
 *
 * **Security model:** The encryption key (`encKey`) is stored alongside the
 * ciphertext in IndexedDB. This does NOT protect against XSS — if an
 * attacker can read IndexedDB, they can decrypt the key bundle. Security
 * comes from the passkey gating access to the application, not from the
 * encryption at rest. PRF-based storage is preferred when available.
 */
export type FallbackStorage = {
  /** Encrypted serialized KeyBundle (XChaCha20-Poly1305) */
  encryptedBundle: Uint8Array

  /** Nonce used for encryption */
  nonce: Uint8Array

  /**
   * Encryption key (NOT a salt). Stored alongside ciphertext.
   * Security relies on passkey gating, not key secrecy.
   * @see Security model note above
   */
  encKey: Uint8Array
}

// ─── Stored Record ───────────────────────────────────────────

/**
 * Full stored record in IndexedDB.
 * For PRF identities, fallback is undefined.
 */
export type StoredPasskeyRecord = {
  passkey: PasskeyIdentity
  fallback?: FallbackStorage
}

// ─── Support Detection ───────────────────────────────────────

export type PasskeySupport = {
  /** Browser supports WebAuthn at all */
  webauthn: boolean

  /** Browser supports PRF extension */
  prf: boolean

  /** Platform authenticator available (Touch ID, Face ID, Windows Hello) */
  platform: boolean

  /** Passkey sync available (iCloud Keychain, Google Password Manager) */
  sync: boolean
}
