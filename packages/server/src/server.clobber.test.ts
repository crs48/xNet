import type { ServerAuthContext } from './types'
import type { SchemaIRI } from '@xnetjs/data'
import { describe, expect, it } from 'vitest'
import { createXNetServer } from './server'

const SCHEMA = 'xnet://xnet.fyi/Task' as SchemaIRI

const bySubject =
  (extra?: (token: string) => Record<string, unknown>) =>
  (token: string | undefined): ServerAuthContext | null =>
    token ? { subject: token, ...(extra ? extra(token) : {}) } : null

// An ownership hook that (intentionally) allows ALL creates but gates
// update/delete on the stored node — the shape that exposed the clobber bug.
const ownershipHook =
  () =>
  (
    ctx: ServerAuthContext,
    write: { op: string; existing: { properties: Record<string, unknown> } | null }
  ) =>
    write.op === 'create'
      ? { ok: true }
      : write.existing?.properties.tenant === ctx.tenant
        ? { ok: true }
        : { ok: false, reason: 'not your tenant' }

describe('hardening: create cannot clobber an existing node', () => {
  it('rejects a create whose id already exists (ALREADY_EXISTS) and leaves the node untouched', async () => {
    const server = await createXNetServer({
      trust: 'server',
      authenticate: bySubject((t) => ({ tenant: t })),
      authorizeWrite: ownershipHook()
    })

    await server.mutate('alice', {
      op: 'create',
      schemaId: SCHEMA,
      id: 'secret',
      data: { tenant: 'alice', title: 'private', secret: 'TOP' }
    })

    // The equivalent update is correctly denied; the create-with-same-id used to
    // bypass that and overwrite via LWW. It must now be rejected outright.
    const clobber = await server.mutate('mallory', {
      op: 'create',
      schemaId: SCHEMA,
      id: 'secret',
      data: { title: 'HACKED', secret: 'pwned' }
    })
    expect(clobber.ok).toBe(false)
    if (!clobber.ok) expect(clobber.code).toBe('ALREADY_EXISTS')

    const node = await server.store.get('secret')
    expect(node?.properties.title).toBe('private')
    expect(node?.properties.secret).toBe('TOP')
  })

  it('surfaces the existing node to authorizeWrite for a create targeting an existing id', async () => {
    let sawExistingOnCreate = false
    const server = await createXNetServer({
      trust: 'server',
      authenticate: bySubject(),
      authorizeWrite: (_ctx, write) => {
        if (write.op === 'create' && write.existing) sawExistingOnCreate = true
        return { ok: true }
      }
    })
    await server.mutate('x', { op: 'create', schemaId: SCHEMA, id: 'n', data: { a: 1 } })
    await server.mutate('x', { op: 'create', schemaId: SCHEMA, id: 'n', data: { a: 2 } })
    expect(sawExistingOnCreate).toBe(true)
  })
})

describe('hardening: authorization runs before existence checks (no existence oracle)', () => {
  it('an unauthorized principal gets WRITE_DENIED for both an existing foreign node and a missing node', async () => {
    const server = await createXNetServer({
      trust: 'server',
      authenticate: bySubject((t) => ({ tenant: t })),
      authorizeWrite: ownershipHook()
    })
    await server.mutate('alice', {
      op: 'create',
      schemaId: SCHEMA,
      id: 'a-node',
      data: { tenant: 'alice' }
    })

    const onExisting = await server.mutate('mallory', {
      op: 'update',
      schemaId: SCHEMA,
      nodeId: 'a-node',
      data: { x: 1 }
    })
    const onMissing = await server.mutate('mallory', {
      op: 'update',
      schemaId: SCHEMA,
      nodeId: 'ghost',
      data: { x: 1 }
    })

    // Both denied identically — mallory cannot tell an existing node from a missing one.
    expect(onExisting.ok).toBe(false)
    if (!onExisting.ok) expect(onExisting.code).toBe('WRITE_DENIED')
    expect(onMissing.ok).toBe(false)
    if (!onMissing.ok) expect(onMissing.code).toBe('WRITE_DENIED')
  })

  it('an authorized principal still gets NOT_FOUND for a genuinely missing node', async () => {
    const server = await createXNetServer({ trust: 'server', authenticate: bySubject() })
    const res = await server.mutate('x', {
      op: 'update',
      schemaId: SCHEMA,
      nodeId: 'ghost',
      data: { x: 1 }
    })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe('NOT_FOUND')
  })
})
