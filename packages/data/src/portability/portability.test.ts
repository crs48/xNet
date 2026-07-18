/**
 * Round-trip, incremental, and hostile-input tests for the `.xnetpack`
 * bundle codec (exploration 0344).
 */

import type { DID } from '@xnetjs/core'
import { generateSigningKeyPair, sign, hashHex } from '@xnetjs/crypto'
import { createDID } from '@xnetjs/identity'
import { describe, it, expect } from 'vitest'
import type { SchemaIRI } from '../schema/node'
import { MemoryNodeStorageAdapter } from '../store/memory-adapter'
import { NodeStore } from '../store/store'
import { applyBundle } from './apply'
import { MemoryBundleSink } from './memory-bundle'
import { decodeUtf8, encodeUtf8 } from './serialize'
import * as Y from 'yjs'
import { createStoreYjsPort } from './store-yjs-port'
import { BUNDLE_ENTRY, type BundleBlobPort, type BundleYjsPort } from './types'
import { verifyBundle } from './verify'
import { writeBundle, blobEntryPath } from './write'

const TASK_SCHEMA: SchemaIRI = 'xnet://xnet.fyi/Task'
const PAGE_SCHEMA: SchemaIRI = 'xnet://xnet.fyi/Page'
const SPACE_SCHEMA: SchemaIRI = 'xnet://xnet.fyi/Space'

function createTestStore(identity?: { did: DID; privateKey: Uint8Array }) {
  const keyPair = generateSigningKeyPair()
  const did = identity?.did ?? (createDID(keyPair.publicKey) as DID)
  const privateKey = identity?.privateKey ?? keyPair.privateKey
  const adapter = new MemoryNodeStorageAdapter()
  const store = new NodeStore({ storage: adapter, authorDID: did, signingKey: privateKey })
  return { store, adapter, did, privateKey }
}

function signerFor(privateKey: Uint8Array) {
  return (bytes: Uint8Array) => sign(bytes, privateKey)
}

async function seedStore(store: NodeStore, count = 3) {
  const nodes = []
  for (let i = 0; i < count; i++) {
    nodes.push(
      await store.create({
        schemaId: TASK_SCHEMA,
        properties: { title: `Task ${i}`, status: i % 2 ? 'todo' : 'done' }
      })
    )
  }
  return nodes
}

async function exportFull(store: NodeStore, did: DID, privateKey: Uint8Array, since?: never) {
  const sink = new MemoryBundleSink()
  const manifest = await writeBundle(store, { kind: 'full' }, sink, {
    ownerDid: did,
    manifestSigner: signerFor(privateKey),
    since
  })
  return { sink, manifest, source: sink.toSource() }
}

