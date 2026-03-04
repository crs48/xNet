import { YDoc } from '@xnetjs/data'
import { describe, it, expect, beforeEach } from 'vitest'
import { createSearchIndex, type SearchIndex, type SearchableDocument } from './index'

function createTestDoc(id: string, type: string, title: string): SearchableDocument {
  const ydoc = new YDoc({ guid: id, gc: false })
  const meta = ydoc.getMap('metadata')
  meta.set('title', title)
  return { id, ydoc, type, workspace: 'ws-1', metadata: { title } }
}

describe('SearchIndex', () => {
  let index: SearchIndex

  beforeEach(() => {
    index = createSearchIndex()
  })

  describe('add and search', () => {
    it('should add and search document', () => {
      const doc = createTestDoc('doc-1', 'page', 'Meeting Notes')
      index.add(doc)
      const results = index.search({ text: 'meeting' })
      expect(results).toHaveLength(1)
      expect(results[0].title).toBe('Meeting Notes')
    })

    it('should search multiple documents', () => {
      index.add(createTestDoc('doc-1', 'page', 'Project Planning'))
      index.add(createTestDoc('doc-2', 'page', 'Project Notes'))
      const results = index.search({ text: 'project' })
      expect(results).toHaveLength(2)
    })
  })

  describe('remove', () => {
    it('should remove document from index', () => {
      const doc = createTestDoc('doc-1', 'page', 'Test Document')
      index.add(doc)
      index.remove(doc.id)
      const results = index.search({ text: 'test' })
      expect(results).toHaveLength(0)
    })
  })

  describe('update', () => {
    it('should update document in index', () => {
      const doc = createTestDoc('doc-1', 'page', 'Alpha Title')
      index.add(doc)

      const initialResults = index.search({ text: 'alpha' })
      expect(initialResults).toHaveLength(1)

      const newTitle = 'Beta Title'
      doc.metadata.title = newTitle
      const meta = doc.ydoc.getMap('metadata')
      meta.set('title', newTitle)
      index.update(doc)

      const newResults = index.search({ text: 'beta' })
      expect(newResults).toHaveLength(1)
      expect(newResults[0].title).toBe('Beta Title')
    })
  })

  describe('fuzzy search', () => {
    it('should handle fuzzy search', () => {
      index.add(createTestDoc('doc-1', 'page', 'Configuration'))
      const results = index.search({ text: 'config' })
      expect(results.length).toBeGreaterThan(0)
    })

    it('should handle prefix search', () => {
      index.add(createTestDoc('doc-1', 'page', 'Documentation'))
      const results = index.search({ text: 'doc' })
      expect(results.length).toBeGreaterThan(0)
    })
  })

  describe('limits', () => {
    it('should respect search limit', () => {
      for (let i = 0; i < 30; i++) {
        index.add(createTestDoc(`doc-${i}`, 'page', `Test Document ${i}`))
      }
      const results = index.search({ text: 'test', limit: 5 })
      expect(results).toHaveLength(5)
    })
  })

  describe('clear', () => {
    it('should clear all documents', () => {
      for (let i = 0; i < 5; i++) {
        index.add(createTestDoc(`doc-${i}`, 'page', `Document ${i}`))
      }
      index.clear()
      const results = index.search({ text: 'document' })
      expect(results).toHaveLength(0)
    })
  })
})
