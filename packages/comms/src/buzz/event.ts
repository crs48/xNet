/**
 * NIP-01 event verification (exploration 0416).
 *
 * A Buzz agent proves control of its `npub` by signing a challenge as a Nostr
 * event. Verifying that proof means two independent checks, and skipping
 * either one makes the proof worthless:
 *
 *   1. The event `id` really is the hash of its own canonical serialization —
 *      otherwise an attacker replays someone else's signature over new content.
 *   2. The Schnorr signature over that id verifies under the claimed pubkey.
 *
 * Nostr uses BIP340 Schnorr over secp256k1, not Ed25519, so this cannot reuse
 * the kernel's signature path. `@noble/curves` is already in the tree.
 */

import { sha256 } from '@noble/hashes/sha2.js'
import { schnorr } from '@noble/curves/secp256k1.js'
import { bytesToHex, hexToBytes } from './nip19'

/** A Nostr event as it appears on the wire (NIP-01). */
export type NostrEvent = {
  id: string
  pubkey: string
  created_at: number
  kind: number
  tags: string[][]
  content: string
  sig: string
}

/**
 * The canonical serialization an event id is the SHA-256 of (NIP-01):
 * `[0, pubkey, created_at, kind, tags, content]`, JSON with no whitespace.
 */
export function serializeEvent(event: NostrEvent): string {
  return JSON.stringify([
    0,
    event.pubkey,
    event.created_at,
    event.kind,
    event.tags,
    event.content
  ])
}

/** Recompute an event's id from its content. */
export function computeEventId(event: NostrEvent): string {
  return bytesToHex(sha256(new TextEncoder().encode(serializeEvent(event))))
}

/**
 * Verify a Nostr event: id integrity, then signature.
 *
 * Returns a boolean rather than throwing — callers treat any falsy result as
 * "not this agent", and there is no partial credit to express.
 */
export function verifyNostrEvent(event: NostrEvent): boolean {
  if (!event || typeof event !== 'object') return false
  if (typeof event.id !== 'string' || typeof event.sig !== 'string') return false
  if (typeof event.pubkey !== 'string' || event.pubkey.length !== 64) return false

  // 1. The id must be the hash of this event's own content.
  if (computeEventId(event) !== event.id) return false

  // 2. The signature must verify under the claimed key.
  const sig = hexToBytes(event.sig)
  const id = hexToBytes(event.id)
  const pubkey = hexToBytes(event.pubkey)
  if (!sig || !id || !pubkey) return false

  try {
    return schnorr.verify(sig, id, pubkey)
  } catch {
    // Wrong lengths, off-curve points — all "not verified".
    return false
  }
}
