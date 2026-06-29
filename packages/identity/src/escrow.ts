/**
 * @xnetjs/identity - Recovery escrow envelope (exploration 0243, P3.1, privacy-preserving variant).
 *
 * Escrow lets a user recover without keeping a long recovery phrase — but the design
 * note's safe default is that the **cloud can never read the user's data alone**. This
 * module is the user-held factor: it seals the recovery `backupKey` with a key derived
 * from a short user **PIN**. The cloud additionally KMS-wraps the sealed envelope and
 * only unwraps it for a verified WorkOS session — so recovery needs *both* a verified
 * billing login (cloud's factor) *and* the PIN (user's factor). The cloud holds only the
 * PIN-encrypted, KMS-wrapped blob and can never decrypt it on its own.
 *
 * (A short PIN is acceptable here only because the envelope is double-wrapped: an
 * attacker can't brute-force the PIN offline without first compromising the cloud's KMS
 * *and* a verified session. A fully-custodial "cloud can read with the login alone"
 * variant is deliberately NOT built — it needs an explicit product decision.)
 */
import {
  bytesToHex,
  decryptWithNonce,
  encryptWithNonce,
  hexToBytes,
  hkdf,
  randomBytes
} from '@xnetjs/crypto'

const ESCROW_VERSION = 1 as const
export const MIN_ESCROW_PIN_LENGTH = 4

export interface EscrowEnvelope {
  v: typeof ESCROW_VERSION
  /** PIN-encrypted secret (XChaCha20-Poly1305). */
  ciphertext: Uint8Array
  nonce: Uint8Array
  /** Per-envelope salt mixed into the PIN-derived key. */
  salt: Uint8Array
}

function pinKey(pin: string, salt: Uint8Array): Uint8Array {
  return hkdf(new TextEncoder().encode(pin), 'xnet-escrow-pin', 32, salt)
}

/** Seal a 32-byte secret (the recovery `backupKey`) under a user PIN. */
export function sealEscrow(secret: Uint8Array, pin: string): EscrowEnvelope {
  if (pin.length < MIN_ESCROW_PIN_LENGTH) {
    throw new Error(`Escrow PIN must be at least ${MIN_ESCROW_PIN_LENGTH} characters`)
  }
  const salt = randomBytes(16)
  const nonce = randomBytes(24)
  const ciphertext = encryptWithNonce(secret, pinKey(pin, salt), nonce)
  return { v: ESCROW_VERSION, ciphertext, nonce, salt }
}

/** Open a sealed envelope with the PIN. Throws if the PIN is wrong or data is tampered. */
export function openEscrow(envelope: EscrowEnvelope, pin: string): Uint8Array {
  return decryptWithNonce(envelope.ciphertext, pinKey(pin, envelope.salt), envelope.nonce)
}

/** Serialize an envelope to opaque bytes the cloud can KMS-wrap and store. */
export function serializeEscrow(envelope: EscrowEnvelope): Uint8Array {
  const payload = JSON.stringify({
    v: envelope.v,
    c: bytesToHex(envelope.ciphertext),
    n: bytesToHex(envelope.nonce),
    s: bytesToHex(envelope.salt)
  })
  return new TextEncoder().encode(payload)
}

/** Inverse of {@link serializeEscrow}. Throws on a malformed or wrong-version blob. */
export function deserializeEscrow(bytes: Uint8Array): EscrowEnvelope {
  const parsed = JSON.parse(new TextDecoder().decode(bytes)) as {
    v?: number
    c?: string
    n?: string
    s?: string
  }
  if (parsed.v !== ESCROW_VERSION || !parsed.c || !parsed.n || !parsed.s) {
    throw new Error('Malformed escrow envelope')
  }
  return {
    v: ESCROW_VERSION,
    ciphertext: hexToBytes(parsed.c),
    nonce: hexToBytes(parsed.n),
    salt: hexToBytes(parsed.s)
  }
}
