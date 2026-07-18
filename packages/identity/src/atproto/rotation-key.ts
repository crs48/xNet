/**
 * did:plc rotation-key sovereignty (explorations 0322/0338).
 *
 * did:plc supports 1–5 *priority-ordered* rotation keys (secp256k1 or NIST
 * P-256). A higher-priority key can override a lower-priority one within the
 * 72-hour recovery window. Today the PDS holds the rotation keys and almost
 * nobody enrolls their own — so "your PDS operator can post as you." The fix:
 * xNet derives a **user-controlled P-256 rotation key from the recovery seed**
 * and enrolls it at HIGHER priority than the PDS's key, so the PDS can never
 * permanently take the global name, and the key is reconstructable from the
 * recovery phrase alone (no separate thing to lose — it rides the seed the
 * user already backs up).
 *
 * This module derives the key and formats it as the `did:key`-style multibase
 * public key string PLC operations use. It does NOT submit the PLC operation
 * (that is a PDS-gated, email-tokened network op — the host app performs it).
 */

import { p256 } from '@noble/curves/nist.js'
import { hkdf } from '@xnetjs/crypto'
import { base58btc } from 'multiformats/bases/base58'

/** HKDF context that separates the rotation key from every other seed-derived key. */
const ROTATION_KEY_CONTEXT = 'xnet-atproto-plc-rotation-p256'
/** Multicodec prefix for a compressed P-256 public key (0x1200), varint-encoded. */
const P256_PUB_MULTICODEC = Uint8Array.from([0x80, 0x24])

export interface PlcRotationKey {
  /** 32-byte P-256 private scalar (keep secret; reconstructable from the seed). */
  privateKey: Uint8Array
  /** Compressed (33-byte) P-256 public key. */
  publicKey: Uint8Array
  /**
   * The `did:key:z…` multibase form PLC uses to name a rotation key in
   * `rotationKeys` (multicodec p256-pub + base58btc, `z`-prefixed).
   */
  didKey: string
}

/** Derive the deterministic P-256 rotation key from the recovery seed. */
export function derivePlcRotationKey(seed: Uint8Array): PlcRotationKey {
  // Domain-separated so this key is unrelated to the Ed25519 signing key or the
  // X25519 encryption key derived from the same seed.
  const privateKey = hkdf(seed, ROTATION_KEY_CONTEXT, 32)
  const publicKey = p256.getPublicKey(privateKey, true) // compressed
  const prefixed = new Uint8Array(P256_PUB_MULTICODEC.length + publicKey.length)
  prefixed.set(P256_PUB_MULTICODEC, 0)
  prefixed.set(publicKey, P256_PUB_MULTICODEC.length)
  // multiformats' base58btc.encode returns the `z`-multibase-prefixed string.
  return { privateKey, publicKey, didKey: `did:key:${base58btc.encode(prefixed)}` }
}

/**
 * Order rotation keys so the user's key OUTRANKS the PDS's. PLC gives priority
 * by array position (earlier = higher priority), so the user key goes first.
 * Returns the `rotationKeys` array for a PLC operation.
 */
export function withUserPriorityRotationKey(
  userRotationDidKey: string,
  existingRotationKeys: readonly string[]
): string[] {
  const withoutDup = existingRotationKeys.filter((k) => k !== userRotationDidKey)
  return [userRotationDidKey, ...withoutDup]
}
