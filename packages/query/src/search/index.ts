/**
 * Full-text search index using MiniSearch
 */
import type { SearchQuery, SearchResult } from '../types'
import type { YDoc } from '@xnetjs/data'
import MiniSearch from 'minisearch'
import { createSearchSnippet, extractDocumentText } from './document'
import {
  summarizeSearchModeration,
  type SearchModerationPolicy,
  type SearchModerationSignals
} from './moderation'

export interface SearchableDocument {
  id: string
  ydoc: YDoc
  type: string
  workspace: string
  metadata: { title: string }
  moderation?: SearchModerationSignals
}

export interface SearchIndex {
  add(doc: SearchableDocument): void
  remove(docId: string): void
  update(doc: SearchableDocument): void
  search(query: SearchQuery): SearchResult[]
  clear(): void
}

export type SearchIndexOptions = {
  moderation?: SearchModerationPolicy
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
  includeInSearch: boolean
  moderationScore: number
  moderationReasons: string
}

/**
 * Create a full-text search index
 */
export function createSearchIndex(options: SearchIndexOptions = {}): SearchIndex {
  const miniSearch = new MiniSearch<IndexedDoc>({
    fields: ['title', 'content'],
    storeFields: [
      'id',
      'type',
      'title',
      'workspace',
      'content',
      'includeInSearch',
      'moderationScore',
      'moderationReasons'
    ],
    searchOptions: {
      boost: { title: 2 },
      fuzzy: 0.2,
      prefix: true
    }
  })

  return {
    add(doc: SearchableDocument): void {
      const moderation = summarizeSearchModeration(doc.moderation, options.moderation)
      const indexed: IndexedDoc = {
        id: doc.id,
        type: doc.type,
        title: doc.metadata.title,
        content: extractDocumentText(doc.ydoc),
        workspace: doc.workspace,
        includeInSearch: moderation.includeInSearch,
        moderationScore: moderation.scoreMultiplier,
        moderationReasons: moderation.reasons.join(',')
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

      return results
        .filter((result) => result.includeInSearch !== false)
        .map((result) => ({
          id: result.id,
          type: result.type as string,
          title: result.title as string,
          snippet: createSearchSnippet(String(result.content ?? ''), query.text),
          score: result.score * asNumber(result.moderationScore, 1)
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, query.limit ?? 20)
    },

    clear(): void {
      miniSearch.removeAll()
    }
  }
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}
