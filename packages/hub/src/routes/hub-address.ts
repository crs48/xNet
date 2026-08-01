/**
 * @xnetjs/hub - The hub's own address record (exploration 0423).
 *
 * `GET /.well-known/xnet-hub-address` returns a record, signed by the hub's
 * system identity, saying where this hub currently is. The hub is the only
 * party that can authoritatively answer that, which is exactly why it signs:
 * a resolver may mirror the record for clients that cannot reach the hub yet,
 * but a mirror that could rewrite `url` would be a redirect primitive.
 *
 * The name a record speaks for is the hub's own DID (the one already published
 * on `/health` for UCAN audiences). That keeps the hub self-describing without
 * inventing an ownership concept it does not otherwise have — and it means a
 * client that has ever completed a claim already holds the name it needs.
 *
 * Unauthenticated on purpose: the record contains an address the client is
 * about to dial anyway, and gating it behind auth would require reaching the
 * hub to find out where the hub is.
 */

import type { HubIdentity } from '../hub-identity'
import { Hono } from 'hono'
import { signHubAddress, type HubAddressRecord } from '../services/hub-address'

export const HUB_ADDRESS_PATH = '/.well-known/xnet-hub-address'

/** Default record lifetime. Short enough that a migration heals in minutes. */
const DEFAULT_TTL_MS = 5 * 60_000

export type HubAddressRoutesOptions = {
  /** This hub's reachable URL (`config.publicUrl`). */
  url: string
  /** Alternates a client should try before giving up (e.g. a LAN address). */
  fallbacks?: readonly string[]
  ttlMs?: number
  /** Injectable clock for deterministic tests. */
  now?: () => number
}

/** Build the current record for this hub, signed with its system key. */
export function buildHubAddressRecord(
  identity: HubIdentity,
  options: HubAddressRoutesOptions
): HubAddressRecord {
  const issuedAt = (options.now ?? Date.now)()
  return signHubAddress(
    {
      did: identity.did,
      hubDid: identity.did,
      url: options.url,
      ...(options.fallbacks && options.fallbacks.length > 0
        ? { fallbacks: [...options.fallbacks] }
        : {}),
      status: 'ready',
      issuedAt,
      validUntil: issuedAt + (options.ttlMs ?? DEFAULT_TTL_MS)
    },
    identity.privateKey
  )
}

export const createHubAddressRoutes = (
  identity: HubIdentity,
  options: HubAddressRoutesOptions
): Hono => {
  const app = new Hono()

  app.get('/', (c) => {
    // A hub that does not know its own public URL must say so rather than
    // publish an empty address that reads as "resolved, nowhere to connect".
    if (!options.url) {
      return c.json({ error: 'Hub has no configured public URL', code: 'NO_PUBLIC_URL' }, 503)
    }
    const record = buildHubAddressRecord(identity, options)
    c.header('Cache-Control', `public, max-age=${Math.floor((record.validUntil - record.issuedAt) / 1000)}`)
    return c.json(record)
  })

  return app
}
