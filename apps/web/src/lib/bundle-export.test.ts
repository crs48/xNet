/**
 * Browser bundle round-trip (0344): the settings "Export data" path produces
 * one zipped .xnetpack whose import restores an identical store.
 */
import { generateSigningKeyPair, sign, type DID } from '@xnetjs/crypto'
import { MemoryNodeStorageAdapter, NodeStore } from '@xnetjs/data'
import { createDID } from '@xnetjs/identity'
import { describe, expect, it } from 'vitest'
import { exportXnetpack, importXnetpackFile, verifyXnetpackFile } from './bundle-export'

function makeStore(identity?: { did: DID; privateKey: Uint8Array }) {
  const keys = generateSigningKeyPair()
  const did = identity?.did ?? (createDID(keys.publicKey) as DID)
  const privateKey = identity?.privateKey ?? keys.privateKey
  const store = new NodeStore({
    storage: new MemoryNodeStorageAdapter(),
    authorDID: did,
    signingKey: privateKey
  })
  return { store, did, privateKey }
}

describe('exportXnetpack / importXnetpackFile', () => {
  it('round-trips the workspace through one zipped file', async () => {
    const a = makeStore()
    await a.store.initialize()
    const node = await a.store.create({
      schemaId: 'xnet://xnet.fyi/Page',
      properties: { title: 'From the browser' }
    })

    const { bytes, manifest, filename } = await exportXnetpack(a.store, a.did, (b) =>
      sign(b, a.privateKey)
    )
    expect(filename).toMatch(/\.xnetpack$/)
    expect(manifest.counts.changes).toBeGreaterThan(0)

    const report = await verifyXnetpackFile(bytes)
    expect(report.ok).toBe(true)

    const b = makeStore({ did: a.did, privateKey: a.privateKey })
    await b.store.initialize()
    const result = await importXnetpackFile(b.store, bytes, { importerDid: a.did })
    expect(result.applied).toBe(manifest.counts.changes)
    expect((await b.store.get(node.id))?.properties.title).toBe('From the browser')
  })

  it('rejects a tampered file at verification, before any write', async () => {
    const a = makeStore()
    await a.store.initialize()
    await a.store.create({ schemaId: 'xnet://xnet.fyi/Page', properties: { title: 'x' } })
    const { bytes } = await exportXnetpack(a.store, a.did, (b) => sign(b, a.privateKey))
    bytes[bytes.length - 20] ^= 0xff // corrupt the zip payload

    const b = makeStore({ did: a.did, privateKey: a.privateKey })
    await b.store.initialize()
    await expect(
      importXnetpackFile(b.store, bytes, { importerDid: a.did })
    ).rejects.toThrow()
    expect(await b.store.getAllChanges()).toEqual([])
  })
})
