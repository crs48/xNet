import type { PendingWrite, ServerAuthContext } from './types'
import type { SchemaIRI } from '@xnetjs/data'
import type { DID } from '@xnetjs/identity'
import { MemoryNodeStorageAdapter, NodeStore } from '@xnetjs/data'
import { createQueryDescriptor, createRemoteNodeQueryRequest } from '@xnetjs/data-bridge'
import { generateIdentity } from '@xnetjs/identity'
import { describe, expect, it } from 'vitest'
import { createXNetServer } from './server'

const SCHEMA = 'xnet://xnet.fyi/Task' as SchemaIRI
const SECRET = new Uint8Array(32).fill(9)

const bySubject =
  (extra?: (token: string) => Record<string, unknown>) =>
  (token: string | undefined): ServerAuthContext | null =>
    token ? { subject: token, ...(extra ? extra(token) : {}) } : null

describe('hardening: update/delete authorize against the target node, not the client claim', () => {
  it('blocks a cross-tenant update/delete even when the client supplies their own tenant', async () => {
    const server = await createXNetServer({
      trust: 'server',
      authenticate: bySubject((t) => ({ tenant: t })),
      authorizeWrite: (ctx, write) => {
        // Ownership is decided by the EXISTING node for update/delete.
        const tenant =
          write.op === 'create'
            ? write.payload.properties.tenant
            : write.existing?.properties.tenant
        return tenant === ctx.tenant ? { ok: true } : { ok: false, reason: 'not your tenant' }
      }
    })

    await server.mutate('a', {
      op: 'create',
      schemaId: SCHEMA,
      id: 'n1',
      data: { tenant: 'a', title: 'A' }
    })

    const attackUpdate = await server.mutate('b', {
      op: 'update',
      schemaId: SCHEMA,
      nodeId: 'n1',
      data: { tenant: 'b', title: 'pwned' }
    })
    expect(attackUpdate.ok).toBe(false)
    if (!attackUpdate.ok) expect(attackUpdate.code).toBe('WRITE_DENIED')

    const attackDelete = await server.mutate('b', { op: 'delete', schemaId: SCHEMA, nodeId: 'n1' })
    expect(attackDelete.ok).toBe(false)

    // The real owner is still allowed, and the node was not modified by the attack.
    const ownerUpdate = await server.mutate('a', {
      op: 'update',
      schemaId: SCHEMA,
      nodeId: 'n1',
      data: { title: 'A2' }
    })
    expect(ownerUpdate.ok).toBe(true)
    if (ownerUpdate.ok) expect(ownerUpdate.node?.properties.title).toBe('A2')
  })

  it('exposes the stored schema + existing snapshot, not the client-claimed schemaId', async () => {
    let seen: PendingWrite | undefined
    const server = await createXNetServer({
      trust: 'server',
      authenticate: bySubject(),
      authorizeWrite: (_ctx, write) => {
        seen = write
        return { ok: true }
      }
    })
    await server.mutate('x', { op: 'create', schemaId: SCHEMA, id: 'n1', data: { title: 'A' } })
    await server.mutate('x', {
      op: 'update',
      schemaId: 'xnet://evil/Other' as SchemaIRI, // client lies about the schema
      nodeId: 'n1',
      data: { title: 'B' }
    })
    expect(seen?.schemaId).toBe(SCHEMA) // real stored schema wins over the claim
    expect(seen?.existing?.properties.title).toBe('A')
  })
})

describe('hardening: signed mode derives op from the verified change', () => {
  it('a signed delete is seen as a delete by authorizeWrite even if input.op says create', async () => {
    const client = generateIdentity()
    const clientStore = new NodeStore({
      storage: new MemoryNodeStorageAdapter(),
      authorDID: client.identity.did,
      signingKey: client.privateKey
    })
    await clientStore.initialize()
    await clientStore.create({ id: 'd1', schemaId: SCHEMA, properties: { title: 'x' } })
    await clientStore.delete('d1')
    const changes = await clientStore.getChanges('d1')
    const createChange = changes[0]
    const deleteChange = changes[changes.length - 1]

    const seenOps: string[] = []
    const server = await createXNetServer({
      trust: 'signed',
      authenticate: () => ({ subject: client.identity.did }),
      authorizeWrite: (_ctx, write) => {
        seenOps.push(write.op)
        return { ok: write.op !== 'delete' } // deny deletes
      }
    })

    // Seed the create so the delete has a target on the server store.
    const created = await server.mutate('t', {
      op: 'create',
      schemaId: SCHEMA,
      data: {},
      signedChange: createChange
    })
    expect(created.ok).toBe(true)

    // Client lies (input.op = 'create') but the verified change is a delete.
    const res = await server.mutate('t', {
      op: 'create',
      schemaId: SCHEMA,
      data: {},
      signedChange: deleteChange
    })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe('WRITE_DENIED')
    expect(seenOps).toContain('delete')
  })
})

