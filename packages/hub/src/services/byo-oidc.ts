/**
 * @xnetjs/hub - Bring-your-own-OIDC inbound (exploration 0338 Phase 3).
 *
 * An org points its hub at its existing identity provider (Google Workspace,
 * Entra, Keycloak, Okta, …) — the Tailscale "custom OIDC" pattern. A verified
 * IdP session ADMITS a device into the org's account ledger (0149); it never
 * holds keys. The IdP sees only *that a device was admitted* (a login event),
 * never workspace content — content keys are E2E and re-wrapped through the
 * ledger, not the IdP.
 *
 * This module verifies an OIDC `id_token` against a configured issuer + JWKS
 * and returns the subject to admit. Production resolves the JWKS remotely
 * (`createRemoteJWKSet(issuer/.well-known/jwks.json)`); the resolver is
 * injected so it can be verified against a local key in tests.
 */

import { type JWTPayload, type JWTVerifyGetKey, jwtVerify } from 'jose'

export interface ByoOidcConfig {
  /** Issuer identifier that must match the token `iss`. */
  issuer: string
  /** Expected audience (this hub's registered client_id at the IdP). */
  clientId: string
}

export type ByoOidcResult =
  | { ok: true; subject: string; email?: string; claims: JWTPayload }
  | { ok: false; reason: string }

/**
 * Verify an inbound OIDC id_token. `getKey` is a JWKS resolver — in production
 * `createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`))`.
 */
export async function verifyByoOidcToken(input: {
  idToken: string
  config: ByoOidcConfig
  getKey: JWTVerifyGetKey
}): Promise<ByoOidcResult> {
  try {
    const { payload } = await jwtVerify(input.idToken, input.getKey, {
      issuer: input.config.issuer,
      audience: input.config.clientId
    })
    if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
      return { ok: false, reason: 'id_token has no subject' }
    }
    return {
      ok: true,
      subject: payload.sub,
      ...(typeof payload.email === 'string' ? { email: payload.email } : {}),
      claims: payload
    }
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : 'Token verification failed' }
  }
}
