/**
 * @xnetjs/hub - ATProto recovery anchor (explorations 0243/0322/0338/0389).
 *
 * Implements `RecoveryAnchorProvider` against the ATProto binding. At recovery
 * time the hub confirms, fully server-side, four things:
 *
 *  - **live control of the account, now** — the caller presents a nonce this
 *    hub minted, and the matching challenge record is in the user's repo on the
 *    PDS the DID document names (see `./atproto-challenge.ts`);
 *  - the binding record resolves and is signed by the SAME xNet key the anchor
 *    was enrolled under (`boundXnetDid`), and names the expected ATProto DID;
 *  - the canonical PDS advertises an authorization server (the "lying AS"
 *    guard from 0322's open questions);
 *  - the binding is within the configured freshness window.
 *
 * The first check is the one that makes the other three mean anything. Before
 * it existed (0389), every input to this decision was public: the binding
 * record, the AS document and the timestamp are all readable by anyone, the
 * ceremony `code` was accepted and discarded, and `/release` is unauthenticated
 * — so knowing a victim's xNet DID was enough to collect their sealed blob and
 * brute-force the PIN offline. A standing fact cannot authorise a release; only
 * a fresh proof can.
 *
 * Only then does the escrow store release the PIN-sealed blob, which the hub
 * can never open.
 */

import type { AtprotoBindingVerifier } from './atproto-binding'
import type { RecoveryChallengeStore } from './atproto-challenge'
import { ATPROTO_CHALLENGE_COLLECTION, ATPROTO_CHALLENGE_RKEY } from './atproto-challenge'
import type {
  RecoveryAnchorProvider,
  RecoveryCeremonyStart,
  RecoveryCeremonyVerification
} from '@xnetjs/identity'

export interface AtprotoRecoveryAnchorOptions {
  /** Max age of the binding record accepted at release (default: 365 days). */
  maxBindingAgeMs?: number
  /** Max age of the challenge RECORD in the repo (default: 15 minutes). */
  maxChallengeRecordAgeMs?: number
  now?: () => number
  /** Base URL the ceremony should return to. */
  authorizeBaseUrl?: string
}

const DEFAULT_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000
/**
 * Slightly longer than the nonce TTL so a clock skew between hub and PDS shows
 * up as a retry rather than a mysterious denial; the nonce TTL is the real
 * bound, and it is enforced by the store.
 */
const DEFAULT_MAX_CHALLENGE_RECORD_AGE_MS = 15 * 60 * 1000

export class AtprotoRecoveryAnchor implements RecoveryAnchorProvider {
  readonly kind = 'atproto'
  private maxAgeMs: number
  private maxChallengeRecordAgeMs: number
  private now: () => number
  private authorizeBaseUrl: string

  /**
   * The challenge store is a REQUIRED constructor argument, not an option.
   * Making it optional would let a caller silently reconstruct the release path
   * that had no proof of live control in it — the exact bug this closes.
   */
  constructor(
    private verifier: AtprotoBindingVerifier,
    private challenges: RecoveryChallengeStore,
    options: AtprotoRecoveryAnchorOptions = {}
  ) {
    this.maxAgeMs = options.maxBindingAgeMs ?? DEFAULT_MAX_AGE_MS
    this.maxChallengeRecordAgeMs =
      options.maxChallengeRecordAgeMs ?? DEFAULT_MAX_CHALLENGE_RECORD_AGE_MS
    this.now = options.now ?? Date.now
    this.authorizeBaseUrl = options.authorizeBaseUrl ?? 'https://bsky.social/oauth/authorize'
  }

  async beginCeremony(input: {
    state: string
    redirectUri: string
  }): Promise<RecoveryCeremonyStart> {
    const url = new URL(this.authorizeBaseUrl)
    url.searchParams.set('state', input.state)
    url.searchParams.set('redirect_uri', input.redirectUri)
    return { url: url.toString(), state: input.state }
  }

  /**
   * `input.code` is the opaque proof from the completed ceremony. For this
   * anchor that is the challenge nonce the hub minted (WorkOS, the sibling
   * anchor, genuinely exchanges an OAuth code — the contract stays one field).
   */
  async verifyCeremony(input: {
    code: string
    expectedSubject: string
    boundXnetDid: string
  }): Promise<RecoveryCeremonyVerification> {
    const atprotoDid = input.expectedSubject

    // ─── Proof of LIVE control, before anything else ──────────────────────
    // Consuming first means a replayed request burns its nonce even if a later
    // check would have failed, and costs us nothing when the caller is honest.
    const challenge = this.challenges.consume(input.boundXnetDid, input.code)
    if (!challenge) {
      return {
        verified: false,
        subject: atprotoDid,
        reason: 'Unknown, expired, or already-used recovery challenge'
      }
    }

    const check = await this.verifier.verify(atprotoDid, input.boundXnetDid)
    if (!check.ok) {
      return { verified: false, subject: atprotoDid, reason: check.reason }
    }

    // The nonce alone proves only that the caller spoke to this hub. The record
    // proves they can write to the bound repo, which is what "control of the
    // account" means — and it is read from the DID document's PDS, so naming a
    // repo the caller owns does not help.
    const proof = await this.verifier.fetchCanonicalRecord(
      atprotoDid,
      ATPROTO_CHALLENGE_COLLECTION,
      ATPROTO_CHALLENGE_RKEY
    )
    if (!proof.ok) {
      return { verified: false, subject: atprotoDid, reason: proof.reason }
    }
    const proofValue = (proof.value ?? {}) as {
      nonce?: unknown
      xnetDid?: unknown
      createdAt?: unknown
    }
    if (proofValue.nonce !== challenge.nonce) {
      return {
        verified: false,
        subject: atprotoDid,
        reason: 'Challenge record does not carry the issued nonce'
      }
    }
    // Bound to the DID being recovered, so a challenge record written for one
    // account can never release another's escrow.
    if (proofValue.xnetDid !== input.boundXnetDid) {
      return {
        verified: false,
        subject: atprotoDid,
        reason: 'Challenge record names a different xNet DID'
      }
    }
    const proofAge = this.now() - Date.parse(String(proofValue.createdAt))
    if (!Number.isFinite(proofAge) || proofAge > this.maxChallengeRecordAgeMs || proofAge < 0) {
      return {
        verified: false,
        subject: atprotoDid,
        reason: 'Challenge record is stale'
      }
    }

    // "Lying AS" guard (0322): the DID document's PDS must actually advertise an
    // authorization server. A hostile client naming an unrelated AS cannot pass
    // because we resolve the AS from the DID-document PDS, not from the request.
    const issuer = await this.verifier.resolveAuthorizationServer(check.binding.pds)
    if (!issuer) {
      return {
        verified: false,
        subject: atprotoDid,
        reason: 'Could not resolve the authorization server for the canonical PDS'
      }
    }

    // Freshness: the binding must not be older than the configured window.
    const age = this.now() - Date.parse(check.binding.createdAt)
    if (!Number.isFinite(age) || age > this.maxAgeMs) {
      return {
        verified: false,
        subject: atprotoDid,
        reason: 'Binding record is outside the freshness window'
      }
    }

    return { verified: true, subject: atprotoDid }
  }
}
