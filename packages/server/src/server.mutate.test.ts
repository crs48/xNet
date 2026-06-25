import type { ServerAuthContext } from './types'
import type { NodeChange, SchemaIRI } from '@xnetjs/data'
import { MemoryNodeStorageAdapter, NodeStore } from '@xnetjs/data'
import { generateIdentity } from '@xnetjs/identity'
import { describe, expect, it } from 'vitest'
import { deriveCustodialIdentity } from './identity'
import { createXNetServer } from './server'

const SCHEMA = 'xnet://xnet.fyi/Task' as SchemaIRI
const SECRET = new Uint8Array(32).fill(7)

const bySubject =
  (extra?: (token: string) => Record<string, unknown>) =>
  (token: string | undefined): ServerAuthContext | null =>
    token ? { subject: token, ...(extra ? extra(token) : {}) } : null

describe('createXNetServer.mutate — authorization', () => {
  it('blocks writes denied by authorizeWrite and surfaces a typed rejection', async () => {
    const server = await createXNetServer({
      trust: 'server',
      authenticate: bySubject((t) => ({ tenant: t })),
      authorizeWrite: (ctx, write) =>
        write.payload.properties.tenant === ctx.tenant
          ? { ok: true }
          : { ok: false, reason: 'wrong tenant' }
    })

    const denied = await server.mutate('a', {
      op: 'create',
      schemaId: SCHEMA,
      data: { tenant: 'b' }
    })
    expect(denied.ok).toBe(false)
    if (denied.ok) return
    expect(denied.code).toBe('WRITE_DENIED')
    expect(denied.reason).toBe('wrong tenant')

    const allowed = await server.mutate('a', {
      op: 'create',
      schemaId: SCHEMA,
      data: { tenant: 'a' }
    })
    expect(allowed.ok).toBe(true)
  })

  it('rejects an unauthenticated mutation', async () => {
    const server = await createXNetServer({ trust: 'server', authenticate: bySubject() })
    const res = await server.mutate(undefined, { op: 'create', schemaId: SCHEMA, data: {} })
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.code).toBe('UNAUTHENTICATED')
  })
})

describe('createXNetServer.mutate — trust spectrum', () => {
  it('server mode authors every change with the server identity', async () => {
    const server = await createXNetServer({ trust: 'server', authenticate: bySubject() })
    const res = await server.mutate('anyone', {
      op: 'create',
      schemaId: SCHEMA,
      data: { title: 'x' }
    })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.node?.createdBy).toBe(server.serverDID)
  })

  it('custodial mode signs as a stable per-user derived identity', async () => {
    const server = await createXNetServer({
      trust: 'custodial',
      custodialSecret: SECRET,
      authenticate: bySubject()
    })

    const alice = await server.mutate('alice', {
      op: 'create',
      schemaId: SCHEMA,
      data: { title: 'A' }
    })
    const bob = await server.mutate('bob', { op: 'create', schemaId: SCHEMA, data: { title: 'B' } })
    expect(alice.ok && bob.ok).toBe(true)
    if (!alice.ok || !bob.ok) return

    const aliceDid = deriveCustodialIdentity(SECRET, 'alice').did
    const bobDid = deriveCustodialIdentity(SECRET, 'bob').did
    expect(alice.node?.createdBy).toBe(aliceDid)
    expect(bob.node?.createdBy).toBe(bobDid)
    expect(aliceDid).not.toBe(bobDid)
    // server identity is distinct from the custodial per-user identities
    expect(aliceDid).not.toBe(server.serverDID)
  })

  it('custodial per-user stores share storage coherently (cross-author LWW update)', async () => {
    const server = await createXNetServer({
      trust: 'custodial',
      custodialSecret: SECRET,
      authenticate: bySubject()
    })

    const created = await server.mutate('alice', {
      op: 'create',
      schemaId: SCHEMA,
      id: 'shared',
      data: { title: 'A' }
    })
    expect(created.ok).toBe(true)

    const updated = await server.mutate('bob', {
      op: 'update',
      schemaId: SCHEMA,
      nodeId: 'shared',
      data: { title: 'B-edit' }
    })
    expect(updated.ok).toBe(true)
    if (!updated.ok) return
    expect(updated.node?.properties.title).toBe('B-edit')
    expect(updated.node?.updatedBy).toBe(deriveCustodialIdentity(SECRET, 'bob').did)
  })
})

describe('createXNetServer.mutate — signed trust verifies client identity', () => {
  async function signedChangeFor(properties: Record<string, unknown>) {
    const client = generateIdentity()
    const clientStore = new NodeStore({
      storage: new MemoryNodeStorageAdapter(),
      authorDID: client.identity.did,
      signingKey: client.privateKey
    })
    await clientStore.initialize()
    const node = await clientStore.create({ id: 'doc1', schemaId: SCHEMA, properties })
    const [change] = await clientStore.getChanges(node.id)
    return { clientDid: client.identity.did, change }
  }

  it('accepts a valid client-signed change bound to the authenticated subject', async () => {
    const { clientDid, change } = await signedChangeFor({ title: 'signed' })
    const server = await createXNetServer({
      trust: 'signed',
      authenticate: (t) => (t === 'good' ? { subject: clientDid } : null)
    })

    const res = await server.mutate('good', {
      op: 'create',
      schemaId: SCHEMA,
      data: {},
      signedChange: change
    })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.node?.createdBy).toBe(clientDid)
    expect(res.node?.properties.title).toBe('signed')
  })

  it('rejects a change whose author is not the authenticated subject', async () => {
    const { change } = await signedChangeFor({ title: 'signed' })
    const otherDid = generateIdentity().identity.did
    const server = await createXNetServer({
      trust: 'signed',
      authenticate: (t) => (t ? { subject: otherDid } : null)
    })

    const res = await server.mutate('any', {
      op: 'create',
      schemaId: SCHEMA,
      data: {},
      signedChange: change
    })
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.code).toBe('IDENTITY_MISMATCH')
  })

  it('rejects a tampered change with an invalid signature', async () => {
    const { clientDid, change } = await signedChangeFor({ title: 'signed' })
    const server = await createXNetServer({
      trust: 'signed',
      authenticate: () => ({ subject: clientDid })
    })

    const tampered: NodeChange = {
      ...change,
      payload: { ...change.payload, properties: { title: 'tampered' } }
    }
    const res = await server.mutate('good', {
      op: 'create',
      schemaId: SCHEMA,
      data: {},
      signedChange: tampered
    })
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.code).toBe('SIGNATURE_INVALID')
  })

  it('requires a signed change in signed mode', async () => {
    const server = await createXNetServer({
      trust: 'signed',
      authenticate: () => ({ subject: 'did:key:zSomeone' })
    })
    const res = await server.mutate('good', { op: 'create', schemaId: SCHEMA, data: {} })
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.code).toBe('SIGNATURE_REQUIRED')
  })
})
