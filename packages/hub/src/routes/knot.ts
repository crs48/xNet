/**
 * @xnetjs/hub — the knot handshake (explorations 0372/0389).
 *
 * Makes a self-hosted hub enumerable in the ATmosphere with no registry xNet
 * operates — "mirror, not master" made mechanical (0360). It is the two-sided,
 * registry-free, secret-free binding Tangled uses for its knots, pointed at
 * xNet hubs:
 *
 *  - **Hub side (here):** `GET /xrpc/fyi.xnet.owner` returns the hub's owner
 *    DID, the hub's own system DID, the hostname, and a signature over the
 *    hostname by the hub key. Anyone can read it; nothing secret is exposed.
 *  - **Owner side (the user's repo, not here):** a `fyi.xnet.hub` record with
 *    the hostname as its rkey, so `com.atproto.sync.listReposByCollection`
 *    enumerates every hub an account claims — network-wide, sub-second (0372).
 *
 * The binding is genuine only when BOTH halves agree: the hub names an owner,
 * and that owner's repo names the hub back. Neither half alone proves anything,
 * which is what lets the whole thing run without a registry.
 *
 * The hostname signature is "one better than Tangled" (0372): a reader can
 * confirm the hub at this hostname actually holds the key it claims, so a
 * man-in-the-middle serving a copied `owner` document cannot impersonate the
 * hub without also holding its private key.
 *
 * THE RULE (0371): the hub key signs TRANSPORT, never content. Signing the
 * hostname is a transport attestation ("this endpoint is me"), not authorship.
 */

import { Hono } from 'hono'
import { sign, bytesToBase64 } from '@xnetjs/crypto'

/** The collection an owner's repo uses to claim a hub (rkey = hostname). */
export const HUB_CLAIM_COLLECTION = 'fyi.xnet.hub'

/** The message the hub key signs: a domain-separated hostname attestation. */
export function hubOwnerSigningMessage(hostname: string): Uint8Array {
  return new TextEncoder().encode(`xnet-hub-owner.v1\n${hostname}`)
}

export interface KnotRouteConfig {
  /** The hub's own system DID (transport identity). */
  hubDid: string
  /** The hub's Ed25519 private key, for the hostname attestation. */
  hubSigningKey: Uint8Array
  /**
   * The operator's xNet DID this hub claims to belong to. Optional: an
   * unclaimed hub still answers, with `owner: null`, so the endpoint is always
   * probeable and the absence is explicit rather than a 404.
   */
  ownerDid?: string
}

export const createKnotRoutes = (config: KnotRouteConfig): Hono => {
  const app = new Hono()

  app.get('/fyi.xnet.owner', (c) => {
    // Prefer the forwarded host (behind a proxy) but fall back to the Host
    // header; the signature binds whichever hostname a client actually reached
    // us at, so a reader validating against the URL they used always matches.
    const hostname =
      c.req.header('x-forwarded-host') ?? c.req.header('host') ?? new URL(c.req.url).host
    const signature = bytesToBase64(sign(hubOwnerSigningMessage(hostname), config.hubSigningKey))
    return c.json({
      owner: config.ownerDid ?? null,
      hubDid: config.hubDid,
      hostname,
      collection: HUB_CLAIM_COLLECTION,
      signature
    })
  })

  return app
}
