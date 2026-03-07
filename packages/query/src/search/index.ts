/**
 * Full-text search index using MiniSearch
 */
import type { SearchQuery, SearchResult } from '../types'
import type { YDoc } from '@xnetjs/data'
import MiniSearch from 'minisearch'
import { createSearchSnippet, extractDocumentText } from './document'

export interface SearchableDocument {
  id: string
  ydoc: YDoc
  type: string
  workspace: string
  metadata: { title: string }
}

export interface SearchIndex {
  add(doc: SearchableDocument): void
  remove(docId: string): void
  update(doc: SearchableDocument): void
  search(query: SearchQuery): SearchResult[]
  clear(): void
}

/**
 * Document structure for indexing
 */
interface IndexedDoc {
  id: string
  type: string
  title: string
  content: string
  workspace: string
}

/**
 * Create a full-text search index
 */
export function createSearchIndex(): SearchIndex {
  const miniSearch = new MiniSearch<IndexedDoc>({
    fields: ['title', 'content'],
    storeFields: ['id', 'type', 'title', 'workspace', 'content'],
    searchOptions: {
      boost: { title: 2 },
      fuzzy: 0.2,
      prefix: true
    }
  })

  return {
    add(doc: SearchableDocument): void {
      const indexed: IndexedDoc = {
        id: doc.id,
        type: doc.type,
        title: doc.metadata.title,
        content: extractDocumentText(doc.ydoc),
        workspace: doc.workspace
      }
      miniSearch.add(indexed)
    },

    remove(docId: string): void {
      miniSearch.discard(docId)
    },

    update(doc: SearchableDocument): void {
      this.remove(doc.id)
      this.add(doc)
    },

    search(query: SearchQuery): SearchResult[] {
      const results = miniSearch.search(query.text, {
        filter: query.filters
          ? (_result) => {
              // Apply filters - simplified
              return true
            }
          : undefined
      })

      return results.slice(0, query.limit ?? 20).map((result) => ({
        id: result.id,
        type: result.type as string,
        title: result.title as string,
        snippet: createSearchSnippet(String(result.content ?? ''), query.text),
        score: result.score
      }))
    },

    clear(): void {
      miniSearch.removeAll()
    }
  }
}
