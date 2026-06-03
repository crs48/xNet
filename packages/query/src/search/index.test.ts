import { YDoc } from '@xnetjs/data'
import { describe, it, expect, beforeEach } from 'vitest'
import * as Y from 'yjs'
import {
  createSearchIndex,
  type SearchIndex,
  type SearchableDocument,
  type SearchIndexOptions
} from './index'

function createTestDoc(
  id: string,
  type: string,
  title: string,
  body = title,
  options: Partial<SearchableDocument> = {}
): SearchableDocument {
  const ydoc = new YDoc({ guid: id, gc: false })
  const paragraph = new Y.XmlElement('paragraph')
  paragraph.insert(0, [new Y.XmlText(body)])
  ydoc.getXmlFragment('content').insert(0, [paragraph])
  return { id, ydoc, type, workspace: 'ws-1', metadata: { title }, ...options }
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

    it('should search document body text and produce a snippet', () => {
      index.add(
        createTestDoc(
          'doc-1',
          'page',
          'Field Notes',
          'Harvest logistics depend on the south orchard irrigation schedule.'
        )
      )

      const results = index.search({ text: 'irrigation' })

      expect(results).toHaveLength(1)
      expect(results[0].snippet).toContain('irrigation')
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

  describe('moderation signals', () => {
    it('excludes high-confidence abuse labels from search by default', () => {
      index.add(
        createTestDoc('doc-1', 'page', 'Fraud Campaign', 'fraud campaign details', {
          moderation: {
            labels: [{ value: 'spam', confidence: 0.94, sourceWeight: 2 }]
          }
        })
      )

      expect(index.search({ text: 'fraud' })).toHaveLength(0)
    })

    it('lets stronger safe labels override abuse labels', () => {
      index.add(
        createTestDoc('doc-1', 'page', 'Appeal Notes', 'appeal notes', {
          moderation: {
            labels: [
              { value: 'spam', confidence: 0.88, sourceWeight: 1 },
              { value: 'safe', confidence: 0.92, sourceWeight: 1 }
            ]
          }
        })
      )

      expect(index.search({ text: 'appeal' })).toHaveLength(1)
    })

    it('demotes slop labels without removing the document', () => {
      index.add(createTestDoc('clean', 'page', 'Research Brief', 'research brief'))
      index.add(
        createTestDoc('slop', 'page', 'Research Brief', 'research brief', {
          moderation: {
            labels: [{ value: 'slop', confidence: 0.9, sourceWeight: 2 }]
          }
        })
      )

      const results = index.search({ text: 'research' })

      expect(results.map((result) => result.id)).toEqual(['clean', 'slop'])
      expect(results[0].score).toBeGreaterThan(results[1].score)
    })

    it('demotes low-support quality signals in ranking', () => {
      index.add(createTestDoc('sourced', 'page', 'Policy Memo', 'policy memo'))
      index.add(
        createTestDoc('unsupported', 'page', 'Policy Memo', 'policy memo', {
          moderation: {
            qualitySignals: [{ signal: 'citation-coverage', score: 0.1, confidence: 0.9 }]
          }
        })
      )

      expect(index.search({ text: 'policy' }).map((result) => result.id)).toEqual([
        'sourced',
        'unsupported'
      ])
    })

    it('can include hidden documents for review search indexes', () => {
      const reviewIndex = createSearchIndex({
        moderation: { includeHidden: true }
      } satisfies SearchIndexOptions)
      reviewIndex.add(
        createTestDoc('doc-1', 'page', 'Review Queue', 'review queue', {
          moderation: {
            labels: [{ value: 'spam', confidence: 0.94, sourceWeight: 2 }]
          }
        })
      )

      expect(reviewIndex.search({ text: 'review' })).toHaveLength(1)
    })
  })
})
