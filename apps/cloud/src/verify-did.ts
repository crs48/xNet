/**
 * xNet Cloud — the real passkey-DID challenge verifier (exploration 0243, Phase 0).
 *
 * Replaces the dev stub that only checked the challenge was *well-formed*. A DID
 * challenge proves the caller controls the `did:key`'s private key by signing a
 * server-issued nonce; here we verify the Ed25519 signature against the public key
 * embedded in the `did:key` itself (no registry needed).
 *
 * This is the pure *cryptographic* half. Replay protection (single-use nonce) and
 * audience binding (nonce ↔ this device flow) live in the server layer — `/device/token`
 * issues and consumes the nonce — so this function composes for both the device-claim
 * flow and the internal provisioning route. `@xnetjs/cloud` stays crypto-free and takes
 * this verifier by injection (see `DidChallengeVerifier`).
 */
import type { DidChallenge, DidChallengeVerifier } from '@xnetjs/cloud/identity'
import { extractEd25519PubKey, hybridVerify, type DID } from '@xnetjs/crypto'

/** Decode a base64url string to bytes, or null if it isn't valid base64url. */
function fromBase64Url(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null
  try {
    return new Uint8Array(Buffer.from(value, 'base64url'))
  } catch {
    return null
  }
}

/**
 * A verifier that checks `signature` is a valid Ed25519 signature over `nonce` by the
 * key embedded in `did`. The signature wire format is base64url of the raw 64-byte
 * Ed25519 signature (a Level-0 unified signature). Returns false — never throws — on
 * any malformed input, so a bad challenge is a clean denial.
 */
export function makeDidChallengeVerifier(): DidChallengeVerifier {
  return async (challenge: DidChallenge): Promise<boolean> => {
    if (!challenge.did || !challenge.nonce || !challenge.signature) return false
    const publicKey = extractEd25519PubKey(challenge.did as DID)
    if (!publicKey) return false
    const signature = fromBase64Url(challenge.signature)
    if (!signature || signature.length !== 64) return false
    const message = new TextEncoder().encode(challenge.nonce)
    try {
      return hybridVerify(message, { level: 0, ed25519: signature }, { ed25519: publicKey }).valid
    } catch {
      return false
    }
  }
}
