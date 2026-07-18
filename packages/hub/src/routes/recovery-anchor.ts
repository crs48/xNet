/**
 * @xnetjs/hub - Recovery-anchor escrow routes (explorations 0243/0322/0338).
 *
 * - POST /enroll  — store a PIN-sealed escrow blob under an ATProto anchor.
 *   Enrollment is authenticated (the enrolling DID must equal the xNet DID it
 *   is enrolling for), so nobody can plant an escrow record for someone else.
 * - POST /release — the recovery path: the anchor verifies the ceremony fully
 *   server-side (DID doc, AS issuer, binding record, freshness) and only then
 *   returns the sealed blob. The hub never sees the PIN or the opened secret.
 */

import type { AtprotoRecoveryAnchor } from '../services/atproto-recovery-anchor'
import type { EscrowStore } from '../services/escrow-store'
import { Hono } from 'hono'
import { isRecord } from '../utils/validation'

export const createRecoveryAnchorRoutes = (input: {
  store: EscrowStore
  anchor: AtprotoRecoveryAnchor
  /** The authenticated caller's DID, from the requireAuth middleware. */
  callerDid: (c: unknown) => string | null
}): Hono => {
  const app = new Hono()

  app.post('/enroll', async (c) => {
    const caller = input.callerDid(c)
    const body = await c.req.json().catch(() => null)
    if (!isRecord(body)) return c.json({ error: 'Invalid body' }, 400)
    const xnetDid = typeof body.xnetDid === 'string' ? body.xnetDid : ''
    const anchorSubject = typeof body.anchorSubject === 'string' ? body.anchorSubject : ''
    const sealedEscrowB64 = typeof body.sealedEscrowB64 === 'string' ? body.sealedEscrowB64 : ''
    if (!xnetDid || !anchorSubject || !sealedEscrowB64) {
      return c.json({ error: 'Missing xnetDid, anchorSubject, or sealedEscrowB64' }, 400)
    }
    // A DID may only enroll an escrow for itself.
    if (caller && caller !== xnetDid) {
      return c.json({ error: 'Can only enroll an escrow for your own DID' }, 403)
    }
    input.store.enroll({
      xnetDid,
      anchorKind: input.anchor.kind,
      anchorSubject,
      sealedEscrowB64,
      enrolledAt: Date.now()
    })
    return c.json({ ok: true })
  })

  app.post('/release', async (c) => {
    const body = await c.req.json().catch(() => null)
    if (!isRecord(body)) return c.json({ error: 'Invalid body' }, 400)
    const xnetDid = typeof body.xnetDid === 'string' ? body.xnetDid : ''
    const code = typeof body.code === 'string' ? body.code : ''
    if (!xnetDid || !code) return c.json({ error: 'Missing xnetDid or code' }, 400)

    const record = input.store.get(xnetDid)
    if (!record) return c.json({ error: 'No escrow enrolled for this DID' }, 404)

    const verification = await input.anchor.verifyCeremony({
      code,
      expectedSubject: record.anchorSubject,
      boundXnetDid: xnetDid
    })
    if (!verification.verified) {
      // Fail closed — never leak whether the blob exists beyond the 404 above.
      return c.json({ error: 'Ceremony verification failed', reason: verification.reason }, 403)
    }

    return c.json({ ok: true, sealedEscrowB64: record.sealedEscrowB64 })
  })

  return app
}
