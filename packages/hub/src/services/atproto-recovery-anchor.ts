/**
 * @xnetjs/hub - ATProto recovery anchor (explorations 0243/0322/0338).
 *
 * Implements `RecoveryAnchorProvider` against the ATProto binding: at recovery
 * time the user proves control of their ATProto account, and the hub confirms —
 * fully server-side — that:
 *
 *  - the binding record resolves and is signed by the SAME xNet key the anchor
 *    was enrolled under (`boundXnetDid`), and names the expected ATProto DID;
 *  - the resolved PDS's authorization-server issuer matches the DID document's
 *    canonical PDS (the "lying AS" guard from 0322's open questions);
 *  - the binding is within the configured freshness window.
 *
 * Only then does the escrow store release the PIN-sealed blob (which the hub
 * can never open). Binding a *fresh interactive OAuth session* to the release
 * (vs. the standing binding record) requires the hub to act as a confidential
 * OAuth client (0301 Phase 2) and is the intended hardening; this anchor does
 * the DID-doc / issuer / signature / freshness checks available today.
 */

import type { AtprotoBindingVerifier } from './atproto-binding'
import type {
  RecoveryAnchorProvider,
  RecoveryCeremonyStart,
  RecoveryCeremonyVerification
} from '@xnetjs/identity'

export interface AtprotoRecoveryAnchorOptions {
  /** Max age of the binding record accepted at release (default: 365 days). */
  maxBindingAgeMs?: number
  now?: () => number
  /** Base URL the ceremony should return to. */
  authorizeBaseUrl?: string
}

const DEFAULT_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000

export class AtprotoRecoveryAnchor implements RecoveryAnchorProvider {
  readonly kind = 'atproto'
  private maxAgeMs: number
  private now: () => number
  private authorizeBaseUrl: string

  constructor(
    private verifier: AtprotoBindingVerifier,
    options: AtprotoRecoveryAnchorOptions = {}
  ) {
    this.maxAgeMs = options.maxBindingAgeMs ?? DEFAULT_MAX_AGE_MS
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

  async verifyCeremony(input: {
    code: string
    expectedSubject: string
    boundXnetDid: string
  }): Promise<RecoveryCeremonyVerification> {
    const atprotoDid = input.expectedSubject
    const check = await this.verifier.verify(atprotoDid, input.boundXnetDid)
    if (!check.ok) {
      return { verified: false, subject: atprotoDid, reason: check.reason }
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