describe('xnetpack bundle round-trip', () => {
  it('exports a full bundle that verifies clean', async () => {
    const { store, did, privateKey } = createTestStore()
    await store.initialize()
    await seedStore(store)

    const { manifest, source } = await exportFull(store, did, privateKey)
    expect(manifest.counts.changes).toBeGreaterThan(0)
    expect(manifest.signatureB64).toBeTruthy()

    const report = await verifyBundle(source)
    expect(report.issues.filter((i) => i.severity === 'error')).toEqual([])
    expect(report.ok).toBe(true)
  })

  it('round-trips: fresh store converges to identical state and heads', async () => {
    const a = createTestStore()
    await a.store.initialize()
    const nodes = await seedStore(a.store)
    await a.store.update(nodes[0].id, { properties: { title: 'Task 0 edited' } })

    const { manifest, source } = await exportFull(a.store, a.did, a.privateKey)

    // Same identity, new machine: importer DID matches the bundle owner.
    const b = createTestStore({ did: a.did, privateKey: a.privateKey })
    await b.store.initialize()
    const result = await applyBundle(b.store, source, { importerDid: a.did })

    expect(result.quarantined).toEqual([])
    expect(result.applied).toBe(manifest.counts.changes)

    // Identical change heads…
    const aHashes = (await a.store.getAllChanges()).map((c) => c.hash).sort()
    const bHashes = (await b.store.getAllChanges()).map((c) => c.hash).sort()
    expect(bHashes).toEqual(aHashes)

    // …and identical materialized state.
    for (const node of nodes) {
      const aState = await a.store.get(node.id)
      const bState = await b.store.get(node.id)
      expect(bState?.properties).toEqual(aState?.properties)
    }
  })

  it('double-import is idempotent: zero applied, all duplicates', async () => {
    const a = createTestStore()
    await a.store.initialize()
    await seedStore(a.store)
    const { manifest, source } = await exportFull(a.store, a.did, a.privateKey)

    const b = createTestStore({ did: a.did, privateKey: a.privateKey })
    await b.store.initialize()
    await applyBundle(b.store, source, { importerDid: a.did })
    const second = await applyBundle(b.store, source, { importerDid: a.did })

    expect(second.applied).toBe(0)
    expect(second.duplicates).toBe(manifest.counts.changes)
    expect(second.quarantined).toEqual([])
  })

  it('incremental: full + since-bundle ≡ later full bundle', async () => {
    const a = createTestStore()
    await a.store.initialize()
    await seedStore(a.store, 2)
    const first = await exportFull(a.store, a.did, a.privateKey)

    await a.store.create({ schemaId: PAGE_SCHEMA, properties: { title: 'Later page' } })
    const incrementalSink = new MemoryBundleSink()
    const incrementalManifest = await writeBundle(a.store, { kind: 'full' }, incrementalSink, {
      ownerDid: a.did,
      manifestSigner: signerFor(a.privateKey),
      since: first.manifest.frontier
    })
    expect(incrementalManifest.prerequisites).toEqual(first.manifest.frontier)
    expect(incrementalManifest.counts.changes).toBeGreaterThan(0)
    expect(incrementalManifest.counts.changes).toBeLessThan(
      (await a.store.getAllChanges()).length
    )

    const b = createTestStore({ did: a.did, privateKey: a.privateKey })
    await b.store.initialize()
    await applyBundle(b.store, first.source, { importerDid: a.did })
    await applyBundle(b.store, incrementalSink.toSource(), { importerDid: a.did })

    const aHashes = (await a.store.getAllChanges()).map((c) => c.hash).sort()
    const bHashes = (await b.store.getAllChanges()).map((c) => c.hash).sort()
    expect(bHashes).toEqual(aHashes)
  })

  it('incremental bundle refuses to apply without its base (missing prerequisites)', async () => {
    const a = createTestStore()
    await a.store.initialize()
    await seedStore(a.store, 2)
    const first = await exportFull(a.store, a.did, a.privateKey)
    await a.store.create({ schemaId: PAGE_SCHEMA, properties: { title: 'Later' } })
    const sink = new MemoryBundleSink()
    await writeBundle(a.store, { kind: 'full' }, sink, {
      ownerDid: a.did,
      manifestSigner: signerFor(a.privateKey),
      since: first.manifest.frontier
    })

    const empty = createTestStore({ did: a.did, privateKey: a.privateKey })
    await empty.store.initialize()
    await expect(
      applyBundle(empty.store, sink.toSource(), { importerDid: a.did })
    ).rejects.toMatchObject({ code: 'missing-prerequisites' })
  })
})

