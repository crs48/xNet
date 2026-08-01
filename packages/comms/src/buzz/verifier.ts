/**
 * Buzz agent enrollment (exploration 0416).
 *
 * Block's Buzz gives every agent its own Nostr keypair, which is genuinely the
 * same intuition as xNet's Agent Passport — so a Buzz agent arrives already
 * carrying a credential worth believing. This module makes that credential
 * usable *as evidence of identity only*.
 *
 * The rule the whole adapter exists to enforce: **the npub proves who, the
 * operator's UCAN decides what.** Buzz's own team access controls are host
 * configuration; if xNet honoured them, xNet's signature would attest to a
 * decision it never verified. So a verified npub buys exactly one thing — a
 * scoped xNet passport minted by the operator.
 */

import { enrollForeignAgent, type ForeignAgentClaim, type UCANCapability } from '@xnetjs/identity'
import { verifyNostrEvent, type NostrEvent } from './event'
import { bytesToHex, decodeNpub } from './nip19'

/** Nostr event kind Buzz agents use to answer an enrollment challenge. */
export const BUZZ_ENROLLMENT_KIND = 27235

/**
 * Verify that a claim's proof is a valid Nostr event, signed by the key the
 * `npub` names, over the exact challenge issued.
 *
 * The proof bytes are the UTF-8 JSON of a {@link NostrEvent}.
 */
export function verifyBuzzProof(claim: ForeignAgentClaim): boolean {
  if (claim.origin !== 'buzz') return false

  const pubkey = decodeNpub(claim.foreignKey)
  if (!pubkey) return false

  let event: NostrEvent
  try {
    event = JSON.parse(new TextDecoder().decode(claim.proof)) as NostrEvent
  } catch {
    return false
  }

  // The event must be signed by the very key the npub encodes — not merely by
  // some valid key.
  if (event.pubkey !== bytesToHex(pubkey)) return false
  if (event.kind !== BUZZ_ENROLLMENT_KIND) return false

  // …and it must be over OUR challenge, or it is a replay of an old signature.
  const challenge = new TextDecoder().decode(claim.challenge)
  if (event.content !== challenge) return false

  return verifyNostrEvent(event)
}

export type EnrollBuzzAgentOptions = {
  /** The agent's `npub1…`. */
  npub: string
  /** Serialized signed Nostr event answering `challenge`. */
  proof: Uint8Array
  /** The operator-issued, single-use challenge the event must sign. */
  challenge: Uint8Array
  operatorDID: string
  operatorKey: Uint8Array
  /** What the OPERATOR grants — never derived from Buzz's own permissions. */
  capabilities: UCANCapability[]
  ttlSeconds?: number
}

/**
 * Enroll a Buzz agent as a scoped xNet identity.
 *
 * @throws {Error} If the Nostr proof does not verify, or the capabilities are
 * not attenuated.
 */
export function enrollBuzzAgent(options: EnrollBuzzAgentOptions) {
  const { npub, proof, challenge, ...rest } = options
  return enrollForeignAgent({
    ...rest,
    claim: { origin: 'buzz', foreignKey: npub, proof, challenge },
    verifyProof: verifyBuzzProof
  })
}
