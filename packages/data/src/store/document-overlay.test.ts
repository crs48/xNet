import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { documentOverlayKey, encodeDocumentOverlay, mergeDocumentOverlay } from './document-overlay'
import { MemoryNodeStorageAdapter } from './memory-adapter'

describe('durable document overlays', () => {
  it('preserves accepted edits, subsequent edits, and tombstones across stale snapshot saves', async () => {
    const storage = new MemoryNodeStorageAdapter()
    const base = new Y.Doc(),
      edited = new Y.Doc(),
      other = new Y.Doc()
    base.getText('text').insert(0, 'Original')
    const stale = Y.encodeStateAsUpdate(base)
    Y.applyUpdate(edited, stale)
    edited.getText('text').delete(0, 8)
    edited.getText('text').insert(0, 'Accepted')
    await storage.setDocumentContent('page', stale)
    await storage.applyNodeBatch({
      batchId: 'edit',
      nodes: [],
      changes: [],
      lastLamportTime: 0,
      affectedSchemaIds: [],
      indexMode: 'eager',
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
    Y.applyUpdate(other, (await storage.getDocumentContent('page'))!)
    expect(other.getText('text').toString()).toBe('Accepted')
    other.getText('text').insert(8, ' and later')
    await storage.setDocumentContent('page', Y.encodeStateAsUpdate(other))
    await storage.setDocumentContent('page', stale)
    const reopened = new Y.Doc()
    Y.applyUpdate(reopened, (await storage.getDocumentContent('page'))!)
    expect(reopened.getText('text').toString()).toBe('Accepted and later')
    await expect(
      storage.applyNodeBatch({
        batchId: 'revoked',
        nodes: [],
        changes: [],
        lastLamportTime: 0,
        affectedSchemaIds: [],
        indexMode: 'eager',
        conditions: {
          nodes: [],
          deadline: Date.now() + 5000,
          localState: [{ key: documentOverlayKey('page'), expected: null, value: 'bad' }]
        }
      })
    ).rejects.toThrow('changed')
    for (const doc of [base, edited, other, reopened]) doc.destroy()
  })
  it('fails closed on malformed or oversized overlays without treating them as empty', () => {
    expect(() => mergeDocumentOverlay(null, 'not json')).toThrow()
    expect(() => mergeDocumentOverlay(null, '{"version":2,"update":"AA=="}')).toThrow()
    expect(() => encodeDocumentOverlay(new Uint8Array(128001))).toThrow('budget')
    expect(mergeDocumentOverlay(null, null)).toBeNull()
  })
})
