/**
 * Agent audit trail + trusted-root auth (exploration 0337).
 */

import type { SerializedNodeChange } from '../src/storage/interface'
import type { MiddlewareHandler } from 'hono'
import { generateIdentity, mintAgentPassport, createUCAN } from '@xnetjs/identity'
import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { authenticateHttpRequest } from '../src/auth/ucan'
import { createAuditRoutes } from '../src/routes/audit'
import { createMemoryStorage } from '../src/storage/memory'
import { DEFAULT_CONFIG } from '../src/types'

const change = (
  authorDid: string,
  lamportTime: number,
  overrides: Partial<SerializedNodeChange> = {}
): SerializedNodeChange => ({
  hash: `hash-${authorDid}-${lamportTime}`,
  id: `chg-${authorDid}-${lamportTime}`,
  type: 'update',
  nodeId: `node-${lamportTime % 3}`,
  schemaId: 'xnet://xnet.fyi/Page@1.0.0',
  lamportTime,
  lamportAuthor: authorDid,
  authorDid,
  wallTime: 1700000000000 + lamportTime,
  parentHash: null,
  payload: { title: `v${lamportTime}` },
  signatureB64: 'c2ln',
  ...overrides
})

const authAs =
  (did: string, can = false): MiddlewareHandler =>
  async (c, next) => {
    c.set('auth', { did, can: () => can })
    await next()
  }

const mount = async (opts: { as: string; can?: boolean }) => {
  const storage = createMemoryStorage()
  const agent = 'did:key:zAgent'
  for (let i = 1; i <= 5; i++) await storage.appendNodeChange('room-a', change(agent, i))
  await storage.appendNodeChange('room-b', change(agent, 6))
  await storage.appendNodeChange('room-a', change('did:key:zHuman', 3))

  const app = new Hono()
  app.route('/audit', createAuditRoutes(storage, { requireAuth: authAs(opts.as, opts.can) }))
  return { app, agent }
}

describe('audit routes (exploration 0337)', () => {
  it('self-reads page the full cross-room history in lamport order', async () => {
    const { app, agent } = await mount({ as: 'did:key:zAgent' })
    const res = await app.request(`/audit/authors/${agent}/changes`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.changes.map((c: SerializedNodeChange) => c.lamportTime)).toEqual([1, 2, 3, 4, 5, 6])
    expect(body.nextCursor).toBe(6)
    // Only the agent's changes — the human's change never leaks in.
    expect(body.changes.every((c: SerializedNodeChange) => c.authorDid === agent)).toBe(true)
  })

  it('pages on the ?since lamport cursor', async () => {
    const { app, agent } = await mount({ as: 'did:key:zAgent' })
    const res = await app.request(`/audit/authors/${agent}/changes?since=4&limit=1`)
    const body = await res.json()
    expect(body.changes.map((c: SerializedNodeChange) => c.lamportTime)).toEqual([5])
    expect(body.hasMore).toBe(true)
    const res2 = await app.request(`/audit/authors/${agent}/changes?since=6`)
    expect((await res2.json()).changes).toEqual([])
  })

  it('reading another author requires audit/read', async () => {
    const denied = await mount({ as: 'did:key:zOperator', can: false })
    expect((await denied.app.request(`/audit/authors/${denied.agent}/changes`)).status).toBe(403)

    const allowed = await mount({ as: 'did:key:zOperator', can: true })
    const res = await allowed.app.request(`/audit/authors/${allowed.agent}/changes`)
    expect(res.status).toBe(200)
    expect((await res.json()).changes).toHaveLength(6)
  })

  it('rejects non-DID author params', async () => {
    const { app } = await mount({ as: 'did:key:zAgent' })
    expect((await app.request('/audit/authors/nonsense/changes')).status).toBe(400)
  })
})

describe('trusted-root token policy (exploration 0337 / 0307 fix)', () => {
  const operator = generateIdentity()
  const hubDid = 'did:key:zHub'
  const config = {
    ...DEFAULT_CONFIG,
    auth: true,
    trustedDids: [operator.identity.did]
  }

  const invocationFor = (grant: ReturnType<typeof mintAgentPassport>) =>
    createUCAN({
      issuer: grant.agentDID,
      issuerKey: grant.agentKey,
      audience: hubDid,
      capabilities: [{ with: 'xnet://space/inbox', can: 'node/create' }],
      proofs: [grant.ucan]
    })

  it('accepts a passport invocation chaining to the trusted operator', () => {
    const grant = mintAgentPassport({
      operatorDID: operator.identity.did,
      operatorKey: operator.privateKey,
      capabilities: [{ with: 'xnet://space/inbox', can: 'node/create' }]
    })
    const auth = authenticateHttpRequest(`Bearer ${invocationFor(grant)}`, config)
    expect(auth).not.toBeNull()
    expect(auth!.did).toBe(grant.agentDID)
    expect(auth!.can('node/create', 'xnet://space/inbox')).toBe(true)
    expect(auth!.can('node/delete', 'xnet://space/inbox')).toBe(false)
  })

  it('rejects a self-issued wildcard token from a stranger', () => {
    const stranger = generateIdentity()
    const token = createUCAN({
      issuer: stranger.identity.did,
      issuerKey: stranger.privateKey,
      audience: hubDid,
      capabilities: [{ with: '*', can: '*' }]
    })
    expect(authenticateHttpRequest(`Bearer ${token}`, config)).toBeNull()
  })

  it('still accepts the trusted operator itself (proof-less, roots at itself)', () => {
    const token = createUCAN({
      issuer: operator.identity.did,
      issuerKey: operator.privateKey,
      audience: hubDid,
      capabilities: [{ with: '*', can: 'hub/relay' }]
    })
    expect(authenticateHttpRequest(`Bearer ${token}`, config)).not.toBeNull()
  })

  it('legacy behavior is preserved when trustedDids is unset', () => {
    const stranger = generateIdentity()
    const token = createUCAN({
      issuer: stranger.identity.did,
      issuerKey: stranger.privateKey,
      audience: hubDid,
      capabilities: [{ with: '*', can: '*' }]
    })
    const legacyConfig = { ...DEFAULT_CONFIG, auth: true }
    expect(authenticateHttpRequest(`Bearer ${token}`, legacyConfig)).not.toBeNull()
  })
})
