// @vitest-environment node
import type { ExtensionGrant } from './extension-data'
import type { DataBridge } from '@xnetjs/data-bridge'
import { generateSigningKeyPair } from '@xnetjs/crypto'
import { MemoryNodeStorageAdapter, NodeStore, PageSchema } from '@xnetjs/data'
import { createDID } from '@xnetjs/identity'
import { describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { openExtensionAuthority } from './extension-authority'
import { createExtensionDataBridge, readExtensionGrant } from './extension-data'
import { projectExtensionDocument, subscribeExtensionDocuments } from './extension-documents'

function paragraph(text: string) {
  const paragraph = new Y.XmlElement('paragraph')
  const content = new Y.XmlText()
  content.insert(0, text)
  paragraph.insert(0, [content])
  return paragraph
}
async function setup() {
  const pair = generateSigningKeyPair(),
    owner = createDID(pair.publicKey)
  const store = new NodeStore({
    storage: new MemoryNodeStorageAdapter(),
    authorDID: owner,
    signingKey: pair.privateKey
  })
  await store.initialize()
  await store.create({ id: 'page', schemaId: PageSchema._schemaId, properties: { title: 'Notes' } })
  const grant: ExtensionGrant = {
    version: 1,
    owner,
    hash: 'doc-artifact',
    channelIds: [],
    records: [{ id: 'page', schemaId: PageSchema._schemaId }],
    documents: { read: ['page'] }
  }
  const doc = new Y.Doc()
  doc.getXmlFragment('content-v4').insert(0, [paragraph('Approved text')])
  const releaseDoc = vi.fn()
  const bridge: DataBridge = {
    ...createExtensionDataBridge({ grant, nodes: [] }),
    get: (id) => store.get(id),
    getLocalState: (key) => store.getLocalState(key),
    transaction: (ops, conditions) => store.transaction(ops, conditions),
    acquireDoc: vi.fn(async () => ({
      doc,
      awareness: {} as NonNullable<
        Awaited<ReturnType<NonNullable<DataBridge['acquireDoc']>>>
      >['awareness']
    })),
    releaseDoc
  }
  const opened = (await openExtensionAuthority(bridge, owner, 'docs', grant.hash, grant))!
  return { store, bridge, grant, doc, releaseDoc, authority: opened.authority }
}
describe('scoped document projections', () => {
  it('projects visible text without attributes, embedded data, or deleted history', () => {
    const doc = new Y.Doc({ gc: false })
    const fragment = doc.getXmlFragment('content-v4')
    const hidden = new Y.XmlElement('pageEmbed')
    hidden.setAttribute('nodeId', 'secret-other-record')
    hidden.insert(0, [paragraph('Never disclose a nested resource')])
    fragment.insert(0, [paragraph('Visible'), hidden, paragraph('Deleted secret')])
    fragment.delete(2, 1)
    expect(projectExtensionDocument(doc)).toBe('Visible\n[Embedded resource]')
    doc.destroy()
  })
  it('updates a projection live and releases its host document on revocation', async () => {
    const { bridge, grant, doc, authority, releaseDoc } = await setup()
    const receive = vi.fn(),
      fail = vi.fn(),
      signal = new AbortController()
    const stop = await subscribeExtensionDocuments(
      bridge,
      grant,
      authority,
      receive,
      fail,
      signal.signal
    )
    expect(receive.mock.lastCall?.[0][0].text).toBe('Approved text')
    doc.getXmlFragment('content-v4').insert(1, [paragraph('New text')])
    await vi.waitFor(() => expect(receive.mock.lastCall?.[0][0].text).toContain('New text'))
    const count = receive.mock.calls.length
    await authority.revoke()
    doc.getXmlFragment('content-v4').insert(2, [paragraph('After revocation')])
    await vi.waitFor(() => expect(fail).toHaveBeenCalledOnce())
    expect(receive).toHaveBeenCalledTimes(count)
    expect(releaseDoc).toHaveBeenCalledExactlyOnceWith('page')
    stop()
    doc.destroy()
  })
  it('denies absent or forged document grants and bounds hostile document structure', async () => {
    const { grant, doc } = await setup()
    expect(() =>
      readExtensionGrant(
        JSON.stringify({ ...grant, documents: { read: ['other'] } }),
        grant.owner,
        grant.hash
      )
    ).toThrow('selected pages')
    const oversized = paragraph('x'.repeat(64001))
    doc.getXmlFragment('content-v4').insert(1, [oversized])
    const delta = vi.spyOn(oversized.get(0) as Y.XmlText, 'toDelta')
    expect(() => projectExtensionDocument(doc)).toThrow('64 KiB')
    expect(delta).not.toHaveBeenCalled()
    doc.destroy()
  })
})
