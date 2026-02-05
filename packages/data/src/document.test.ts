import { generateIdentity } from '@xnet/identity'
import { describe, it, expect } from 'vitest'
import {
  createDocument,
  loadDocument,
  getDocumentState,
  setDocumentTitle,
  setDocumentArchived
} from './document'

describe('XDocument', () => {
  describe('createDocument', () => {
    it('should create document with metadata', () => {
      const { identity, privateKey } = generateIdentity()
      const doc = createDocument({
        id: 'doc-1',
        workspace: 'ws-1',
        type: 'page',
        title: 'Test Page',
        createdBy: identity.did,
        signingKey: privateKey
      })

      expect(doc.id).toBe('doc-1')
      expect(doc.metadata.title).toBe('Test Page')
      expect(doc.type).toBe('page')
      expect(doc.workspace).toBe('ws-1')
      expect(doc.metadata.createdBy).toBe(identity.did)
      expect(doc.metadata.archived).toBe(false)
    })

    it('should create different document types', () => {
      const { identity, privateKey } = generateIdentity()

      const page = createDocument({
        id: 'page-1',
        workspace: 'ws-1',
        type: 'page',
        title: 'Page',
        createdBy: identity.did,
        signingKey: privateKey
      })

      const task = createDocument({
        id: 'task-1',
        workspace: 'ws-1',
        type: 'task',
        title: 'Task',
        createdBy: identity.did,
        signingKey: privateKey
      })

      expect(page.type).toBe('page')
      expect(task.type).toBe('task')
    })

    it('should initialize Yjs structures', () => {
      const { identity, privateKey } = generateIdentity()
      const doc = createDocument({
        id: 'doc-1',
        workspace: 'ws-1',
        type: 'page',
        title: 'Test',
        createdBy: identity.did,
        signingKey: privateKey
      })

      // Check metadata map exists
      const meta = doc.ydoc.getMap('metadata')
      expect(meta.get('title')).toBe('Test')

      // Check blocks array exists
      const blocks = doc.ydoc.getArray('blocks')
      expect(blocks).toBeDefined()

      // Check blockMap exists
      const blockMap = doc.ydoc.getMap('blockMap')
      expect(blockMap.get('root')).toBeDefined()
    })
  })

  describe('loadDocument', () => {
    it('should round-trip document state', () => {
      const { identity, privateKey } = generateIdentity()
      const doc = createDocument({
        id: 'doc-1',
        workspace: 'ws-1',
        type: 'page',
        title: 'Test',
        createdBy: identity.did,
        signingKey: privateKey
      })

      const state = getDocumentState(doc)
      const loaded = loadDocument('doc-1', 'ws-1', 'page', state)

      expect(loaded.metadata.title).toBe('Test')
      expect(loaded.metadata.createdBy).toBe(identity.did)
      expect(loaded.metadata.archived).toBe(false)
    })

    it('should preserve document modifications', () => {
      const { identity, privateKey } = generateIdentity()
      const doc = createDocument({
        id: 'doc-1',
        workspace: 'ws-1',
        type: 'page',
        title: 'Original',
        createdBy: identity.did,
        signingKey: privateKey
      })

      // Modify the document
      setDocumentTitle(doc, 'Modified')

      const state = getDocumentState(doc)
      const loaded = loadDocument('doc-1', 'ws-1', 'page', state)

      expect(loaded.metadata.title).toBe('Modified')
    })
  })

  describe('setDocumentTitle', () => {
    it('should update title', () => {
      const { identity, privateKey } = generateIdentity()
      const doc = createDocument({
        id: 'doc-1',
        workspace: 'ws-1',
        type: 'page',
        title: 'Original',
        createdBy: identity.did,
        signingKey: privateKey
      })

      setDocumentTitle(doc, 'New Title')

      expect(doc.metadata.title).toBe('New Title')

      // Verify in Yjs
      const meta = doc.ydoc.getMap('metadata')
      expect(meta.get('title')).toBe('New Title')
    })
  })

  describe('setDocumentArchived', () => {
    it('should archive document', () => {
      const { identity, privateKey } = generateIdentity()
      const doc = createDocument({
        id: 'doc-1',
        workspace: 'ws-1',
        type: 'page',
        title: 'Test',
        createdBy: identity.did,
        signingKey: privateKey
      })

      expect(doc.metadata.archived).toBe(false)

      setDocumentArchived(doc, true)

      expect(doc.metadata.archived).toBe(true)

      // Verify in Yjs
      const meta = doc.ydoc.getMap('metadata')
      expect(meta.get('archived')).toBe(true)
    })

    it('should unarchive document', () => {
      const { identity, privateKey } = generateIdentity()
      const doc = createDocument({
        id: 'doc-1',
        workspace: 'ws-1',
        type: 'page',
        title: 'Test',
        createdBy: identity.did,
        signingKey: privateKey
      })

      setDocumentArchived(doc, true)
      setDocumentArchived(doc, false)

      expect(doc.metadata.archived).toBe(false)
    })
  })
})
