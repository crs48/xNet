/**
 * Full-text search index using MiniSearch
 */
import type { SearchQuery, SearchResult } from '../types'
import type { YDoc } from '@xnet/data'
import MiniSearch from 'minisearch'

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
    storeFields: ['id', 'type', 'title', 'workspace'],
    searchOptions: {
      boost: { title: 2 },
      fuzzy: 0.2,
      prefix: true
    }
  })

  /**
   * Extract searchable text from a document
   */
  function extractText(doc: SearchableDocument): string {
    // Extract text from Yjs document
    // Simplified - would walk through blocks and extract text content
    const meta = doc.ydoc.getMap('metadata')
    return (meta.get('title') as string) ?? ''
  }

  return {
    add(doc: SearchableDocument): void {
      const indexed: IndexedDoc = {
        id: doc.id,
        type: doc.type,
        title: doc.metadata.title,
        content: extractText(doc),
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
        snippet: '', // Would generate snippet from content
        score: result.score
      }))
    },

    clear(): void {
      miniSearch.removeAll()
    }
  }
}