describe('xnetpack scoped export', () => {
  it('space scope exports the space node and its members only', async () => {
    const { store, did, privateKey } = createTestStore()
    await store.initialize()
    const space = await store.create({ schemaId: SPACE_SCHEMA, properties: { name: 'Team' } })
    const inside = await store.create({
      schemaId: TASK_SCHEMA,
      properties: { title: 'In space', space: space.id }
    })
    const outside = await store.create({
      schemaId: TASK_SCHEMA,
      properties: { title: 'Outside' }
    })

    const sink = new MemoryBundleSink()
    const manifest = await writeBundle(store, { kind: 'space', spaceId: space.id }, sink, {
      ownerDid: did,
      manifestSigner: signerFor(privateKey)
    })

    const b = createTestStore({ did, privateKey })
    await b.store.initialize()
    await applyBundle(b.store, sink.toSource(), { importerDid: did })

    expect(await b.store.get(space.id)).not.toBeNull()
    expect(await b.store.get(inside.id)).not.toBeNull()
    expect(await b.store.get(outside.id)).toBeNull()
    expect(manifest.scope).toEqual({ kind: 'space', spaceId: space.id })
  })

  it('schemas scope exports only matching nodes', async () => {
    const { store, did, privateKey } = createTestStore()
    await store.initialize()
    const task = await store.create({ schemaId: TASK_SCHEMA, properties: { title: 'T' } })
    const page = await store.create({ schemaId: PAGE_SCHEMA, properties: { title: 'P' } })

    const sink = new MemoryBundleSink()
    await writeBundle(store, { kind: 'schemas', schemaIds: [PAGE_SCHEMA] }, sink, {
      ownerDid: did,
      manifestSigner: signerFor(privateKey)
    })

    const b = createTestStore({ did, privateKey })
    await b.store.initialize()
    await applyBundle(b.store, sink.toSource(), { importerDid: did })
    expect(await b.store.get(page.id)).not.toBeNull()
    expect(await b.store.get(task.id)).toBeNull()
  })
})

describe('xnetpack hostile input', () => {
  async function tamperedBundle(mutate: (entries: Map<string, Uint8Array>) => void) {
    const a = createTestStore()
    await a.store.initialize()
    await seedStore(a.store, 2)
    const sink = new MemoryBundleSink()
    await writeBundle(a.store, { kind: 'full' }, sink, {
      ownerDid: a.did,
      manifestSigner: signerFor(a.privateKey)
    })
    mutate(sink.entries)
    return { source: sink.toSource(), identity: a }
  }

  it('rejects a tampered change payload (hash mismatch + digest mismatch)', async () => {
    const { source, identity } = await tamperedBundle((entries) => {
      const text = decodeUtf8(entries.get(BUNDLE_ENTRY.changes)!)
      entries.set(BUNDLE_ENTRY.changes, encodeUtf8(text.replace('Task 0', 'EVIL 0')))
    })
    const report = await verifyBundle(source)
    expect(report.ok).toBe(false)
    expect(report.issues.some((i) => i.code === 'change-hash-invalid')).toBe(true)
    expect(report.issues.some((i) => i.code === 'content-digest-mismatch')).toBe(true)

    const b = createTestStore({ did: identity.did, privateKey: identity.privateKey })
    await b.store.initialize()
    await expect(
      applyBundle(b.store, source, { importerDid: identity.did })
    ).rejects.toMatchObject({ code: 'verify-failed' })
    expect(await b.store.getAllChanges()).toEqual([])
  })

  it('rejects a forged change signature', async () => {
    const { source } = await tamperedBundle((entries) => {
      const lines = decodeUtf8(entries.get(BUNDLE_ENTRY.changes)!).trim().split('\n')
      const record = JSON.parse(lines[0])
      // Re-sign the same hash with a different key: hash verifies, signature must not.
      const attacker = generateSigningKeyPair()
      record.signatureB64 = Buffer.from(
        sign(new TextEncoder().encode(record.hash), attacker.privateKey)
      ).toString('base64')
      lines[0] = JSON.stringify(record)
      entries.set(BUNDLE_ENTRY.changes, encodeUtf8(lines.join('\n') + '\n'))
    })
    const report = await verifyBundle(source)
    expect(report.ok).toBe(false)
    expect(report.issues.some((i) => i.code === 'change-signature-invalid')).toBe(true)
  })

  it('rejects a manifest whose signature does not match the owner DID', async () => {
    const { source } = await tamperedBundle((entries) => {
      const manifest = JSON.parse(decodeUtf8(entries.get(BUNDLE_ENTRY.manifest)!))
      manifest.createdAt = manifest.createdAt + 1 // any post-signing edit
      entries.set(BUNDLE_ENTRY.manifest, encodeUtf8(JSON.stringify(manifest)))
    })
    const report = await verifyBundle(source)
    expect(report.ok).toBe(false)
    expect(report.issues.some((i) => i.code === 'manifest-signature-invalid')).toBe(true)
  })

  it('rejects an unsupported future format/protocol version', async () => {
    const { source } = await tamperedBundle((entries) => {
      const manifest = JSON.parse(decodeUtf8(entries.get(BUNDLE_ENTRY.manifest)!))
      manifest.formatVersion = 'xnetpack/999'
      entries.set(BUNDLE_ENTRY.manifest, encodeUtf8(JSON.stringify(manifest)))
    })
    const report = await verifyBundle(source)
    expect(report.ok).toBe(false)
    expect(report.issues.some((i) => i.code === 'unknown-format')).toBe(true)
  })

  it('refuses a foreign owner without allowForeignOwner, imports with it', async () => {
    const a = createTestStore()
    await a.store.initialize()
    await seedStore(a.store, 1)
    const { source } = await exportFull(a.store, a.did, a.privateKey)

    const b = createTestStore() // different identity
    await b.store.initialize()
    await expect(applyBundle(b.store, source, { importerDid: b.did })).rejects.toMatchObject({
      code: 'foreign-owner'
    })

    const result = await applyBundle(b.store, source, {
      importerDid: b.did,
      allowForeignOwner: true
    })
    expect(result.applied).toBeGreaterThan(0)
  })

  it('refuses an unsigned manifest without allowUnsigned', async () => {
    const a = createTestStore()
    await a.store.initialize()
    await seedStore(a.store, 1)
    const sink = new MemoryBundleSink()
    await writeBundle(a.store, { kind: 'full' }, sink, { ownerDid: a.did }) // no signer

    const b = createTestStore({ did: a.did, privateKey: a.privateKey })
    await b.store.initialize()
    await expect(
      applyBundle(b.store, sink.toSource(), { importerDid: a.did })
    ).rejects.toMatchObject({ code: 'unsigned-manifest' })

    const result = await applyBundle(b.store, sink.toSource(), {
      importerDid: a.did,
      allowUnsigned: true
    })
    expect(result.applied).toBeGreaterThan(0)
  })
})

