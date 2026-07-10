/**
 * Durable share links (exploration 0169): lifecycle, claim → grant,
 * revocation, interstitial, and role enforcement on write paths.
 */

import type { SerializedNodeChange } from '../src/storage/interface'
import type { DID } from '@xnetjs/core'
import { bytesToBase64 } from '@xnetjs/crypto'
import { createUCAN, generateKeyBundle, type KeyBundle } from '@xnetjs/identity'
import { createUnsignedChange, signChange, createChangeId } from '@xnetjs/sync'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { WebSocket } from 'ws'
import { createHub, type HubInstance } from '../src'
import {
  isCommentSchema,
  roleFromActions,
  ShareAccessService,
  SHARE_ROLE_ACTIONS
} from '../src/services/share-access'
import { createMemoryStorage } from '../src/storage/memory'

const PORT = 14491
const BASE = `http://localhost:${PORT}`

type Actor = {
  bundle: KeyBundle
  did: string
  token: string
}

const makeActor = (): Actor => {
  const bundle = generateKeyBundle()
  // Clients self-issue wildcard capabilities (mirrors XNetProvider) — share
  // grant restrictions must override them on write paths.
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

const createLink = async (
  owner: Actor,
  docId: string,
  role: string,
  extra: Record<string, unknown> = {}
): Promise<{ linkId: string; url: string; secret: string }> => {
  const { status, json } = await api('/shares/links', {
    method: 'POST',
    token: owner.token,
    body: { docId, docType: 'page', role, ...extra }
  })
  expect(status).toBe(200)
  const url = json.url as string
  const secret = url.split('#s=')[1]
  expect(secret?.length).toBeGreaterThan(16)
  return { linkId: json.linkId as string, url, secret }
}

const claim = async (
  recipient: Actor,
  linkId: string,
  secret: string
): Promise<{ status: number; json: Record<string, unknown> }> =>
  api(`/shares/links/${linkId}/claim`, {
    method: 'POST',
    token: recipient.token,
    body: { secret }
  })

const connectWithToken = (token: string): Promise<WebSocket> =>
  new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${PORT}`, ['xnet-sync.v1', `xnet-auth.${token}`])
    ws.on('error', reject)
    ws.on('open', () => {
      ws.once('message', () => resolve(ws))
    })
  })

const waitForMessage = (ws: WebSocket): Promise<Record<string, unknown>> =>
  new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('timeout waiting for ws message')), 2000)
    ws.once('message', (data) => {
      clearTimeout(timeout)
      resolve(JSON.parse(data.toString()) as Record<string, unknown>)
    })
  })

const makeChange = (
  actor: Actor,
  docId: string,
  schemaId = 'xnet://xnet.dev/Task@1.0.0'
): SerializedNodeChange => {
  const payload = {
    nodeId: `node-${Math.random().toString(36).slice(2)}`,
    schemaId,
    properties: { title: 'change' }
  }
  const unsigned = createUnsignedChange({
    id: createChangeId(),
    type: 'node-change',
    payload,
    parentHash: null,
    authorDID: actor.did as DID,
    wallTime: Date.now(),
    lamport: 1
  })
  const signed = signChange(unsigned, actor.bundle.signingKey)
  return {
    id: signed.id,
    type: signed.type,
    hash: signed.hash,
    room: `xnet-doc-${docId}`,
    nodeId: payload.nodeId,
    schemaId: payload.schemaId,
    lamportTime: signed.lamport,
    lamportAuthor: signed.authorDID,
    authorDid: signed.authorDID,
    wallTime: signed.wallTime,
    parentHash: signed.parentHash,
    payload: signed.payload,
    signatureB64: bytesToBase64(signed.signature),
    protocolVersion: signed.protocolVersion
  }
}

const publishChange = async (
  actor: Actor,
  docId: string,
  schemaId?: string
): Promise<Record<string, unknown> | null> => {
  const ws = await connectWithToken(actor.token)
  const change = makeChange(actor, docId, schemaId)
  ws.send(
    JSON.stringify({
      type: 'publish',
      topic: change.room,
      data: { type: 'node-change', room: change.room, change }
    })
  )
  const result = await waitForMessage(ws).catch(() => null)
  ws.close()
  return result
}

describe('Share Links', () => {
  let hub: HubInstance
  let owner: Actor

  beforeAll(async () => {
    hub = await createHub({
      port: PORT,
      auth: true,
      storage: 'memory',
      publicUrl: `ws://localhost:${PORT}`
    })
    await hub.start()
    owner = makeActor()
  })

  afterAll(async () => {
    await hub.stop()
  })

  // The app and the hub are different origins in production (xnet.fyi/app vs
  // hub.xnet.fyi), and the Authorization header forces a CORS preflight — the
  // browser surfaces a bare "Failed to fetch" if the hub doesn't answer it.
  it('answers the CORS preflight for authenticated HTTP APIs', async () => {
    const preflight = await fetch(`${BASE}/shares/links?docId=doc-cors`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://xnet.fyi',
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'authorization,content-type'
      }
    })
    expect(preflight.status).toBe(204)
    expect(preflight.headers.get('access-control-allow-origin')).toBe('*')
    expect(preflight.headers.get('access-control-allow-headers')?.toLowerCase()).toContain(
      'authorization'
    )

    const response = await fetch(`${BASE}/shares/links?docId=doc-cors`, {
      headers: { Origin: 'https://xnet.fyi', Authorization: `Bearer ${owner.token}` }
    })
    expect(response.status).toBe(200)
    expect(response.headers.get('access-control-allow-origin')).toBe('*')
  })

  it('creates a link whose URL carries the secret in the fragment', async () => {
    const { url, linkId } = await createLink(owner, 'doc-anatomy', 'read')
    expect(url).toBe(`http://localhost:${PORT}/s/${linkId}#s=${url.split('#s=')[1]}`)

    const { status, json } = await api(`/shares/links?docId=doc-anatomy`, { token: owner.token })
    expect(status).toBe(200)
    const links = json.links as Array<Record<string, unknown>>
    expect(links).toHaveLength(1)
    expect(links[0].linkId).toBe(linkId)
    // The stored record never contains the secret itself
    expect(JSON.stringify(links[0])).not.toContain(url.split('#s=')[1])
  })

  it('accepts every client ShareDocType, including workspace (0290)', async () => {
    // The client offered 'workspace' (saved bench, 0280) long before the hub
    // accepted it — every union member must round-trip create → claim.
    const docTypes = ['page', 'database', 'canvas', 'dashboard', 'view', 'space', 'workspace']
    for (const docType of docTypes) {
      const { status, json } = await api('/shares/links', {
        method: 'POST',
        token: owner.token,
        body: { docId: `doc-type-${docType}`, docType, role: 'read' }
      })
      expect(status, `docType=${docType}`).toBe(200)
      expect(json.docType).toBe(docType)

      const recipient = makeActor()
      const secret = (json.url as string).split('#s=')[1]
      const claimed = await claim(recipient, json.linkId as string, secret)
      expect(claimed.status, `claim docType=${docType}`).toBe(200)
      expect(claimed.json.docType).toBe(docType)
    }
  })

  it('claims a link, records a grant, and is idempotent on re-claim', async () => {
    const recipient = makeActor()
    const { linkId, secret } = await createLink(owner, 'doc-claim', 'read')

    const first = await claim(recipient, linkId, secret)
    expect(first.status).toBe(200)
    expect(first.json.role).toBe('read')
    expect(first.json.resource).toBe('doc-claim')
    expect(first.json.endpoint).toBe(`ws://localhost:${PORT}`)

    const second = await claim(recipient, linkId, secret)
    expect(second.status).toBe(200)

    const { json } = await api(`/shares/links?docId=doc-claim`, { token: owner.token })
    const links = json.links as Array<Record<string, unknown>>
    expect(links[0].useCount).toBe(1)

    const grants = await api(`/shares/grants?docId=doc-claim`, { token: owner.token })
    const grantRows = grants.json.grants as Array<Record<string, unknown>>
    expect(grantRows).toHaveLength(1)
    expect(grantRows[0].granteeDid).toBe(recipient.did)
    expect(grantRows[0].viaLinkId).toBe(linkId)
  })

  it('rejects claims with a wrong secret', async () => {
    const recipient = makeActor()
    const { linkId } = await createLink(owner, 'doc-bad-secret', 'read')
    const { status, json } = await claim(recipient, linkId, 'not-the-secret')
    expect(status).toBe(403)
    expect(json.code).toBe('BAD_SECRET')
  })

  it('rejects claims on disabled links but keeps existing grants', async () => {
    const early = makeActor()
    const late = makeActor()
    const { linkId, secret } = await createLink(owner, 'doc-disable', 'write')

    expect((await claim(early, linkId, secret)).status).toBe(200)

    const patch = await api(`/shares/links/${linkId}`, {
      method: 'PATCH',
      token: owner.token,
      body: { disabled: true }
    })
    expect(patch.status).toBe(200)

    const denied = await claim(late, linkId, secret)
    expect(denied.status).toBe(410)
    expect(denied.json.code).toBe('LINK_REVOKED')

    const grants = await api(`/shares/grants?docId=doc-disable`, { token: owner.token })
    const grantRows = grants.json.grants as Array<Record<string, unknown>>
    expect(grantRows.some((g) => g.granteeDid === early.did && g.revokedAt === 0)).toBe(true)
  })

  it('rejects claims on expired and exhausted links with distinct codes', async () => {
    const recipient = makeActor()

    const expired = await createLink(owner, 'doc-expired', 'read', {
      expiresAt: Date.now() + 50
    })
    await new Promise((resolve) => setTimeout(resolve, 80))
    const expiredClaim = await claim(recipient, expired.linkId, expired.secret)
    expect(expiredClaim.status).toBe(410)
    expect(expiredClaim.json.code).toBe('LINK_EXPIRED')

    const limited = await createLink(owner, 'doc-limited', 'read', { maxUses: 1 })
    expect((await claim(makeActor(), limited.linkId, limited.secret)).status).toBe(200)
    const exhausted = await claim(makeActor(), limited.linkId, limited.secret)
    expect(exhausted.status).toBe(410)
    expect(exhausted.json.code).toBe('LINK_EXHAUSTED')
  })

  it('revokes a person without touching the link', async () => {
    const recipient = makeActor()
    const { linkId, secret } = await createLink(owner, 'doc-revoke-person', 'write')
    expect((await claim(recipient, linkId, secret)).status).toBe(200)

    const grants = await api(`/shares/grants?docId=doc-revoke-person`, { token: owner.token })
    const grantRows = grants.json.grants as Array<Record<string, unknown>>
    const grantId = grantRows[0].grantId as string

    const revoke = await api(`/shares/grants/${grantId}?docId=doc-revoke-person`, {
      method: 'DELETE',
      token: owner.token
    })
    expect(revoke.status).toBe(200)

    const after = await api(`/shares/grants?docId=doc-revoke-person`, { token: owner.token })
    const afterRows = after.json.grants as Array<Record<string, unknown>>
    expect((afterRows[0].revokedAt as number) > 0).toBe(true)

    const link = await api(`/shares/links?docId=doc-revoke-person`, { token: owner.token })
    const links = link.json.links as Array<Record<string, unknown>>
    expect(links[0].disabled).toBe(false)
  })

  it('requires ownership to manage links when the doc has a recorded owner', async () => {
    const stranger = makeActor()
    // Register doc ownership through the search index path (sets doc_meta)
    const ws = await connectWithToken(owner.token)
    ws.send(
      JSON.stringify({
        type: 'index-update',
        docId: 'doc-owned',
        meta: { schemaIri: 'xnet://xnet.fyi/Page@1.0.0', title: 'Owned doc' }
      })
    )
    await waitForMessage(ws)
    ws.close()

    const denied = await api('/shares/links', {
      method: 'POST',
      token: stranger.token,
      body: { docId: 'doc-owned', docType: 'page', role: 'read' }
    })
    expect(denied.status).toBe(403)

    const allowed = await api('/shares/links', {
      method: 'POST',
      token: owner.token,
      body: { docId: 'doc-owned', docType: 'page', role: 'read' }
    })
    expect(allowed.status).toBe(200)
  })

  it('rate limits repeated claim attempts', async () => {
    const attacker = makeActor()
    const { linkId } = await createLink(owner, 'doc-rate', 'read')
    let lastStatus = 0
    for (let attempt = 0; attempt < 11; attempt += 1) {
      const { status } = await claim(attacker, linkId, 'wrong-secret')
      lastStatus = status
    }
    expect(lastStatus).toBe(429)
  })

  it('serves the interstitial without consuming the link', async () => {
    const recipient = makeActor()
    const { linkId, secret } = await createLink(owner, 'doc-interstitial', 'read')

    const page = await fetch(`${BASE}/s/${linkId}`)
    expect(page.status).toBe(200)
    expect(page.headers.get('content-security-policy')).toContain("default-src 'none'")
    expect(page.headers.get('referrer-policy')).toBe('no-referrer')
    const html = await page.text()
    expect(html).toContain('xnet://')
    expect(html).not.toContain(secret)

    // Scanner-style prefetch consumed nothing — the claim still works
    expect((await claim(recipient, linkId, secret)).status).toBe(200)
  })

  describe('role enforcement', () => {
    it('rejects node-changes from read grantees and allows write grantees', async () => {
      const reader = makeActor()
      const writer = makeActor()
      const readLink = await createLink(owner, 'doc-enforce', 'read')
      const writeLink = await createLink(owner, 'doc-enforce', 'write')
      expect((await claim(reader, readLink.linkId, readLink.secret)).status).toBe(200)
      expect((await claim(writer, writeLink.linkId, writeLink.secret)).status).toBe(200)

      const denied = await publishChange(reader, 'doc-enforce')
      expect(denied?.code).toBe('WRITE_FORBIDDEN')

      const accepted = await publishChange(writer, 'doc-enforce')
      expect(accepted?.code).not.toBe('WRITE_FORBIDDEN')
    })

    it('lets comment grantees write comments but not other schemas', async () => {
      const commenter = makeActor()
      const link = await createLink(owner, 'doc-comments', 'comment')
      expect((await claim(commenter, link.linkId, link.secret)).status).toBe(200)

      const comment = await publishChange(
        commenter,
        'doc-comments',
        'xnet://xnet.fyi/Comment@1.0.0'
      )
      expect(comment?.code).not.toBe('WRITE_FORBIDDEN')

      const task = await publishChange(commenter, 'doc-comments', 'xnet://xnet.dev/Task@1.0.0')
      expect(task?.code).toBe('WRITE_FORBIDDEN')
    })

    it('rejects yjs updates from read grantees', async () => {
      const reader = makeActor()
      const link = await createLink(owner, 'doc-yjs', 'read')
      expect((await claim(reader, link.linkId, link.secret)).status).toBe(200)

      const ws = await connectWithToken(reader.token)
      ws.send(
        JSON.stringify({
          type: 'publish',
          topic: 'xnet-doc-doc-yjs',
          data: { type: 'sync-update', from: 'peer-reader', update: 'AAA=' }
        })
      )
      const response = await waitForMessage(ws)
      ws.close()
      expect(response.code).toBe('WRITE_FORBIDDEN')
    })

    it('does not restrict DIDs without grants (legacy trust model)', async () => {
      const bystander = makeActor()
      const result = await publishChange(bystander, 'doc-enforce')
      expect(result?.code).not.toBe('WRITE_FORBIDDEN')
    })

    it('denies removed grantees entirely instead of restoring legacy access', async () => {
      const member = makeActor()
      const link = await createLink(owner, 'doc-removal', 'write')
      expect((await claim(member, link.linkId, link.secret)).status).toBe(200)

      const accepted = await publishChange(member, 'doc-removal')
      expect(accepted?.code).not.toBe('WRITE_FORBIDDEN')

      const grants = await api(`/shares/grants?docId=doc-removal`, { token: owner.token })
      const grantRows = grants.json.grants as Array<Record<string, unknown>>
      const grantId = grantRows.find((g) => g.granteeDid === member.did)?.grantId as string
      const revoke = await api(`/shares/grants/${grantId}?docId=doc-removal`, {
        method: 'DELETE',
        token: owner.token
      })
      expect(revoke.status).toBe(200)

      // Revocation invalidates the role cache immediately; the removed DID
      // is now denied outright, wildcard capabilities notwithstanding.
      const denied = await publishChange(member, 'doc-removal')
      expect(denied?.code).toBe('TOKEN_REVOKED')

      // Re-claiming the still-active link restores access (anyone with the
      // link may join; to keep someone out, disable the link too).
      expect((await claim(member, link.linkId, link.secret)).status).toBe(200)
      const restored = await publishChange(member, 'doc-removal')
      expect(restored?.code).not.toBe('TOKEN_REVOKED')
    })
  })
})

