/**
 * @xnetjs/react/onboarding - ATProto login-door ceremony contract (0322/0338).
 *
 * The actual OAuth 2.1 / PKCE / DPoP dance lives in `@atproto/oauth-client-*`,
 * which is heavy and browser/redirect-bound. To keep `@xnetjs/react`
 * dependency-light and unit-testable, the ceremony is *injected*: the host app
 * (apps/web, apps/electron) provides a `runAtprotoCeremony` that resolves to
 * the linked identity, and — after the xNet passkey identity is created — a
 * `writeBinding` that puts the signed `net.x.identity.binding` record into the
 * user's repo. The onboarding machine wires the two around the existing
 * passkey-create step.
 */

export interface AtprotoCeremonyResult {
  /** The proven ATProto DID (`did:plc:…` / `did:web:…`). */
  atprotoDid: string
  /** The handle the user authenticated with (e.g. `alice.bsky.social`). */
  atprotoHandle: string
  /** Optional display name pulled from the ATProto profile, to pre-fill xNet. */
  displayName?: string
  /**
   * Finish the binding once the xNet identity exists: sign
   * `net.x.identity.binding` with the new xNet key and `putRecord` it. Called
   * with the freshly created xNet DID + signing key. Optional — a login-only
   * flow may skip writing the binding record.
   */
  writeBinding?: (xnetDid: string, signingKey: Uint8Array) => Promise<void>
}

/** Start the ATProto OAuth ceremony for a handle/PDS the user typed. */
export type RunAtprotoCeremony = (input: {
  /** Handle or PDS host the user entered, e.g. `alice.bsky.social`. */
  handleOrPds: string
}) => Promise<AtprotoCeremonyResult>
