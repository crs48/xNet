/**
 * Regression: an ownerless Space must not be shareable by a non-owner.
 *
 * A 'space' share link is a CONTAINER grant — claiming one writes a grant keyed
 * on the Space id, which the hub resolves for every node beneath that Space. So
 * whoever may mint one effectively controls the whole subtree.
 *
 * `canManageShares` used to fall back to "possession of the doc id ≡ access"
 * whenever `getDocMeta` returned nothing. `doc_meta.ownerDid` is written ONLY by
 * the optional `index-update` message, gated on `enableSearchIndex`, which
 * defaults to false and is set by no shipped app — so in practice EVERY Space
 * was ownerless and any authenticated DID that learned a Space id could mint
 * invite links to that Space's entire subtree.
 */

import { createUCAN, generateKeyBundle, type KeyBundle } from '@xnetjs/identity'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createHub, type HubInstance } from '../src'
import { syncSpaceAs } from './helpers/space-sync'

const PORT = 14499
const BASE = `http://localhost:${PORT}`

type Actor = { bundle: KeyBundle; did: string; token: string }

const makeActor = (): Actor => {
  const bundle = generateKeyBundle()
  // Self-issued wildcard capabilities, exactly as XNetProvider mints them.
  // This is the point: every authenticated DID carries `{with:'*',can:'*'}`,
  // so capability checks alone never distinguish an owner from a stranger.
  const token = createUCAN({
    issuer: bundle.identity.did,
    issuerKey: bundle.signingKey,
    audience: 'did:key:hub',
    capabilities: [{ with: '*', can: '*' }]
  })
  return { bundle, did: bundle.identity.did, token }
}

const api = async (
  path: string,
  options: { method?: string; token?: string; body?: unknown } = {}
): Promise<{ status: number; json: Record<string, unknown> }> => {
  const response = await fetch(`${BASE}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {})
    },
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {})
  })
  const json = (await response.json().catch(() => ({}))) as Record<string, unknown>
  return { status: response.status, json }
}

const mintLink = (actor: Actor, docId: string, docType: string) =>
  api('/shares/links', {
    method: 'POST',
    token: actor.token,
    body: { docId, docType, role: 'write' }
  })

describe('Space share-link ownership', () => {
  let hub: HubInstance
  let owner: Actor
  let stranger: Actor

  beforeAll(async () => {
    hub = await createHub({
      port: PORT,
      auth: true,
      storage: 'memory',
      publicUrl: `ws://localhost:${PORT}`
    })
    await hub.start()
    owner = makeActor()
    stranger = makeActor()
  })

  afterAll(async () => {
    await hub?.stop()
  })

  it('refuses share links on an ownerless Space (the escalation path)', async () => {
    // A Space id the hub has never seen: no doc_meta, no owner record, no
    // changes. Possession of the id alone must not confer authority, because
    // the grant it would mint covers the Space's whole subtree.
    const spaceId = 'space-never-synced'

    const { status, json } = await mintLink(stranger, spaceId, 'space')

    expect(status).toBe(403)
    expect(json.code).toBe('FORBIDDEN')
  })

  it('lets the DID that created the Space mint links for it', async () => {
    const spaceId = 'space-owned-by-owner'
    await syncSpaceAs(PORT, owner, spaceId)

    const { status, json } = await mintLink(owner, spaceId, 'space')

    expect(status).toBe(200)
    expect(json.docId).toBe(spaceId)
  })

  it('refuses a stranger who knows the id of a Space someone else created', async () => {
    const spaceId = 'space-owned-by-someone-else'
    await syncSpaceAs(PORT, owner, spaceId)

    const { status, json } = await mintLink(stranger, spaceId, 'space')

    expect(status).toBe(403)
    expect(json.code).toBe('FORBIDDEN')
  })

  it('does not let a later writer seize ownership of a Space', async () => {
    // First writer wins: relaying a change to a Space you did not create must
    // not make you its owner, or the check above is trivially bypassed.
    const spaceId = 'space-contested'
    await syncSpaceAs(PORT, owner, spaceId)
    await syncSpaceAs(PORT, stranger, spaceId, 2)

    expect((await mintLink(stranger, spaceId, 'space')).status).toBe(403)
    expect((await mintLink(owner, spaceId, 'space')).status).toBe(200)
  })

  it('still allows the legacy ownerless fallback for single-doc types', async () => {
    // The fallback is only refused for container-granting types. A 'page'
    // grant covers one document, and legacy docs that predate any ownership
    // record must keep working.
    const { status } = await mintLink(stranger, 'page-never-synced', 'page')

    expect(status).toBe(200)
  })
})
