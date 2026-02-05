import { describe, it, expect } from 'vitest'
import {
  signUpdate,
  verifyUpdate,
  captureUpdate,
  applySignedUpdate,
  mergeDocuments
} from './updates'
import { createDocument, getDocumentState } from './document'
import type { XDocument } from './types'
import { generateIdentity } from '@xnet/identity'
import * as Y from 'yjs'

describe('Signed Updates', () => {
  describe('signUpdate and verifyUpdate', () => {
    it('should sign and verify update', () => {
      const { identity, privateKey } = generateIdentity()

      const doc = createDocument({
        id: 'doc-1',
        workspace: 'ws-1',
        type: 'page',
        title: 'Test',
        createdBy: identity.did,
        signingKey: privateKey
      })

      const update = Y.encodeStateAsUpdate(doc.ydoc)
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

      const doc = createDocument({
        id: 'doc-1',
        workspace: 'ws-1',
        type: 'page',
        title: 'Test',
        createdBy: identity.did,
        signingKey: privateKey
      })

      const update = Y.encodeStateAsUpdate(doc.ydoc)
      const signed = signUpdate({
        doc,
        update,
        authorDID: identity.did,
        signingKey: privateKey,
        parentHash: 'genesis',
        vectorClock: {}
      })

      // Return null for public key lookup
      const valid = verifyUpdate(signed, () => null)

      expect(valid).toBe(false)
    })

    it('should reject tampered update', () => {
      const { identity, privateKey } = generateIdentity()

      const doc = createDocument({
        id: 'doc-1',
        workspace: 'ws-1',
        type: 'page',
        title: 'Test',
        createdBy: identity.did,
        signingKey: privateKey
      })

      const update = Y.encodeStateAsUpdate(doc.ydoc)
      const signed = signUpdate({
        doc,
        update,
        authorDID: identity.did,
        signingKey: privateKey,
        parentHash: 'genesis',
        vectorClock: {}
      })

      // Tamper with the update
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

      const doc = createDocument({
        id: 'doc-1',
        workspace: 'ws-1',
        type: 'page',
        title: 'Test',
        createdBy: identity.did,
        signingKey: privateKey
      })

      const update = Y.encodeStateAsUpdate(doc.ydoc)
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

      const doc = createDocument({
        id: 'doc-1',
        workspace: 'ws-1',
        type: 'page',
        title: 'Test',
        createdBy: identity.did,
        signingKey: privateKey
      })

      const signed = captureUpdate(
        doc,
        identity.did,
        privateKey,
        'genesis',
        { [identity.did]: 1 },
        () => {
          const meta = doc.ydoc.getMap('metadata')
          meta.set('title', 'Updated Title')
        }
      )

      expect(signed).not.toBeNull()
      expect(signed?.authorDID).toBe(identity.did)
      expect(signed?.update.length).toBeGreaterThan(0)
    })

    it('should return null when no changes made', () => {
      const { identity, privateKey } = generateIdentity()

      const doc = createDocument({
        id: 'doc-1',
        workspace: 'ws-1',
        type: 'page',
        title: 'Test',
        createdBy: identity.did,
        signingKey: privateKey
      })

      const signed = captureUpdate(doc, identity.did, privateKey, 'genesis', {}, () => {
        // No changes
      })

      expect(signed).toBeNull()
    })
  })

  describe('applySignedUpdate', () => {
    it('should apply update to document', () => {
      const { identity, privateKey } = generateIdentity()

      // Create source document
      const source = createDocument({
        id: 'doc-1',
        workspace: 'ws-1',
        type: 'page',
        title: 'Original',
        createdBy: identity.did,
        signingKey: privateKey
      })

      // Get initial state to sync target
      const initialState = getDocumentState(source)

      // Capture the change as a signed update
      const signed = captureUpdate(source, identity.did, privateKey, 'genesis', {}, () => {
        const meta = source.ydoc.getMap('metadata')
        meta.set('title', 'Changed')
      })!

      // Create empty target document and apply initial state
      const targetYdoc = new Y.Doc({ guid: 'doc-1' })
      Y.applyUpdate(targetYdoc, initialState)

      const target: XDocument = {
        id: 'doc-1',
        ydoc: targetYdoc,
        workspace: 'ws-1',
        type: 'page',
        metadata: {
          title: 'Original',
          created: Date.now(),
          updated: Date.now(),
          createdBy: identity.did,
          archived: false
        }
      }

      // Verify initial state synced
      const targetMeta = target.ydoc.getMap('metadata')
      expect(targetMeta.get('title')).toBe('Original')

      // Apply the signed update
      applySignedUpdate(target, signed)

      // Now title should be changed
      expect(targetMeta.get('title')).toBe('Changed')
    })
  })

  describe('mergeDocuments', () => {
    it('should merge concurrent changes', () => {
      const { identity, privateKey } = generateIdentity()

      // Create base document
      const base = createDocument({
        id: 'doc-1',
        workspace: 'ws-1',
        type: 'page',
        title: 'Base',
        createdBy: identity.did,
        signingKey: privateKey
      })

      // Create two branches
      const branch1 = createDocument({
        id: 'doc-1',
        workspace: 'ws-1',
        type: 'page',
        title: 'Base',
        createdBy: identity.did,
        signingKey: privateKey
      })
      Y.applyUpdate(branch1.ydoc, getDocumentState(base))

      const branch2 = createDocument({
        id: 'doc-1',
        workspace: 'ws-1',
        type: 'page',
        title: 'Base',
        createdBy: identity.did,
        signingKey: privateKey
      })
      Y.applyUpdate(branch2.ydoc, getDocumentState(base))

      // Make different changes in each branch
      const meta1 = branch1.ydoc.getMap('metadata')
      meta1.set('icon', '📝')

      const meta2 = branch2.ydoc.getMap('metadata')
      meta2.set('cover', 'cover.jpg')

      // Merge into target
      const target = createDocument({
        id: 'doc-1',
        workspace: 'ws-1',
        type: 'page',
        title: 'Base',
        createdBy: identity.did,
        signingKey: privateKey
      })

      mergeDocuments(target, [branch1, branch2])

      const targetMeta = target.ydoc.getMap('metadata')
      expect(targetMeta.get('icon')).toBe('📝')
      expect(targetMeta.get('cover')).toBe('cover.jpg')
    })
  })
})
