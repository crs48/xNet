/**
 * Data portability routes (exploration 0344): export/restore/purge the
 * authenticated DID's signed changes.
 */

import type { MiddlewareHandler } from 'hono'
import type { SerializedNodeChange } from '../src/storage/interface'
import { generateIdentity } from '@xnetjs/identity'
import { bytesToBase64 } from '@xnetjs/crypto'
import { createUnsignedChange, signChange } from '@xnetjs/sync'
import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { createExportRoutes } from '../src/routes/export'
import { createMemoryStorage } from '../src/storage/memory'

type Signer = { did: string; privateKey: Uint8Array }

const makeSigner = (): Signer => {
  const { identity, privateKey } = generateIdentity()
  return { did: identity.did, privateKey }
}

/** A properly signed SerializedNodeChange, as a real client would produce. */
const signedChange = (
  signer: Signer,
  lamport: number,
  room = 'room-a',
  title = `v${lamport}`
): SerializedNodeChange => {
  const unsigned = createUnsignedChange({
    id: `chg-${lamport}`,
    type: 'update',
    payload: {
      nodeId: `node-${lamport}`,
      schemaId: 'xnet://xnet.fyi/Page@1.0.0',
      properties: { title }
    },
    parentHash: null,
    authorDID: signer.did as never,
    lamport,
    wallTime: 1700000000000 + lamport
  })
  const change = signChange(unsigned, signer.privateKey)
  return {
    id: change.id,
    type: change.type,
    hash: change.hash,
    room,
    nodeId: change.payload.nodeId,
    schemaId: change.payload.schemaId,
    lamportTime: change.lamport,
    lamportAuthor: change.authorDID,
    authorDid: change.authorDID,
    wallTime: change.wallTime,
    parentHash: change.parentHash,
    payload: change.payload,
    signatureB64: bytesToBase64(change.signature),
    protocolVersion: change.protocolVersion
  }
}

const authAs =
  (did: string, can = true): MiddlewareHandler =>
  async (c, next) => {
    c.set('auth', { did, can: () => can })
    await next()
  }

const mount = (opts: { as: string; can?: boolean }) => {
  const storage = createMemoryStorage()
  const app = new Hono()
  app.route('/export', createExportRoutes(storage, { requireAuth: authAs(opts.as, opts.can) }))
  return { app, storage }
}

const ndjson = (changes: SerializedNodeChange[]): string =>
  changes.map((c) => JSON.stringify(c)).join('\n') + '\n'

describe('export routes (exploration 0344)', () => {
  it('GET /export/changes streams the callers changes as NDJSON, cross-room, in lamport order', async () => {
    const me = makeSigner()
    const other = makeSigner()
    const { app, storage } = mount({ as: me.did })
    await storage.appendNodeChange('room-a', signedChange(me, 1))
    await storage.appendNodeChange('room-b', signedChange(me, 2, 'room-b'))
    await storage.appendNodeChange('room-a', signedChange(other, 3))

    const res = await app.request('/export/changes')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('application/x-ndjson')
    const lines = (await res.text()).trim().split('\n')
    expect(lines).toHaveLength(2)
    const exported = lines.map((l) => JSON.parse(l) as SerializedNodeChange)
    expect(exported.map((c) => c.lamportTime)).toEqual([1, 2])
    expect(exported.every((c) => c.authorDid === me.did)).toBe(true)
  })

  it('POST /export/changes restores own signed changes; duplicates are skipped', async () => {
    const me = makeSigner()
    const { app, storage } = mount({ as: me.did })
    const changes = [signedChange(me, 1), signedChange(me, 2)]

    const res = await app.request('/export/changes', {
      method: 'POST',
      body: ndjson(changes)
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ applied: 2, duplicates: 0, rejected: [] })
    expect(await storage.getHighWaterMark('room-a')).toBe(2)

    const again = await app.request('/export/changes', { method: 'POST', body: ndjson(changes) })
    expect(await again.json()).toMatchObject({ applied: 0, duplicates: 2 })
  })

  it('rejects foreign-authored records (the importRepo lesson) and tampered records', async () => {
    const me = makeSigner()
    const other = makeSigner()
    const { app, storage } = mount({ as: me.did })

    const foreign = signedChange(other, 1)
    const tampered = { ...signedChange(me, 2), payload: { nodeId: 'node-2', properties: { title: 'EVIL' } } }
    const res = await app.request('/export/changes', {
      method: 'POST',
      body: ndjson([foreign, tampered as SerializedNodeChange])
    })
    const body = await res.json()
    expect(body.applied).toBe(0)
    expect(body.rejected).toHaveLength(2)
    expect(body.rejected[0].reason).toContain('author DID')
    expect(body.rejected[1].reason).toContain('hash verification')
    expect(await storage.getHighWaterMark('room-a')).toBe(0)
  })

  it('requires hub/relay for the target room', async () => {
    const me = makeSigner()
    const { app, storage } = mount({ as: me.did, can: false })
    const res = await app.request('/export/changes', {
      method: 'POST',
      body: ndjson([signedChange(me, 1)])
    })
    const body = await res.json()
    expect(body.applied).toBe(0)
    expect(body.rejected[0].reason).toContain('hub/relay')
    expect(await storage.getHighWaterMark('room-a')).toBe(0)
  })

  it('DELETE /export/changes purges only the callers authored changes', async () => {
    const me = makeSigner()
    const other = makeSigner()
    const { app, storage } = mount({ as: me.did })
    await storage.appendNodeChange('room-a', signedChange(me, 1))
    await storage.appendNodeChange('room-a', signedChange(me, 2))
    await storage.appendNodeChange('room-a', signedChange(other, 3))

    const res = await app.request('/export/changes', { method: 'DELETE' })
    expect(await res.json()).toEqual({ deleted: 2 })
    const mine = await storage.getNodeChangesByAuthor(me.did, 0)
    const theirs = await storage.getNodeChangesByAuthor(other.did, 0)
    expect(mine).toEqual([])
    expect(theirs).toHaveLength(1)
  })
})
