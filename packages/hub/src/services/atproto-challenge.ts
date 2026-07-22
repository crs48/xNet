/**
 * @xnetjs/hub — recovery-ceremony challenges (explorations 0322/0389).
 *
 * ## The hole this closes
 *
 * `POST /recovery-anchor/release` used to accept `{ xnetDid, code }` and hand
 * back the sealed escrow blob after checking that
 *
 *  1. a binding record exists in the ATProto repo and is signed by the bound
 *     xNet key,
 *  2. the canonical PDS advertises an authorization server,
 *  3. the binding is inside the freshness window.
 *
 * Every one of those reads **public** data — the binding record is a public
 * record in a public repo, the AS document is public, the timestamp is public.
 * The `code` was accepted and then never read. So any unauthenticated caller
 * who knew a victim's xNet DID could collect the blob, and the only thing left
 * between them and the recovery secret was an offline-brute-forceable PIN.
 *
 * The three checks above are necessary but they prove a *standing* fact.
 * Releasing a secret requires proof of **live control, now**.
 *
 * ## The proof
 *
 * The hub mints a random, single-use, short-lived nonce bound to one xNet DID.
 * The recovering user — who at this point has an authenticated session with
 * their PDS but does *not* yet hold their xNet key (that is what they are
 * recovering) — writes that nonce into a record in their own repo. The hub
 * then reads it back **from the PDS named by the DID document**, not from
 * anywhere the caller nominates.
 *
 * Only the account holder can put a record in their repo, so the record is the
 * proof. No OAuth code exchange, no confidential client, no client secret, no
 * DPoP key for the hub to hold — the same registry-free, secret-free two-sided
 * handshake 0372 adopted from Tangled, pointed at recovery.
 *
 * Signing the nonce with the xNet key would be the obvious alternative and is
 * exactly wrong here: recovery is the case where the user has lost that key.
 *
 * ## Deliberately in memory
 *
 * Challenges live ~10 minutes and are single-use, so a hub restart costs a
 * retry, not access. Persisting them would widen the blast radius of a disk
 * compromise for no gain.
 */

import { randomBytes } from 'node:crypto'

/** The collection the recovering user writes the challenge record into. */
export const ATPROTO_CHALLENGE_COLLECTION = 'fyi.xnet.identity.challenge'
/** One outstanding challenge per account is enough. */
export const ATPROTO_CHALLENGE_RKEY = 'self'

/** How long a minted challenge stays usable. Long enough for a PDS round trip
 *  and a human reading a dialog; short enough that a leaked nonce is stale. */
export const DEFAULT_CHALLENGE_TTL_MS = 10 * 60 * 1000

export interface RecoveryChallenge {
  nonce: string
  xnetDid: string
  issuedAt: number
  expiresAt: number
}

export interface ChallengeStoreOptions {
  ttlMs?: number
  now?: () => number
  /** Injected for tests; production uses crypto-strong randomness. */
  mintNonce?: () => string
}

/**
 * Server-issued, single-use recovery challenges.
 *
 * `consume` is the only read: a nonce that verifies is destroyed in the same
 * call, so a replay of a captured request fails even inside the TTL.
 */
export class RecoveryChallengeStore {
  private challenges = new Map<string, RecoveryChallenge>()
  private ttlMs: number
  private now: () => number
  private mintNonce: () => string

  constructor(options: ChallengeStoreOptions = {}) {
    this.ttlMs = options.ttlMs ?? DEFAULT_CHALLENGE_TTL_MS
    this.now = options.now ?? Date.now
    this.mintNonce = options.mintNonce ?? (() => randomBytes(32).toString('base64url'))
  }

  /**
   * Mint a challenge for one xNet DID, replacing any outstanding one.
   *
   * Replacing rather than accumulating keeps a caller from farming a pile of
   * live nonces for one account.
   */
  issue(xnetDid: string): RecoveryChallenge {
    const issuedAt = this.now()
    const challenge: RecoveryChallenge = {
      nonce: this.mintNonce(),
      xnetDid,
      issuedAt,
      expiresAt: issuedAt + this.ttlMs
    }
    this.challenges.set(xnetDid, challenge)
    return challenge
  }

  /**
   * Verify and destroy a challenge.
   *
   * Returns `null` for unknown, expired, or mismatched nonces — the caller must
   * not distinguish these to a client, or the endpoint becomes an oracle for
   * which DIDs have escrow enrolled.
   */
  consume(xnetDid: string, nonce: string): RecoveryChallenge | null {
    const challenge = this.challenges.get(xnetDid)
    if (!challenge) return null
    // Single-use: any attempt burns it, right or wrong. An attacker guessing
    // nonces must therefore re-solicit a challenge each time, and the honest
    // user's live nonce is never left sitting behind a failed guess.
    this.challenges.delete(xnetDid)
    if (this.now() > challenge.expiresAt) return null
    if (!timingSafeEqualString(challenge.nonce, nonce)) return null
    return challenge
  }

  /** Drop expired entries. Called opportunistically; not a scheduler. */
  sweep(): void {
    const now = this.now()
    for (const [did, challenge] of this.challenges) {
      if (now > challenge.expiresAt) this.challenges.delete(did)
    }
  }

  get size(): number {
    return this.challenges.size
  }
}

/**
 * Constant-time string comparison.
 *
 * `crypto.timingSafeEqual` throws on length mismatch, which would itself leak
 * length, so compare lengths first and then every byte regardless of outcome.
 */
function timingSafeEqualString(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** The record shape the recovering user writes into their repo. */
export interface ChallengeRecord {
  $type: typeof ATPROTO_CHALLENGE_COLLECTION
  nonce: string
  xnetDid: string
  createdAt: string
}

/** Build the record the client is expected to `putRecord`. */
export function buildChallengeRecord(challenge: RecoveryChallenge, now: number): ChallengeRecord {
  return {
    $type: ATPROTO_CHALLENGE_COLLECTION,
    nonce: challenge.nonce,
    xnetDid: challenge.xnetDid,
    createdAt: new Date(now).toISOString()
  }
}