describe('xnetpack blob and yjs ports', () => {
  function memoryBlobPort(initial: Array<{ cid: string; bytes: Uint8Array; mimeType?: string }>) {
    const blobs = new Map(initial.map((b) => [b.cid, b]))
    const port: BundleBlobPort = {
      async *list() {
        yield* blobs.values()
      },
      async has(cid) {
        return blobs.has(cid)
      },
      async put(bytes, meta) {
        blobs.set(meta?.cid ?? `cid:blake3:${hashHex(bytes)}`, {
          cid: meta?.cid ?? `cid:blake3:${hashHex(bytes)}`,
          bytes,
          mimeType: meta?.mimeType
        })
      }
    }
    return { port, blobs }
  }

  function memoryYjsPort(initial: Array<{ nodeId: string; update: Uint8Array }>) {
    const docs = new Map(initial.map((d) => [d.nodeId, d.update]))
    const applied: string[] = []
    const port: BundleYjsPort = {
      async *list() {
        for (const [nodeId, update] of docs) yield { nodeId, update }
      },
      async apply(nodeId, update) {
        applied.push(nodeId)
        docs.set(nodeId, update)
      }
    }
    return { port, docs, applied }
  }

  it('round-trips blobs (content-addressed) and yjs doc states', async () => {
    const a = createTestStore()
    await a.store.initialize()
    await seedStore(a.store, 1)

    const bytes = encodeUtf8('hello blob')
    const cid = `cid:blake3:${hashHex(bytes)}`
    const source = memoryBlobPort([{ cid, bytes, mimeType: 'text/plain' }])
    const yjsSource = memoryYjsPort([{ nodeId: 'node-1', update: encodeUtf8('fake-update') }])

    const sink = new MemoryBundleSink()
    const manifest = await writeBundle(a.store, { kind: 'full' }, sink, {
      ownerDid: a.did,
      manifestSigner: signerFor(a.privateKey),
      blobPort: source.port,
      yjsPort: yjsSource.port
    })
    expect(manifest.counts.blobs).toBe(1)
    expect(manifest.counts.yjsDocs).toBe(1)
    expect(sink.entries.has(blobEntryPath(cid))).toBe(true)

    const report = await verifyBundle(sink.toSource())
    expect(report.ok).toBe(true)

    const b = createTestStore({ did: a.did, privateKey: a.privateKey })
    await b.store.initialize()
    const destBlobs = memoryBlobPort([])
    const destYjs = memoryYjsPort([])
    const result = await applyBundle(b.store, sink.toSource(), {
      importerDid: a.did,
      blobPort: destBlobs.port,
      yjsPort: destYjs.port
    })
    expect(result.blobsInstalled).toBe(1)
    expect(result.yjsDocsApplied).toBe(1)
    expect(destBlobs.blobs.get(cid)?.mimeType).toBe('text/plain')
    expect(destYjs.applied).toEqual(['node-1'])
  })

  it('store yjs port: re-import into a store that already has the doc does not duplicate', async () => {
    const a = createTestStore()
    await a.store.initialize()
    const [node] = await seedStore(a.store, 1)

    // Author a doc on A.
    const docA = new Y.Doc()
    docA.getText('body').insert(0, 'hello world')
    await a.store.setDocumentContent(node.id, Y.encodeStateAsUpdate(docA))

    const sink = new MemoryBundleSink()
    await writeBundle(a.store, { kind: 'full' }, sink, {
      ownerDid: a.did,
      manifestSigner: signerFor(a.privateKey),
      yjsPort: createStoreYjsPort(a.store)
    })

    // B already has the same doc plus a local edit.
    const b = createTestStore({ did: a.did, privateKey: a.privateKey })
    await b.store.initialize()
    const docB = new Y.Doc()
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA))
    docB.getText('body').insert(docB.getText('body').length, ' + local edit')
    // The change log must exist on B for the node row; import brings it.
    const result = await applyBundle(b.store, sink.toSource(), {
      importerDid: a.did,
      yjsPort: createStoreYjsPort(b.store)
    })
    expect(result.yjsDocsApplied).toBe(1)
    await b.store.setDocumentContent(node.id, Y.encodeStateAsUpdate(docB))
    const second = await applyBundle(b.store, sink.toSource(), {
      importerDid: a.did,
      yjsPort: createStoreYjsPort(b.store)
    })
    expect(second.yjsDocsApplied).toBe(1)

    const mergedBytes = await b.store.getDocumentContent(node.id)
    const merged = new Y.Doc()
    Y.applyUpdate(merged, mergedBytes!)
    // State-vector merge: shared prefix present once, local edit preserved.
    expect(merged.getText('body').toString()).toBe('hello world + local edit')
    docA.destroy()
    docB.destroy()
    merged.destroy()
  })

  it('flags a blob whose bytes do not match its content-addressed filename', async () => {
    const a = createTestStore()
    await a.store.initialize()
    await seedStore(a.store, 1)
    const bytes = encodeUtf8('original')
    const cid = `cid:blake3:${hashHex(bytes)}`
    const { port } = ((): { port: BundleBlobPort } => ({
      port: {
        async *list() {
          yield { cid, bytes }
        },
        async has() {
          return false
        },
        async put() {}
      }
    }))()

    const sink = new MemoryBundleSink()
    await writeBundle(a.store, { kind: 'full' }, sink, {
      ownerDid: a.did,
      manifestSigner: signerFor(a.privateKey),
      blobPort: port
    })
    sink.entries.set(blobEntryPath(cid), encodeUtf8('swapped bytes'))

    const report = await verifyBundle(sink.toSource())
    expect(report.ok).toBe(false)
    expect(report.issues.some((i) => i.code === 'blob-digest-mismatch')).toBe(true)
  })
})