describe('ShareAccessService', () => {
  it('maps roles to actions and back', () => {
    expect(roleFromActions(SHARE_ROLE_ACTIONS.read)).toBe('read')
    expect(roleFromActions(SHARE_ROLE_ACTIONS.comment)).toBe('comment')
    expect(roleFromActions(SHARE_ROLE_ACTIONS.write)).toBe('write')
  })

  it('matches comment schemas version-agnostically', () => {
    expect(isCommentSchema('xnet://xnet.fyi/Comment@1.0.0')).toBe(true)
    expect(isCommentSchema('xnet://xnet.fyi/Reaction@2.0.0')).toBe(true)
    expect(isCommentSchema('xnet://xnet.fyi/Page@1.0.0')).toBe(false)
    expect(isCommentSchema(undefined)).toBe(false)
  })

  it('caches statuses and invalidates on grant changes', async () => {
    const storage = createMemoryStorage()
    const access = new ShareAccessService(storage, 60_000)

    expect(await access.getStatus('did:key:zReader', 'doc-1')).toBe('none')

    await storage.upsertGrantIndex({
      grantId: 'g1',
      granteeDid: 'did:key:zReader',
      resourceDocId: 'doc-1',
      actions: ['read'],
      expiresAt: 0,
      revokedAt: 0,
      createdAt: Date.now()
    })

    // Cached 'none' until invalidated
    expect(await access.getStatus('did:key:zReader', 'doc-1')).toBe('none')
    access.invalidate('did:key:zReader', 'doc-1')
    expect(await access.getStatus('did:key:zReader', 'doc-1')).toBe('read')

    expect(await access.canWriteNodeChange('did:key:zReader', 'doc-1', 'any')).toBe(false)
    expect(await access.canWriteYjs('did:key:zReader', 'doc-1')).toBe(false)
    expect(await access.canWriteYjs('did:key:zSomeoneElse', 'doc-1')).toBe(true)

    // Revoking the only grant flips the status to 'revoked' (denied), not
    // back to 'none' (legacy unrestricted access).
    await storage.revokeGrant('g1')
    access.invalidate('did:key:zReader', 'doc-1')
    expect(await access.getStatus('did:key:zReader', 'doc-1')).toBe('revoked')
    expect(await access.isDenied('did:key:zReader', 'doc-1')).toBe(true)
    expect(await access.canWriteNodeChange('did:key:zReader', 'doc-1', 'any')).toBe(false)
  })
})
