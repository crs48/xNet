/**
 * Knot handshake (0372/0389): the hub announces its owner and a hostname
 * attestation so the ATmosphere can enumerate self-hosted hubs with no
 * registry. These tests pin the hub-side half and the signature property.
 */
import { describe, expect, it } from 'vitest'
import { generateIdentity } from '@xnetjs/identity'
import { verify, base64ToBytes, extractEd25519PubKey } from '@xnetjs/crypto'
import { createKnotRoutes, hubOwnerSigningMessage, HUB_CLAIM_COLLECTION } from '../src/routes/knot'

const hub = generateIdentity()
const owner = generateIdentity()

const get = (app: ReturnType<typeof createKnotRoutes>, host = 'hub.example') =>
  app.request('/fyi.xnet.owner', { headers: { host } })

describe('GET /xrpc/fyi.xnet.owner', () => {
  it('announces owner, hub DID, hostname and collection', async () => {
    const app = createKnotRoutes({
      hubDid: hub.identity.did,
      hubSigningKey: hub.privateKey,
      ownerDid: owner.identity.did
    })
    const body = (await (await get(app)).json()) as Record<string, unknown>
    expect(body.owner).toBe(owner.identity.did)
    expect(body.hubDid).toBe(hub.identity.did)
    expect(body.hostname).toBe('hub.example')
    expect(body.collection).toBe(HUB_CLAIM_COLLECTION)
  })

  it('answers even when the hub is unclaimed, with owner null', async () => {
    const app = createKnotRoutes({ hubDid: hub.identity.did, hubSigningKey: hub.privateKey })
    const body = (await (await get(app)).json()) as Record<string, unknown>
    expect(body.owner).toBeNull()
    expect(body.hubDid).toBe(hub.identity.did)
  })

  it('signs the hostname with the hub key so the endpoint cannot be spoofed', async () => {
    const app = createKnotRoutes({
      hubDid: hub.identity.did,
      hubSigningKey: hub.privateKey,
      ownerDid: owner.identity.did
    })
    const body = (await (await get(app, 'knot.example.org')).json()) as {
      hostname: string
      signature: string
    }
    const ok = verify(
      hubOwnerSigningMessage(body.hostname),
      base64ToBytes(body.signature),
      extractEd25519PubKey(hub.identity.did)!
    )
    expect(ok).toBe(true)
  })

  it('binds the signature to the hostname reached, foiling a copied document', async () => {
    const app = createKnotRoutes({
      hubDid: hub.identity.did,
      hubSigningKey: hub.privateKey,
      ownerDid: owner.identity.did
    })
    const body = (await (await get(app, 'real.example')).json()) as { signature: string }
    // An attacker replays the document under their own hostname; the signature
    // is over 'real.example', so validation against 'evil.example' fails.
    const ok = verify(
      hubOwnerSigningMessage('evil.example'),
      base64ToBytes(body.signature),
      extractEd25519PubKey(hub.identity.did)!
    )
    expect(ok).toBe(false)
  })

  it('prefers x-forwarded-host behind a proxy', async () => {
    const app = createKnotRoutes({ hubDid: hub.identity.did, hubSigningKey: hub.privateKey })
    const res = await app.request('/fyi.xnet.owner', {
      headers: { host: 'internal:4444', 'x-forwarded-host': 'hub.public.example' }
    })
    const body = (await res.json()) as { hostname: string }
    expect(body.hostname).toBe('hub.public.example')
  })
})
