/**
 * @xnet/identity/sharing - Share revocation
 */
import { sign, verify } from '@xnet/crypto'
import { hashHex } from '@xnet/crypto'
import { parseDID } from '../did'
import type { Revocation } from './types'

// ─── Revocation Store ────────────────────────────────────────

/**
 * In-memory store for revoked share tokens.
 * In production, this would be backed by persistent storage.
 */
export class RevocationStore {
  private revocations = new Map<string, Revocation>()

  /**
   * Add a revocation after verifying the signature.
   *
   * @throws {Error} If the revocation signature is invalid
   */
  revoke(revocation: Revocation): void {
    // Verify the signature
    const payload = buildRevocationPayload(revocation.tokenHash, revocation.revokedAt)

    let publicKey: Uint8Array
    try {
      publicKey = parseDID(revocation.issuer)
    } catch {
      throw new Error('Invalid issuer DID in revocation')
    }

    const valid = verify(payload, revocation.signature, publicKey)
    if (!valid) {
      throw new Error('Invalid revocation signature')
    }

    this.revocations.set(revocation.tokenHash, revocation)
  }

  /** Check if a token has been revoked */
  isRevoked(tokenHash: string): boolean {
    return this.revocations.has(tokenHash)
  }

  /** Get revocation details */
  getRevocation(tokenHash: string): Revocation | undefined {
    return this.revocations.get(tokenHash)
  }

  /** Get all revocations by an issuer */
  getByIssuer(issuer: string): Revocation[] {
    return Array.from(this.revocations.values()).filter((r) => r.issuer === issuer)
  }

  /** Number of revocations stored */
  get size(): number {
    return this.revocations.size
  }
}

// ─── Create Revocation ───────────────────────────────────────

/**
 * Create a signed revocation for a share token.
 *
 * @param issuerDid - DID of the identity that created the share
 * @param signingKey - Ed25519 private key
 * @param token - The UCAN token string to revoke
 */
export function createRevocation(
  issuerDid: string,
  signingKey: Uint8Array,
  token: string
): Revocation {
  const tokenHash = computeTokenHash(token)
  const revokedAt = Date.now()

  const payload = buildRevocationPayload(tokenHash, revokedAt)
  const signature = sign(payload, signingKey)

  return {
    tokenHash,
    issuer: issuerDid,
    revokedAt,
    signature
  }
}

// ─── Helpers ─────────────────────────────────────────────────

/** Compute a hash of a UCAN token for identification */
export function computeTokenHash(token: string): string {
  const bytes = new TextEncoder().encode(token)
  return hashHex(bytes)
}

function buildRevocationPayload(tokenHash: string, revokedAt: number): Uint8Array {
  const data = JSON.stringify({
    type: 'xnet-revocation',
    tokenHash,
    revokedAt
  })
  return new TextEncoder().encode(data)
}
