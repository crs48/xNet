import { generateIdentity } from '@xnetjs/identity'
import { describe, it, expect } from 'vitest'
import * as Y from 'yjs'
import {
  signUpdate,
  verifyUpdate,
  captureUpdate,
  applySignedUpdate,
  mergeDocuments
} from './updates'

function createTestDoc(id = 'doc-1'): Y.Doc {
  const doc = new Y.Doc({ guid: id, gc: false })
  const meta = doc.getMap('metadata')
  meta.set('title', 'Test')
  meta.set('created', Date.now())
  meta.set('updated', Date.now())
  return doc
}

describe('Signed Updates', () => {
  describe('signUpdate and verifyUpdate', () => {
    it('should sign and verify update', () => {
      const { identity, privateKey } = generateIdentity()
      const doc = createTestDoc()

      const update = Y.encodeStateAsUpdate(doc)
      const signed = signUpdate({
        doc,
        update,
        authorDID: identity.did,
        signingKey: privateKey,
        parentHash: 'genesis',
        vectorClock: { [identity.did]: 1 }
      })

      const valid = verifyUpdate(signed, (did) => {
        if (did === identity.did) return identity.publicKey
        return null
      })

      expect(valid).toBe(true)
    })

    it('should reject update with unknown author', () => {
      const { identity, privateKey } = generateIdentity()
      const doc = createTestDoc()

      const update = Y.encodeStateAsUpdate(doc)
      const signed = signUpdate({
        doc,
        update,
        authorDID: identity.did,
        signingKey: privateKey,
        parentHash: 'genesis',
        vectorClock: {}
      })

      const valid = verifyUpdate(signed, () => null)
      expect(valid).toBe(false)
    })

    it('should reject tampered update', () => {
      const { identity, privateKey } = generateIdentity()
      const doc = createTestDoc()

      const update = Y.encodeStateAsUpdate(doc)
      const signed = signUpdate({
        doc,
        update,
        authorDID: identity.did,
        signingKey: privateKey,
        parentHash: 'genesis',
        vectorClock: {}
      })

      signed.update = new Uint8Array([...signed.update])
      signed.update[0] = 0xff

      const valid = verifyUpdate(signed, (did) => {
        if (did === identity.did) return identity.publicKey
        return null
      })

      expect(valid).toBe(false)
    })

    it('should include correct vector clock', () => {
      const { identity, privateKey } = generateIdentity()
      const doc = createTestDoc()

      const update = Y.encodeStateAsUpdate(doc)
      const vectorClock = { peer1: 1, peer2: 3 }
      const signed = signUpdate({
        doc,
        update,
        authorDID: identity.did,
        signingKey: privateKey,
        parentHash: 'genesis',
        vectorClock
      })

      expect(signed.vectorClock).toEqual(vectorClock)
    })
  })

  describe('captureUpdate', () => {
    it('should capture update during transaction', () => {
      const { identity, privateKey } = generateIdentity()
      const doc = createTestDoc()

      const signed = captureUpdate(
        doc,
        identity.did,
        privateKey,
        'genesis',
        { [identity.did]: 1 },
        () => {
          const meta = doc.getMap('metadata')
          meta.set('title', 'Updated Title')
        }
      )

      expect(signed).not.toBeNull()
      expect(signed?.authorDID).toBe(identity.did)
      expect(signed?.update.length).toBeGreaterThan(0)
    })

    it('should return null when no changes made', () => {
      const { identity, privateKey } = generateIdentity()
      const doc = createTestDoc()

      const signed = captureUpdate(doc, identity.did, privateKey, 'genesis', {}, () => {
        // No changes
      })

      expect(signed).toBeNull()
    })
  })

  describe('applySignedUpdate', () => {
    it('should apply update to document', () => {
      const { identity, privateKey } = generateIdentity()

      const source = createTestDoc()
      const initialState = Y.encodeStateAsUpdate(source)

      const signed = captureUpdate(source, identity.did, privateKey, 'genesis', {}, () => {
        const meta = source.getMap('metadata')
        meta.set('title', 'Changed')
      })!

      const target = new Y.Doc({ guid: 'doc-1' })
      Y.applyUpdate(target, initialState)

      const targetMeta = target.getMap('metadata')
      expect(targetMeta.get('title')).toBe('Test')

      applySignedUpdate(target, signed)
      expect(targetMeta.get('title')).toBe('Changed')
    })
  })

  describe('mergeDocuments', () => {
    it('should merge concurrent changes', () => {
      const base = createTestDoc()

      const branch1 = new Y.Doc({ guid: 'doc-1', gc: false })
      Y.applyUpdate(branch1, Y.encodeStateAsUpdate(base))

      const branch2 = new Y.Doc({ guid: 'doc-1', gc: false })
      Y.applyUpdate(branch2, Y.encodeStateAsUpdate(base))

      const meta1 = branch1.getMap('metadata')
      meta1.set('icon', '📝')

      const meta2 = branch2.getMap('metadata')
      meta2.set('cover', 'cover.jpg')

      const target = new Y.Doc({ guid: 'doc-1', gc: false })
      mergeDocuments(target, [branch1, branch2])

      const targetMeta = target.getMap('metadata')
      expect(targetMeta.get('icon')).toBe('📝')
      expect(targetMeta.get('cover')).toBe('cover.jpg')
    })
  })
})
