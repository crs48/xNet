/**
 * @xnetjs/identity/sharing - Share revocation
 */
import type { Revocation } from './types'
import { sign, verify, hashHex } from '@xnetjs/crypto'
import { parseDID } from '../did'

// ─── Revocation Store ────────────────────────────────────────

/**
 * Pluggable persistence for revocations. The signature is binary —
 * JSON-based backends should use the serialize/deserialize helpers below.
 */
export interface RevocationPersistence {
  /** Load all persisted revocations (consumed by `hydrate`). */
  load: () => Promise<Revocation[]> | Revocation[]
  /** Persist a newly accepted revocation. */
  save: (revocation: Revocation) => Promise<void> | void
}

export type SerializedRevocation = {
  tokenHash: string
  issuer: string
  revokedAt: number
  signatureB64: string
}

export function serializeRevocation(revocation: Revocation): SerializedRevocation {
  let binary = ''
  for (const byte of revocation.signature) {
    binary += String.fromCharCode(byte)
  }
  return {
    tokenHash: revocation.tokenHash,
    issuer: revocation.issuer,
    revokedAt: revocation.revokedAt,
    signatureB64: btoa(binary)
  }
}

export function deserializeRevocation(serialized: SerializedRevocation): Revocation {
  const binary = atob(serialized.signatureB64)
  return {
    tokenHash: serialized.tokenHash,
    issuer: serialized.issuer,
    revokedAt: serialized.revokedAt,
    signature: Uint8Array.from(binary, (c) => c.charCodeAt(0))
  }
}

/**
 * Store for revoked share tokens. In-memory by default; pass a
 * `RevocationPersistence` adapter and call `hydrate()` to survive restarts.
 * Persisted entries are signature-verified again on load.
 */
export class RevocationStore {
  private revocations = new Map<string, Revocation>()

  constructor(private readonly persistence?: RevocationPersistence) {}

  /** Load and re-verify persisted revocations. Invalid entries are skipped. */
  async hydrate(): Promise<number> {
    if (!this.persistence) return 0
    const entries = await this.persistence.load()
    let loaded = 0
    for (const entry of entries) {
      try {
        this.verifyAndStore(entry)
        loaded += 1
      } catch {
        // Skip entries that no longer verify rather than poisoning the store
      }
    }
    return loaded
  }

  /**
   * Add a revocation after verifying the signature.
   *
   * Optionally accepts the original UCAN token to verify that the
   * revocation issuer matches the token's issuer.
   *
   * @throws {Error} If the revocation signature is invalid
   * @throws {Error} If the issuer does not match the token issuer
   */
  revoke(revocation: Revocation, originalToken?: string): void {
    // If the original token is provided, verify the issuer matches
    if (originalToken) {
      const ucanParts = originalToken.split('.')
      if (ucanParts.length === 3) {
        try {
          let base64 = ucanParts[1].replace(/-/g, '+').replace(/_/g, '/')
          const padding = base64.length % 4
          if (padding) {
            base64 += '='.repeat(4 - padding)
          }
          const binary = atob(base64)
          const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0))
          const payloadJson = new TextDecoder().decode(bytes)
          const ucanPayload = JSON.parse(payloadJson) as { iss?: string }
          if (ucanPayload.iss && ucanPayload.iss !== revocation.issuer) {
            throw new Error(
              'Revocation issuer does not match token issuer: only the original issuer can revoke'
            )
          }
        } catch (err) {
          if (err instanceof Error && err.message.startsWith('Revocation issuer')) {
            throw err
          }
        }
      }
    }

    this.verifyAndStore(revocation)

    if (this.persistence) {
      void Promise.resolve(this.persistence.save(revocation)).catch(() => {
        // Persistence is best-effort; the in-memory store stays authoritative.
      })
    }
  }

  private verifyAndStore(revocation: Revocation): void {
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
 * Verifies that the issuerDid matches the UCAN's `iss` field — only
 * the original issuer can revoke a token.
 *
 * @param issuerDid - DID of the identity that created the share
 * @param signingKey - Ed25519 private key
 * @param token - The UCAN token string to revoke
 * @throws {Error} If issuerDid does not match the token's issuer
 */
export function createRevocation(
  issuerDid: string,
  signingKey: Uint8Array,
  token: string
): Revocation {
  // Verify that the issuer matches the UCAN's iss field
  const ucanParts = token.split('.')
  if (ucanParts.length === 3) {
    try {
      let base64 = ucanParts[1].replace(/-/g, '+').replace(/_/g, '/')
      const padding = base64.length % 4
      if (padding) {
        base64 += '='.repeat(4 - padding)
      }
      const binary = atob(base64)
      const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0))
      const payloadJson = new TextDecoder().decode(bytes)
      const ucanPayload = JSON.parse(payloadJson) as { iss?: string }
      if (ucanPayload.iss && ucanPayload.iss !== issuerDid) {
        throw new Error(
          'Revocation issuer does not match token issuer: only the original issuer can revoke a token'
        )
      }
    } catch (err) {
      // Re-throw issuer mismatch errors, ignore parse errors
      if (err instanceof Error && err.message.startsWith('Revocation issuer')) {
        throw err
      }
    }
  }

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
