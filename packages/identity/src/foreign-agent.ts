/**
 * Foreign agent enrollment (exploration 0416).
 *
 * An agent may already carry a cryptographic identity from another ecosystem —
 * a Buzz/Nostr `npub`, an A2A agent card's `did:web`. That key proves **who**
 * is asking. It must never decide **what** they may do: the remote platform's
 * own permission model is host-controlled and mutable, so trusting it would
 * make xNet's signature attest to a decision xNet never verified.
 *
 * So enrollment is deliberately one-directional: verify the foreign proof,
 * then mint a *fresh* xNet {@link mintAgentPassport} whose capabilities come
 * from the operator alone. The foreign key is recorded as provenance — it is
 * the reason we believe the agent is who it says, never the source of its
 * authority. Attenuation stays xNet's ({@link assertAttenuated}), so a
 * compromised relay cannot widen a grant.
 *
 * @see docs/explorations/0416_[-]_AGENT_HARNESS_OR_AGENT_SUBSTRATE.md
 */

import type { UCANCapability } from './types'
import {
  assertAttenuated,
  mintAgentPassport,
  type AgentPassportGrant,
  type MintAgentPassportOptions
} from './agent-passport'

/** Ecosystems whose agent identities xNet can enroll. */
export const FOREIGN_AGENT_ORIGINS = ['buzz', 'a2a'] as const

export type ForeignAgentOrigin = (typeof FOREIGN_AGENT_ORIGINS)[number]

/**
 * An agent's claim to an identity minted elsewhere, plus the proof of control.
 */
export type ForeignAgentClaim = {
  /** The ecosystem vouching for the key. */
  origin: ForeignAgentOrigin
  /**
   * The agent's public key in its native encoding — a Nostr `npub1…` for
   * Buzz, a `did:web:…` for an A2A agent card. Opaque to this module; the
   * injected verifier is what understands it.
   */
  foreignKey: string
  /** Signature over {@link challenge}, in the foreign ecosystem's scheme. */
  proof: Uint8Array
  /**
   * The bytes the agent signed. Must be operator-generated and single-use —
   * a replayed challenge proves only that the key signed *something*, once.
   */
  challenge: Uint8Array
}

/**
 * Verifies a foreign proof. Injected rather than implemented here: each
 * ecosystem has its own key encoding and signature scheme, and `@xnetjs/identity`
 * must not grow a Nostr dependency to serve one adapter.
 *
 * Must return `false` — never throw, never a partial credit — for anything it
 * cannot fully verify.
 */
export type ForeignProofVerifier = (claim: ForeignAgentClaim) => boolean

/**
 * A passport plus the foreign identity that justified issuing it.
 */
export type ForeignAgentEnrollment = AgentPassportGrant & {
  origin: ForeignAgentOrigin
  /** The verified foreign key, for provenance and audit display. */
  foreignKey: string
}

export type EnrollForeignAgentOptions = Omit<MintAgentPassportOptions, 'capabilities'> & {
  claim: ForeignAgentClaim
  /**
   * Capabilities the *operator* grants. Never derived from the foreign
   * ecosystem — see the module note.
   */
  capabilities: UCANCapability[]
  /** Verifier for {@link ForeignAgentClaim.proof}. */
  verifyProof: ForeignProofVerifier
}

/**
 * Enroll an externally-identified agent as a scoped xNet identity.
 *
 * A failed proof is not "an agent with fewer rights" — it is not an agent, and
 * this throws rather than returning a degraded grant a caller could mistake
 * for success (the `AGENTS.md` loud-failure rule).
 *
 * @throws {Error} If the foreign proof does not verify.
 * @throws {Error} If the requested capabilities are not attenuated.
 */
export function enrollForeignAgent(options: EnrollForeignAgentOptions): ForeignAgentEnrollment {
  const { claim, capabilities, verifyProof, ...passportOptions } = options

  if (claim.challenge.length === 0) {
    throw new Error('Foreign agent challenge must not be empty')
  }
  if (claim.proof.length === 0) {
    throw new Error('Foreign agent proof must not be empty')
  }

  if (!verifyProof(claim)) {
    throw new Error(`Unverified ${claim.origin} agent key: ${claim.foreignKey}`)
  }

  // Enforced here as well as inside `mintAgentPassport`, so the invariant is
  // stated at the boundary a foreign ecosystem reaches.
  assertAttenuated(capabilities)

  const grant = mintAgentPassport({ ...passportOptions, capabilities })

  return { ...grant, origin: claim.origin, foreignKey: claim.foreignKey }
}
