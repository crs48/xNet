/**
 * @xnetjs/hub - UCAN revocation list (exploration 0307 item B).
 *
 * Tracks revoked tokens (by `ucanTokenId` — SHA-256 of the compact JWT) and
 * DID-wide revocations ("everything this DID minted before T"). Checked on
 * every WS connect and HTTP request alongside signature/audience verification,
 * so a leaked or over-broad token can be killed without waiting for expiry.
 *
 * In-memory by design: revocations only need to outlive the tokens they kill,
 * and hub tokens are short-lived (hours). Entries self-prune at their token's
 * expiry. A hub restart clears the list — acceptable because it also drops
 * every live WS session, forcing re-mint.
 */

import type { UCANToken } from '@xnetjs/identity'

export class RevocationService {
  /** tokenId → unix seconds after which the entry is moot (token exp). */
  private revokedTokens = new Map<string, number>()
  /** did → unix ms cutoff; tokens whose session began before it are dead. */
  private revokedDids = new Map<string, number>()

  /** Revoke one token by id. `exp` (unix seconds) bounds how long we remember it. */
  revokeToken(tokenId: string, exp: number): void {
    this.revokedTokens.set(tokenId, exp)
  }

  /** Revoke every token a DID minted before `beforeMs` (default: now). */
  revokeDid(did: string, beforeMs: number = Date.now()): void {
    const existing = this.revokedDids.get(did)
    if (existing === undefined || beforeMs > existing) {
      this.revokedDids.set(did, beforeMs)
    }
  }

  /** Lift a DID-wide revocation (e.g. after the identity re-keys). */
  reinstateDid(did: string): void {
    this.revokedDids.delete(did)
  }

  isRevoked(tokenId: string, payload: Pick<UCANToken, 'iss' | 'exp'>): boolean {
    this.prune()
    if (this.revokedTokens.has(tokenId)) return true
    const didCutoffMs = this.revokedDids.get(payload.iss)
    if (didCutoffMs === undefined) return false
    // Mint time isn't in the payload, so we bound it from expiry: any token
    // expiring within cutoff + max client TTL (24h) COULD have been minted
    // before the cutoff and is rejected. Deliberately conservative — a DID
    // revocation acts as a ban that decays 24h after the cutoff (or when
    // `reinstateDid` lifts it), not a precise minted-before filter.
    const maxTtlSeconds = 24 * 60 * 60
    return payload.exp * 1000 <= didCutoffMs + maxTtlSeconds * 1000
  }

  get size(): number {
    this.prune()
    return this.revokedTokens.size + this.revokedDids.size
  }

  private prune(): void {
    const nowSeconds = Math.floor(Date.now() / 1000)
    for (const [id, exp] of this.revokedTokens) {
      if (exp < nowSeconds) this.revokedTokens.delete(id)
    }
    const maxTtlMs = 24 * 60 * 60 * 1000
    const nowMs = Date.now()
    for (const [did, cutoffMs] of this.revokedDids) {
      // Once every token minted before the cutoff has necessarily expired,
      // the DID entry is moot.
      if (cutoffMs + maxTtlMs < nowMs) this.revokedDids.delete(did)
    }
  }
}
