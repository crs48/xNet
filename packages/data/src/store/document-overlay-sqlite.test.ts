import type { NodeState, ApplyNodeBatchInput } from './types'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { generateSigningKeyPair } from '@xnetjs/crypto'
import { createDID } from '@xnetjs/identity'
import { createElectronSQLiteAdapter } from '@xnetjs/sqlite/electron'
import { expect, it } from 'vitest'
import * as Y from 'yjs'
import { documentOverlayKey, encodeDocumentOverlay } from './document-overlay'
import { SQLiteNodeStorageAdapter } from './sqlite-adapter'
import { NodeStore } from './store'

it('reopens committed overlays on native SQLite, rolls back rejected edits, and clears physically deleted content', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'xnet-overlay-'))
  let db = await createElectronSQLiteAdapter({ path: join(directory, 'test.db') })
  const original = new Y.Doc(),
    edited = new Y.Doc(),
    reopened = new Y.Doc()
  try {
    let storage = new SQLiteNodeStorageAdapter(db)
    const pair = generateSigningKeyPair(),
      authorDID = createDID(pair.publicKey)
    let store = new NodeStore({ storage, authorDID, signingKey: pair.privateKey })
    await store.initialize()
    const node: NodeState = {
      id: 'page',
      schemaId: 'xnet://xnet.fyi/Page',
      properties: { title: 'Page' },
      createdAt: 1,
      updatedAt: 1,
      createdBy: authorDID,
      updatedBy: authorDID,
      deleted: false,
      timestamps: {}
    }
    await storage.setNode(node)
    original.getText('text').insert(0, 'Before')
    const stale = Y.encodeStateAsUpdate(original)
    await storage.setDocumentContent('page', stale)
    Y.applyUpdate(edited, stale)
    edited.getText('text').delete(0, 6)
    edited.getText('text').insert(0, 'Accepted')
    await storage.setAppState('approval', 'active')
    const batch: ApplyNodeBatchInput = {
      batchId: 'doc-edit',
      nodes: [],
      changes: [],
      lastLamportTime: 0,
      affectedSchemaIds: [],
      indexMode: 'touched',
      conditions: {
        nodes: [{ id: node.id, expected: node }],
        deadline: Date.now() + 5000,
        localState: [
          { key: 'approval', expected: 'active', value: 'active:1' },
          {
            key: documentOverlayKey('page'),
            expected: null,
            value: encodeDocumentOverlay(Y.encodeStateAsUpdate(edited))
          }
        ],
        receipt: { key: 'receipt', context: 'document.edit' }
      }
    }
    await store.transaction([], batch.conditions)
    await storage.setDocumentContent('page', stale)
    await db.close()
    db = await createElectronSQLiteAdapter({ path: join(directory, 'test.db') })
    storage = new SQLiteNodeStorageAdapter(db)
    store = new NodeStore({ storage, authorDID, signingKey: pair.privateKey })
    await store.initialize()
    Y.applyUpdate(reopened, (await storage.getDocumentContent('page'))!)
    expect(reopened.getText('text').toString()).toBe('Accepted')
    expect(await storage.getAppState('approval')).toBe('active:1')
    expect(await storage.getAppState('receipt')).not.toBeNull()
    await storage.setAppState('approval', 'revoked')
    const accepted = await storage.getAppState(documentOverlayKey('page'))
    await expect(
      store.transaction([], {
        ...batch.conditions!,
        receipt: { key: 'rejected-receipt', context: 'document.edit' },
        localState: [
          {
            key: documentOverlayKey('page'),
            expected: accepted,
            value: encodeDocumentOverlay(stale)
          },
          { key: 'approval', expected: 'active:1', value: 'active:2' }
        ]
      })
    ).rejects.toThrow('changed')
    expect(await storage.getAppState(documentOverlayKey('page'))).toBe(accepted)
    expect(await storage.getAppState('rejected-receipt')).toBeNull()
    reopened.getText('text').insert(8, ' later')
    await storage.setDocumentContent('page', Y.encodeStateAsUpdate(reopened))
    await storage.setDocumentContent('page', stale)
    const later = new Y.Doc()
    Y.applyUpdate(later, (await storage.getDocumentContent('page'))!)
    expect(later.getText('text').toString()).toBe('Accepted later')
    later.destroy()
    await storage.deleteNode('page')
    expect(await storage.getAppState(documentOverlayKey('page'))).toBeNull()
    expect(await storage.getDocumentContent('page')).toBeNull()
    await storage.setNode(node)
    expect(await storage.getDocumentContent('page')).toBeNull()
  } finally {
    original.destroy()
    edited.destroy()
    reopened.destroy()
    await db.close()
    await rm(directory, { recursive: true, force: true })
  }
})
