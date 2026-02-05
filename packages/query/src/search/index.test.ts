import { createDocument } from '@xnet/data'
import { generateIdentity } from '@xnet/identity'
import { describe, it, expect, beforeEach } from 'vitest'
import { createSearchIndex, type SearchIndex } from './index'

describe('SearchIndex', () => {
  let index: SearchIndex

  beforeEach(() => {
    index = createSearchIndex()
  })

  describe('add and search', () => {
    it('should add and search document', () => {
      const { identity, privateKey } = generateIdentity()
      const doc = createDocument({
        id: 'doc-1',
        workspace: 'ws-1',
        type: 'page',
        title: 'Meeting Notes',
        createdBy: identity.did,
        signingKey: privateKey
      })

      index.add(doc)
      const results = index.search({ text: 'meeting' })

      expect(results).toHaveLength(1)
      expect(results[0].title).toBe('Meeting Notes')
    })

    it('should search multiple documents', () => {
      const { identity, privateKey } = generateIdentity()

      const doc1 = createDocument({
        id: 'doc-1',
        workspace: 'ws-1',
        type: 'page',
        title: 'Project Planning',
        createdBy: identity.did,
        signingKey: privateKey
      })

      const doc2 = createDocument({
        id: 'doc-2',
        workspace: 'ws-1',
        type: 'page',
        title: 'Project Notes',
        createdBy: identity.did,
        signingKey: privateKey
      })

      index.add(doc1)
      index.add(doc2)

      const results = index.search({ text: 'project' })
      expect(results).toHaveLength(2)
    })
  })

  describe('remove', () => {
    it('should remove document from index', () => {
      const { identity, privateKey } = generateIdentity()
      const doc = createDocument({
        id: 'doc-1',
        workspace: 'ws-1',
        type: 'page',
        title: 'Test Document',
        createdBy: identity.did,
        signingKey: privateKey
      })

      index.add(doc)
      index.remove(doc.id)
      const results = index.search({ text: 'test' })

      expect(results).toHaveLength(0)
    })
  })

  describe('update', () => {
    it('should update document in index', () => {
      const { identity, privateKey } = generateIdentity()
      const doc = createDocument({
        id: 'doc-1',
        workspace: 'ws-1',
        type: 'page',
        title: 'Alpha Title',
        createdBy: identity.did,
        signingKey: privateKey
      })

      index.add(doc)

      // Verify initial state
      const initialResults = index.search({ text: 'alpha' })
      expect(initialResults).toHaveLength(1)

      // Update the document title in metadata AND Yjs map
      const newTitle = 'Beta Title'
      doc.metadata.title = newTitle
      const meta = doc.ydoc.getMap('metadata')
      meta.set('title', newTitle)
      index.update(doc)

      // Should find by new title
      const newResults = index.search({ text: 'beta' })
      expect(newResults).toHaveLength(1)
      expect(newResults[0].title).toBe('Beta Title')
    })
  })

  describe('fuzzy search', () => {
    it('should handle fuzzy search', () => {
      const { identity, privateKey } = generateIdentity()
      const doc = createDocument({
        id: 'doc-1',
        workspace: 'ws-1',
        type: 'page',
        title: 'Configuration',
        createdBy: identity.did,
        signingKey: privateKey
      })

      index.add(doc)
      const results = index.search({ text: 'config' })

      expect(results.length).toBeGreaterThan(0)
    })

    it('should handle prefix search', () => {
      const { identity, privateKey } = generateIdentity()
      const doc = createDocument({
        id: 'doc-1',
        workspace: 'ws-1',
        type: 'page',
        title: 'Documentation',
        createdBy: identity.did,
        signingKey: privateKey
      })

      index.add(doc)
      const results = index.search({ text: 'doc' })

      expect(results.length).toBeGreaterThan(0)
    })
  })

  describe('limits', () => {
    it('should respect search limit', () => {
      const { identity, privateKey } = generateIdentity()

      for (let i = 0; i < 30; i++) {
        const doc = createDocument({
          id: `doc-${i}`,
          workspace: 'ws-1',
          type: 'page',
          title: `Test Document ${i}`,
          createdBy: identity.did,
          signingKey: privateKey
        })
        index.add(doc)
      }

      const results = index.search({ text: 'test', limit: 5 })
      expect(results).toHaveLength(5)
    })
  })

  describe('clear', () => {
    it('should clear all documents', () => {
      const { identity, privateKey } = generateIdentity()

      for (let i = 0; i < 5; i++) {
        const doc = createDocument({
          id: `doc-${i}`,
          workspace: 'ws-1',
          type: 'page',
          title: `Document ${i}`,
          createdBy: identity.did,
          signingKey: privateKey
        })
        index.add(doc)
      }

      index.clear()
      const results = index.search({ text: 'document' })
      expect(results).toHaveLength(0)
    })
  })
})
