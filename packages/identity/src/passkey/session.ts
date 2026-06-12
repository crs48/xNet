/**
 * @xnetjs/identity/passkey - Resumable unlocked-session cache
 *
 * Lets a successfully unlocked identity survive page reloads without
 * re-prompting WebAuthn on every load. The key bundle is AES-GCM
 * encrypted under a freshly generated, NON-EXTRACTABLE CryptoKey that is
 * persisted (as a structured-clone, still non-extractable) in IndexedDB
 * next to the ciphertext.
 *
 * Security model:
 * - Raw private keys are never written to storage in plaintext; the
 *   wrapping key's bytes cannot be exported by script, so the record
 *   cannot be exfiltrated and decrypted elsewhere.
 * - Same-origin script can still decrypt in-page — inherent to any
 *   silent-resume scheme, and equivalent to the existing non-PRF
 *   fallback path which stores `encKey` beside its ciphertext.
 * - Sessions expire after SESSION_TTL_MS (biometric unlock required to
 *   start a new one) and are bound to the identity's DID via AES-GCM
 *   additional authenticated data.
 */
import type { HybridKeyBundle } from '../types'
import { serializeKeyBundleToBinary, deserializeKeyBundleFromBinary } from '../key-bundle-storage'
import { openDB, dbGet, dbPut, dbDelete, SESSION_STORE_NAME } from './storage'

/** How long a persisted session stays resumable after unlock (7 days). */
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000

const SESSION_KEY = 'primary'

type StoredSessionRecord = {
  /** Non-extractable AES-GCM key — usable after a structured-clone round trip, never exportable */
  wrappingKey: CryptoKey
  /** AES-GCM ciphertext of the binary-serialized HybridKeyBundle */
  ciphertext: ArrayBuffer
  iv: ArrayBuffer
  /** DID the session belongs to (also bound into the ciphertext as AAD) */
  did: string
  /** Epoch ms after which the session is no longer resumable */
  expiresAt: number
}

function getSubtle(): SubtleCrypto | null {
  return typeof crypto !== 'undefined' && crypto.subtle ? crypto.subtle : null
}

/**
 * Persist an unlocked key bundle so it can be resumed without a
 * biometric prompt until `ttlMs` elapses.
 *
 * Throws if encryption or storage fails (callers should treat session
 * persistence as best-effort and not fail the unlock itself).
 */
export async function persistSession(
  bundle: HybridKeyBundle,
  ttlMs: number = SESSION_TTL_MS
): Promise<void> {
  const subtle = getSubtle()
  if (!subtle) {
    throw new Error('WebCrypto unavailable; cannot persist session')
  }

  const wrappingKey = await subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt'
  ])

  const iv = crypto.getRandomValues(new Uint8Array(12))
  const plaintext = serializeKeyBundleToBinary(bundle)
  const did = bundle.identity.did
  const ciphertext = await subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(did) },
    wrappingKey,
    plaintext as BufferSource
  )
  // Best-effort scrub of the plaintext copy
  plaintext.fill(0)

  const record: StoredSessionRecord = {
    wrappingKey,
    ciphertext,
    iv: iv.buffer,
    did,
    expiresAt: Date.now() + ttlMs
  }

  const db = await openDB()
  try {
    await dbPut(db, SESSION_STORE_NAME, SESSION_KEY, record)
  } finally {
    db.close()
  }
}

/**
 * Load and decrypt the persisted session, or null if there is none,
 * it has expired, or it fails to decrypt. Expired/corrupt records are
 * deleted on the way out.
 */
export async function loadSession(): Promise<HybridKeyBundle | null> {
  const subtle = getSubtle()
  if (!subtle) return null

  const db = await openDB()
  let record: StoredSessionRecord | undefined
  try {
    record = await dbGet<StoredSessionRecord>(db, SESSION_STORE_NAME, SESSION_KEY)
  } catch {
    db.close()
    return null
  }
  db.close()

  if (!record) return null

  if (
    !(record.wrappingKey instanceof CryptoKey) ||
    typeof record.expiresAt !== 'number' ||
    typeof record.did !== 'string' ||
    record.expiresAt <= Date.now()
  ) {
    await clearSession().catch(() => {})
    return null
  }

  try {
    const plaintext = await subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: record.iv,
        additionalData: new TextEncoder().encode(record.did)
      },
      record.wrappingKey,
      record.ciphertext
    )
    const bytes = new Uint8Array(plaintext)
    const bundle = deserializeKeyBundleFromBinary(bytes)
    bytes.fill(0)
    if (bundle.identity.did !== record.did) {
      await clearSession().catch(() => {})
      return null
    }
    return bundle
  } catch {
    // Tampered or undecryptable — drop it so we fall back to a real unlock
    await clearSession().catch(() => {})
    return null
  }
}

/**
 * Remove the persisted session (logout / lock). The identity record
 * itself is untouched — the user can unlock again with their passkey.
 */
export async function clearSession(): Promise<void> {
  const db = await openDB()
  try {
    await dbDelete(db, SESSION_STORE_NAME, SESSION_KEY)
  } finally {
    db.close()
  }
}
