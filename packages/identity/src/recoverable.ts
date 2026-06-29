/**
 * @xnetjs/identity - Recoverable identities (exploration 0243, Phase 1).
 *
 * A *recoverable* identity is born from a recovery phrase (mnemonic): its DID and its
 * X25519 encryption key are derived deterministically from the phrase, so the SAME
 * identity — and therefore access to the same end-to-end-encrypted data — can be
 * reconstructed on any device by typing the phrase, even after the passkey is lost.
 *
 * The post-quantum keys are NOT recovered from the phrase (they're regenerated), but
 * the DID and the classical X25519 recipient key — which gate who can decrypt data —
 * ARE, which is what makes "recover my workspace" possible without escrow.
 *
 * This module is pure: no WebAuthn, no storage. The IdentityManager wraps these with a
 * passkey for at-rest gating; the recovery phrase itself is the only custodial-free
 * way data survives a lost passkey.
 */
import type { DID, HybridKeyBundle } from './types'
import { decryptWithNonce, encryptWithNonce, randomBytes } from '@xnetjs/crypto'
import {
  RECOVERY_WORDLIST,
  createKeyBundleFromSeed,
  deriveKeysFromSeed,
  type RecoveryShare
} from './seed-recovery'

/** Minimum words a recovery phrase may have (matches `deriveKeysFromSeed`). */
export const MIN_RECOVERY_PHRASE_WORDS = 12

/**
 * Default words in a freshly generated phrase. 24 words over the 64-word list is
 * ~144 bits of entropy — comfortably above the 128-bit bar for a recovery secret,
 * while staying memorable/transcribable. (12 words is accepted on import for
 * compatibility but only ~72 bits, so we never *generate* that few.)
 */
export const DEFAULT_RECOVERY_PHRASE_WORDS = 24

function normalize(phrase: string): string {
  return phrase.trim().replace(/\s+/g, ' ').toLowerCase()
}

/** Generate a fresh recovery phrase from the recovery wordlist. */
export function generateRecoveryPhrase(words: number = DEFAULT_RECOVERY_PHRASE_WORDS): string {
  if (words < MIN_RECOVERY_PHRASE_WORDS) {
    throw new Error(`A recovery phrase needs at least ${MIN_RECOVERY_PHRASE_WORDS} words`)
  }
  // Rejection-sample a byte to a wordlist index without modulo bias.
  const n = RECOVERY_WORDLIST.length
  const limit = Math.floor(256 / n) * n
  const picked: string[] = []
  while (picked.length < words) {
    const [byte] = randomBytes(1)
    if (byte < limit) picked.push(RECOVERY_WORDLIST[byte % n])
  }
  return picked.join(' ')
}

export type RecoveryPhraseValidation =
  | { ok: true; words: string[] }
  | { ok: false; reason: 'too-short'; wordCount: number }
  | { ok: false; reason: 'unknown-words'; unknownWords: string[] }

/**
 * Validate a typed phrase for the import UI: enough words, and every word is in the
 * recovery wordlist (catches transcription typos before they derive a wrong DID).
 */
export function validateRecoveryPhrase(phrase: string): RecoveryPhraseValidation {
  const words = normalize(phrase)
    .split(' ')
    .filter((w) => w.length > 0)
  if (words.length < MIN_RECOVERY_PHRASE_WORDS) {
    return { ok: false, reason: 'too-short', wordCount: words.length }
  }
  const known = new Set(RECOVERY_WORDLIST)
  const unknownWords = [...new Set(words.filter((w) => !known.has(w)))]
  if (unknownWords.length > 0) {
    return { ok: false, reason: 'unknown-words', unknownWords }
  }
  return { ok: true, words }
}

/** The deterministic DID for a phrase, without building the full key bundle. */
export function didForRecoveryPhrase(phrase: string): DID {
  return deriveKeysFromSeed(normalize(phrase)).did
}

/**
 * Reconstruct a full key bundle from a recovery phrase. The DID and X25519 encryption
 * key are identical on every device; PQ keys are freshly regenerated (and not needed
 * to decrypt data sealed to the classical recipient key).
 */
export function recoveryPhraseToBundle(
  phrase: string,
  options: { includePQ?: boolean } = {}
): HybridKeyBundle {
  return createKeyBundleFromSeed(normalize(phrase), {
    includePQ: options.includePQ ?? true
  }).bundle
}

/** Mint a brand-new recoverable identity: a fresh phrase plus its derived bundle. */
export function createRecoverableIdentity(options: { words?: number; includePQ?: boolean } = {}): {
  phrase: string
  bundle: HybridKeyBundle
} {
  const phrase = generateRecoveryPhrase(options.words)
  return { phrase, bundle: recoveryPhraseToBundle(phrase, options) }
}

/**
 * A recovery phrase encrypted at rest. The IdentityManager stores this so the phrase
 * can be re-shown in Settings ("view recovery phrase") after a passkey unlock — the
 * key comes from the passkey (PRF) or the fallback encKey, never persisted in clear.
 */
export interface SealedRecoveryPhrase {
  ciphertext: Uint8Array
  nonce: Uint8Array
}

/** Seal a phrase with a 32-byte key (XChaCha20-Poly1305). */
export function sealRecoveryPhrase(phrase: string, key: Uint8Array): SealedRecoveryPhrase {
  const nonce = randomBytes(24)
  const ciphertext = encryptWithNonce(new TextEncoder().encode(normalize(phrase)), key, nonce)
  return { ciphertext, nonce }
}

/** Open a sealed phrase. Throws if the key is wrong or the data was tampered with. */
export function openRecoveryPhrase(sealed: SealedRecoveryPhrase, key: Uint8Array): string {
  return new TextDecoder().decode(decryptWithNonce(sealed.ciphertext, key, sealed.nonce))
}

// ─── Guardian share codes (social recovery — exploration 0243) ────────────────

const SHARE_PREFIX = 'xnet-share:'

function base64UrlEncode(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  const base64 =
    typeof btoa === 'function' ? btoa(binary) : Buffer.from(binary, 'binary').toString('base64')
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlDecode(code: string): string {
  const base64 = code.replace(/-/g, '+').replace(/_/g, '/')
  const binary =
    typeof atob === 'function' ? atob(base64) : Buffer.from(base64, 'base64').toString('binary')
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}

/**
 * Encode a guardian share as a single copy-pasteable code (`xnet-share:<base64url>`),
 * so a guardian can hold one opaque token rather than a JSON blob.
 */
export function serializeShare(share: RecoveryShare): string {
  return SHARE_PREFIX + base64UrlEncode(JSON.stringify(share))
}

/** Parse a guardian share code back into a {@link RecoveryShare}. Throws if malformed. */
export function parseShare(code: string): RecoveryShare {
  const trimmed = code.trim()
  if (!trimmed.startsWith(SHARE_PREFIX)) {
    throw new Error('Not a valid guardian share code')
  }
  const parsed = JSON.parse(base64UrlDecode(trimmed.slice(SHARE_PREFIX.length))) as RecoveryShare
  if (
    typeof parsed.index !== 'number' ||
    typeof parsed.share !== 'string' ||
    typeof parsed.threshold !== 'number' ||
    typeof parsed.totalShares !== 'number' ||
    typeof parsed.groupId !== 'string'
  ) {
    throw new Error('Malformed guardian share code')
  }
  return parsed
}