describe('hardening: server identity resolution rejects mismatched/partial config', () => {
  it('throws when only serverDID is provided (no key to sign with)', async () => {
    await expect(
      createXNetServer({ authenticate: bySubject(), serverDID: 'did:key:zMissingKey' as DID })
    ).rejects.toThrow(/without serverSigningKey/)
  })

  it('throws when serverDID does not match serverSigningKey', async () => {
    const a = generateIdentity()
    const b = generateIdentity()
    await expect(
      createXNetServer({
        authenticate: bySubject(),
        serverDID: a.identity.did,
        serverSigningKey: b.privateKey
      })
    ).rejects.toThrow(/does not match/)
  })

  it('derives the DID from a provided signing key and produces verifiable changes', async () => {
    const id = generateIdentity()
    const server = await createXNetServer({
      trust: 'server',
      authenticate: bySubject(),
      serverSigningKey: id.privateKey
    })
    expect(server.serverDID).toBe(id.identity.did)
    const res = await server.mutate('x', { op: 'create', schemaId: SCHEMA, data: { t: 1 } })
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.node?.createdBy).toBe(id.identity.did)
  })
})

describe('hardening: custodial clock reconcile + page info + error codes', () => {
  it('custodial interleaved writes to a shared node converge to the last writer (no clock drift)', async () => {
    const server = await createXNetServer({
      trust: 'custodial',
      custodialSecret: SECRET,
      authenticate: bySubject()
    })
    await server.mutate('alice', { op: 'create', schemaId: SCHEMA, id: 's', data: { v: 'a0' } })
    await server.mutate('bob', { op: 'update', schemaId: SCHEMA, nodeId: 's', data: { v: 'b1' } })
    await server.mutate('alice', { op: 'update', schemaId: SCHEMA, nodeId: 's', data: { v: 'a2' } })
    const last = await server.mutate('bob', {
      op: 'update',
      schemaId: SCHEMA,
      nodeId: 's',
      data: { v: 'b3' }
    })
    expect(last.ok).toBe(true)
    if (last.ok) expect(last.node?.properties.v).toBe('b3')

    const node = await server.store.get('s')
    expect(node?.properties.v).toBe('b3')
  })

  it('pageInfo.hasMore reflects an actual next page (no false positive on exact fill)', async () => {
    const server = await createXNetServer({ trust: 'server', authenticate: bySubject() })
    for (let i = 0; i < 3; i++) {
      await server.mutate('x', { op: 'create', schemaId: SCHEMA, data: { i } })
    }
    const run = (limit: number) =>
      server.query(
        createRemoteNodeQueryRequest({
          requestId: `p${limit}`,
          descriptor: createQueryDescriptor(SCHEMA, { limit, source: 'hub', mode: 'remote' }),
          source: 'hub',
          mode: 'remote',
          auth: { bearerToken: 'x' }
        })
      )

    const partial = await run(2)
    if (partial.type !== 'node-query/result') throw new Error('expected result')
    expect(partial.nodes).toHaveLength(2)
    expect(partial.pageInfo.hasMore).toBe(true)

    const exact = await run(3)
    if (exact.type !== 'node-query/result') throw new Error('expected result')
    expect(exact.nodes).toHaveLength(3)
    expect(exact.pageInfo.hasMore).toBe(false)
  })

  it('update of a missing node returns NOT_FOUND', async () => {
    const server = await createXNetServer({ trust: 'server', authenticate: bySubject() })
    const res = await server.mutate('x', {
      op: 'update',
      schemaId: SCHEMA,
      nodeId: 'ghost',
      data: { a: 1 }
    })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe('NOT_FOUND')
  })
})
