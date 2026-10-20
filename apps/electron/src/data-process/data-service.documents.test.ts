import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { documentOverlayKey, encodeDocumentOverlay } from '@xnetjs/data/store'
import { expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { createDataService } from './data-service'

it('hydrates and forwards committed overlays through the data owner across restarts and stale flushes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'xnet-owner-doc-'))
  let service = createDataService({ dbPath: join(directory, 'test.db') })
  const original = new Y.Doc(),
    edited = new Y.Doc(),
    received = new Y.Doc()
  const port = {
    postMessage: vi.fn((message: { type: string; update: number[] }) => {
      if (message.type === 'update') Y.applyUpdate(received, new Uint8Array(message.update))
    }),
    on: vi.fn(),
    start: vi.fn(),
    close: vi.fn()
  }
  try {
    await service.initialize()
    await service.setNode({
      id: 'page',
      schemaId: 'xnet://xnet.fyi/Page',
      properties: {},
      timestamps: {},
      createdAt: 1,
      updatedAt: 1,
      createdBy: 'did:key:owner',
      updatedBy: 'did:key:owner',
      deleted: false
    })
    original.getText('text').insert(0, 'Before')
    const stale = Y.encodeStateAsUpdate(original)
    await service.setDocumentContent('page', Array.from(stale))
    service.attachRendererPort('test', port as unknown as Electron.MessagePortMain)
    await service.acquireDoc('page', 'xnet://xnet.fyi/Page', 'test')
    expect(received.getText('text').toString()).toBe('Before')
    Y.applyUpdate(edited, stale)
    edited.getText('text').delete(0, 6)
    edited.getText('text').insert(0, 'Accepted')
    await service.applyNodeBatch({
      batchId: 'edit',
      nodes: [],
      changes: [],
      affectedSchemaIds: [],
      lastLamportTime: 0,
      indexMode: 'touched',
      conditions: {
        nodes: [],
        deadline: Date.now() + 5000,
        localState: [
          {
            key: documentOverlayKey('page'),
            expected: null,
            value: encodeDocumentOverlay(Y.encodeStateAsUpdate(edited))
          }
        ]
      }
    })
    expect(received.getText('text').toString()).toBe('Accepted')
    await service.setDocumentContent('page', Array.from(stale))
    await service.shutdown()
    service = createDataService({ dbPath: join(directory, 'test.db') })
    await service.initialize()
    service.attachRendererPort('reopened', port as unknown as Electron.MessagePortMain)
    await service.acquireDoc('page', 'xnet://xnet.fyi/Page', 'reopened')
    const saved = new Y.Doc()
    Y.applyUpdate(saved, new Uint8Array((await service.getDocumentContent('page'))!))
    expect(saved.getText('text').toString()).toBe('Accepted')
    saved.destroy()
    await service.deleteNode('page')
    expect(await service.getDocumentContent('page')).toBeNull()
    expect(service.getStatus().poolSize).toBe(0)
  } finally {
    await service.shutdown()
    original.destroy()
    edited.destroy()
    received.destroy()
    await rm(directory, { recursive: true, force: true })
  }
})
