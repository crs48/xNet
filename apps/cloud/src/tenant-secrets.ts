/**
 * xNet Cloud — per-tenant derived credentials (exploration 0436, Phase S).
 *
 * Every credential a managed hub is provisioned with must speak for **that one
 * tenant and no other**. Before this module, `hubEnv` copied two fleet-wide
 * secrets into every container: `XNET_CLOUD_INTERNAL_SECRET` (which also gated
 * the control plane's `/internal/*` reads) and `XNET_PLAN_SECRET` (which signs
 * every tenant's entitlements). Reading one container's environment therefore
 * yielded the fleet.
 *
 * The fix is the construction `diagnosticsSecretFor` already uses, applied to
 * the other two credentials: derive `hmac(master, purpose + tenantId)`, inject
 * the derivation, and keep the master in the control plane. A leaked hub env is
 * then worth exactly one tenant.
 *
 * Two shapes, deliberately different:
 *
 *  - **Self-identifying** (`<tenantId>.<hmac>`) for credentials the control
 *    plane must *verify and attribute* — the AI gateway token. The tenant is
 *    read OUT of the credential, so there is no sibling header left to lie in
 *    (the `x-tenant-id` hole, exploration 0436 G2).
 *  - **Opaque** for credentials only ever used as a key — the plan-signing
 *    secret. The hub verifies its own token with it and never sees another's.
 */

import { createHmac, timingSafeEqual } from 'node:crypto'

const hmacHex = (masterSecret: string, message: string): string =>
  createHmac('sha256', masterSecret).update(message).digest('hex')

/**
 * A self-identifying per-tenant credential: `<tenantId>.<hmac32>`.
 *
 * The tenant id is in the clear on purpose — it is not a secret, and carrying
 * it inside the credential is what lets the verifier attribute the caller in
 * O(1) without trusting a separate header.
 */
const selfIdentifying = (master: string, purpose: string, tenantId: string): string =>
  `${tenantId}.${hmacHex(master, `${purpose}:${tenantId}`).slice(0, 32)}`

/**
 * Verify a self-identifying credential and return the tenant it speaks for, or
 * null. Constant-time compare; a mismatched length short-circuits before the
 * compare because `timingSafeEqual` throws on unequal buffers.
 */
const tenantFromSelfIdentifying = (
  master: string,
  purpose: string,
  presented: string | undefined
): string | null => {
  if (!master || !presented) return null
  const dot = presented.lastIndexOf('.')
  if (dot <= 0) return null
  const tenantId = presented.slice(0, dot)
  const expected = selfIdentifying(master, purpose, tenantId)
  const a = Buffer.from(presented)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b) ? tenantId : null
}

// ─── Managed-AI gateway token ───────────────────────────────────────────────

/**
 * The credential a tenant's hub presents to `POST /ai/chat`, injected as
 * `XNET_CLOUD_GATEWAY_TOKEN`.
 *
 * This replaces the pair (`x-internal-secret` = fleet master, `x-tenant-id` =
 * whatever the caller typed). The tenant is derived FROM the token, so a hub
 * holding tenant A's token cannot spend tenant B's AI budget no matter what
 * headers it sends.
 */
export function gatewayTokenFor(master: string, tenantId: string): string {
  return selfIdentifying(master, 'gw', tenantId)
}

/** Verify a gateway token; returns its tenantId, or null when invalid. */
export function tenantFromGatewayToken(
  master: string,
  presented: string | undefined
): string | null {
  return tenantFromSelfIdentifying(master, 'gw', presented)
}

/** Pull a bearer token out of an `Authorization` header, or null. */
export function bearerToken(authHeader: string | undefined): string | null {
  if (!authHeader) return null
  const [scheme, token] = authHeader.split(' ')
  if (!scheme || !token || scheme.toLowerCase() !== 'bearer') return null
  return token.trim() || null
}

// ─── Entitlement signing key ────────────────────────────────────────────────

/**
 * The per-tenant `XNET_PLAN_SECRET` a hub verifies its own `HUB_PLAN` with.
 *
 * Opaque rather than self-identifying: the hub never verifies another tenant's
 * token, so there is nothing to attribute. What matters is that a hub env
 * cannot be used to MINT an entitlement for anyone else — with a derived key,
 * forging `enterprise` for a different tenant needs the master.
 */
export function planSecretFor(master: string, tenantId: string): string {
  return hmacHex(master, `plan:${tenantId}`)
}

/**
 * Key-generation stamp written alongside the derived secret as `HUB_PLAN_KID`.
 *
 * Purely an audit signal: a rollout can read it back through
 * `provisioner.get()` and tell, per tenant, whether that hub is still holding
 * the fleet master (`fleet`) or has been re-keyed (`t/<tenantId>`). Without it
 * "the fleet has been re-keyed" is an assertion nobody can check, and a
 * half-finished re-key looks exactly like a finished one.
 */
export function planKeyIdFor(tenantId: string): string {
  return `t/${tenantId}`
}

/** The stamp a hub still holding the fleet-wide master carries. */
export const LEGACY_PLAN_KEY_ID = 'fleet'
