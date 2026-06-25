import type { ServerAuthContext } from './types'
import type { SchemaIRI } from '@xnetjs/data'
import { createQueryDescriptor, createRemoteNodeQueryRequest } from '@xnetjs/data-bridge'
import { describe, expect, it } from 'vitest'
import { createXNetServer } from './server'

const SCHEMA = 'xnet://xnet.fyi/Task' as SchemaIRI

function authForToken(token: string | undefined): ServerAuthContext | null {
  if (token === 'alice') return { subject: 'alice', tenant: 'a' }
  if (token === 'bob') return { subject: 'bob', tenant: 'b' }
  return null
}

function readRequest(bearerToken: string | undefined) {
  return createRemoteNodeQueryRequest({
    requestId: 'q1',
    descriptor: createQueryDescriptor(SCHEMA, { source: 'hub', mode: 'remote' }),
    source: 'hub',
    mode: 'remote',
    auth: { bearerToken }
  })
}

async function setupSeeded() {
  const server = await createXNetServer({
    trust: 'server',
    authenticate: authForToken,
    authorizeRead: (ctx, query) => query.and({ tenant: ctx.tenant })
  })
  await server.mutate('alice', {
    op: 'create',
    schemaId: SCHEMA,
    data: { tenant: 'a', title: 'A1' }
  })
  await server.mutate('alice', {
    op: 'create',
    schemaId: SCHEMA,
    data: { tenant: 'a', title: 'A2' }
  })
  await server.mutate('bob', { op: 'create', schemaId: SCHEMA, data: { tenant: 'b', title: 'B1' } })
  return server
}

describe('createXNetServer.query — structured query executor', () => {
  it('returns a protocol success response for an authenticated read', async () => {
    const server = await setupSeeded()
    const res = await server.query(readRequest('alice'))

    expect(res.type).toBe('node-query/result')
    if (res.type !== 'node-query/result') return
    expect(res.source).toBe('hub')
    expect(res.pageInfo.loadedCount).toBe(res.nodes.length)
    expect(res.staleness.level).toBe('fresh')
    expect(res.verification.status).toBe('unverified') // server-trusted, not client-verified
  })

  it('authorizeRead scopes results so one tenant cannot read another', async () => {
    const server = await setupSeeded()

    const aliceRes = await server.query(readRequest('alice'))
    const bobRes = await server.query(readRequest('bob'))
    if (aliceRes.type !== 'node-query/result' || bobRes.type !== 'node-query/result') {
      throw new Error('expected results')
    }

    expect(aliceRes.nodes).toHaveLength(2)
    expect(aliceRes.nodes.every((n) => n.properties.tenant === 'a')).toBe(true)
    expect(aliceRes.nodes.some((n) => n.properties.tenant === 'b')).toBe(false)

    expect(bobRes.nodes).toHaveLength(1)
    expect(bobRes.nodes[0].properties.tenant).toBe('b')
  })

  it('rejects an unauthenticated read with AUTH_DENIED', async () => {
    const server = await setupSeeded()
    const res = await server.query(readRequest('nope'))

    expect(res.type).toBe('node-query/error')
    if (res.type !== 'node-query/error') return
    expect(res.code).toBe('AUTH_DENIED')
  })

  it('createRemoteQueryClient injects the token and routes through the same executor', async () => {
    const server = await setupSeeded()
    const client = server.createRemoteQueryClient(() => 'alice')

    const res = await client.query(
      createRemoteNodeQueryRequest({
        requestId: 'q2',
        descriptor: createQueryDescriptor(SCHEMA, { source: 'hub', mode: 'remote' }),
        source: 'hub',
        mode: 'remote'
      })
    )

    expect(res.type).toBe('node-query/result')
    if (res.type !== 'node-query/result') return
    expect(res.nodes.every((n) => n.properties.tenant === 'a')).toBe(true)
  })
})
