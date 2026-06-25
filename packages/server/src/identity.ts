/**
 * Identity helpers for the trust spectrum.
 *
 * In `custodial` mode the server signs on a user's behalf with a *stable*
 * per-user key it derives from a single server secret. The derivation is
 * deterministic (HKDF over the secret keyed by the subject), so the same user
 * always maps to the same `did:key` and their authorship is consistent across
 * requests and restarts — without the user ever holding a key.
 */
import type { DID } from '@xnetjs/identity'
import { hkdf, getSigningPublicKeyFromPrivate } from '@xnetjs/crypto'
import { createDID } from '@xnetjs/identity'

export interface DerivedIdentity {
  did: DID
  signingKey: Uint8Array
}

const CUSTODIAL_INFO = 'xnet-server/custodial-author/v1'

/**
 * Derive a stable Ed25519 identity for `subject` from `secret`.
 *
 * The 32-byte HKDF output is used directly as the Ed25519 seed (this codebase's
 * private keys are 32-byte seeds).
 */
export function deriveCustodialIdentity(secret: Uint8Array, subject: string): DerivedIdentity {
  const ikm = new Uint8Array(secret.length + 1 + subjectBytes(subject).length)
  ikm.set(secret, 0)
  ikm.set([0x1f], secret.length)
  ikm.set(subjectBytes(subject), secret.length + 1)
  const signingKey = hkdf(ikm, CUSTODIAL_INFO, 32)
  const publicKey = getSigningPublicKeyFromPrivate(signingKey)
  return { did: createDID(publicKey), signingKey }
}

function subjectBytes(subject: string): Uint8Array {
  return new TextEncoder().encode(subject)
}
