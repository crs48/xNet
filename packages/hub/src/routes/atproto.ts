/**
 * @xnetjs/hub - ATProto binding verification routes (0301/0322/0337).
 *
 * Clients ask their hub — not the PDS directly — whether a profile's claimed
 * ATProto identity is genuinely bound to its xNet DID; the hub does the DID-doc
 * resolution, record fetch, and signature check server-side and caches the
 * result. Verification is read-only public identity, but it triggers outbound
 * fetches, so it sits behind auth like the rest of the identity surface.
 */

import type { AtprotoBindingVerifier } from '../services/atproto-binding'
import { Hono } from 'hono'

export const createAtprotoRoutes = (verifier: AtprotoBindingVerifier): Hono => {
  const app = new Hono()

  // GET /binding/:did?xnet=<did:key:…> — verify (and cache) the binding.
  app.get('/binding/:did', async (c) => {
    const atprotoDid = c.req.param('did')
    const expectedXnet = c.req.query('xnet') || undefined
    const result = await verifier.verify(atprotoDid, expectedXnet)
    if (!result.ok) {
      return c.json({ verified: false, reason: result.reason }, 200)
    }
    return c.json({ verified: true, cached: result.cached, binding: result.binding })
  })

  // POST /binding/:did/recheck — drop the cache entry and re-verify (e.g.
  // after unlinking, a handle move, or an operator intervention).
  app.post('/binding/:did/recheck', async (c) => {
    const atprotoDid = c.req.param('did')
    verifier.revoke(atprotoDid)
    const result = await verifier.verify(atprotoDid)
    if (!result.ok) {
      return c.json({ verified: false, reason: result.reason }, 200)
    }
    return c.json({ verified: true, cached: false, binding: result.binding })
  })

  return app
}
