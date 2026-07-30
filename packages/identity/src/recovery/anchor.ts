/**
 * RecoveryAnchorProvider (explorations 0243/0322/0338).
 *
 * A *recovery anchor* is an external identity a user proves control of to
 * release their (PIN-sealed) recovery secret: WorkOS for paying cloud tenants,
 * an ATProto identity for anyone with a Bluesky/PDS account. Both write the
 * SAME escrow envelope (`sealEscrow`, 0243 P3.1) — the cloud/hub holds only the
 * PIN-sealed blob and can never open it alone. This is the generalization of
 * the cloud-only `BillingIdentityProvider` seam so ATProto and WorkOS are
 * siblings behind one contract.
 *
 * The provider does NOT hold keys or secrets. It only:
 *  1. begins an external proof ceremony (returns a URL to send the user to), and
 *  2. verifies, server-side, that a completed ceremony belongs to the SAME
 *     external subject the envelope was enrolled under, and to the SAME xNet
 *     identity the anchor was bound to.
 */

export interface RecoveryCeremonyStart {
  /** URL to send the user to (hosted OAuth / AuthKit / PDS authorize). */
  url: string
  /** Opaque state to correlate the callback. */
  state: string
}

export interface RecoveryCeremonyVerification {
  /** True only if the ceremony proves control of the expected subject. */
  verified: boolean
  /** The external subject id proven (atproto DID / WorkOS user id). */
  subject: string
  /** Optional human detail for logs / denial reasons. */
  reason?: string
}

export interface RecoveryAnchorProvider {
  /** Stable kind, e.g. `atproto` | `workos`. */
  readonly kind: string

  /** Begin the external proof ceremony. */
  beginCeremony(input: { state: string; redirectUri: string }): Promise<RecoveryCeremonyStart>

  /**
   * Verify, server-side, that a completed ceremony proves control of
   * `expectedSubject` and is bound to `boundXnetDid`. Implementations MUST do
   * full verification (e.g. atproto: resolve DID doc, check the AS issuer
   * matches the canonical PDS, fetch + verify the binding record, enforce a
   * freshness window) — never trust a client's claim of where it happened.
   */
  verifyCeremony(input: {
    code: string
    expectedSubject: string
    boundXnetDid: string
  }): Promise<RecoveryCeremonyVerification>
}

/**
 * The envelope both anchors persist. The `anchor` block records which external
 * identity may release it; the sealed bytes are `serializeEscrow(sealEscrow(...))`.
 */
export interface RecoveryAnchorEnrollment {
  anchor: { kind: string; subject: string }
  /** The xNet DID this anchor recovers. */
  xnetDid: string
  /** PIN-sealed, serialized escrow envelope (opaque to the cloud/hub). */
  sealedEscrow: Uint8Array
  enrolledAt: number
}
