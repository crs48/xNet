/**
 * @xnetjs/hub - BYO-OIDC device-admission route (exploration 0338 Phase 3).
 *
 * POST /admit — a new org member presents an IdP `id_token` and the device DID
 * they want admitted. The hub verifies the token against the configured issuer
 * + JWKS and, on success, records an admission intent for that device under the
 * IdP subject. The IdP session ADMITS a device; it never holds keys, and it
 * sees only that an admission happened (see docs/hub-identity-provider.md).
 *
 * The actual `DeviceRecord` write is a signed account-ledger change authored by
 * an existing controller (enforced by the relay's ledger guard). This endpoint
 * gates *who may be admitted* on the IdP proof; it does not bypass the ledger.
 */

import type { ByoOidcConfig } from '../services/byo-oidc'
import type { JWTVerifyGetKey } from 'jose'
import { Hono } from 'hono'
import { verifyByoOidcToken } from '../services/byo-oidc'
import { isRecord } from '../utils/validation'

export interface ByoOidcAdmission {
  subject: string
  deviceDid: string
  email?: string
  admittedAt: number
}

export const createByoOidcRoutes = (input: {
  config: ByoOidcConfig
  getKey: JWTVerifyGetKey
  /** Record an admission intent (consumed when a controller writes the DeviceRecord). */
  onAdmit: (admission: ByoOidcAdmission) => void | Promise<void>
}): Hono => {
  const app = new Hono()

  app.post('/admit', async (c) => {
    const body = await c.req.json().catch(() => null)
    if (!isRecord(body)) return c.json({ error: 'Invalid body' }, 400)
    const idToken = typeof body.idToken === 'string' ? body.idToken : ''
    const deviceDid = typeof body.deviceDid === 'string' ? body.deviceDid : ''
    if (!idToken || !deviceDid.startsWith('did:')) {
      return c.json({ error: 'Missing idToken or deviceDid' }, 400)
    }

    const result = await verifyByoOidcToken({ idToken, config: input.config, getKey: input.getKey })
    if (!result.ok) {
      return c.json({ admitted: false, reason: result.reason }, 403)
    }

    const admission: ByoOidcAdmission = {
      subject: result.subject,
      deviceDid,
      ...(result.email ? { email: result.email } : {}),
      admittedAt: Date.now()
    }
    await input.onAdmit(admission)
    // The IdP proved WHO may be admitted; a controller's signed ledger change
    // actually admits the device (keys never touch the IdP).
    return c.json({ admitted: true, subject: result.subject, deviceDid })
  })

  return app
}
