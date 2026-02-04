/**
 * @xnet/hub - Query and indexing service.
 */

import type { DocMeta, HubStorage, SearchOptions, SearchResult } from '../storage/interface'
import { sanitizeFtsQuery } from '../utils/fts'

export type QueryRequest = {
  type: 'query-request'
  id: string
  query: string
  filters?: {
    schemaIri?: string
    ownerDid?: string
  }
  limit?: number
  offset?: number
  federate?: boolean
}

export type QueryResponse = {
  type: 'query-response'
  id: string
  results: SearchResult[]
  total: number
  took: number
}

export type IndexUpdate = {
  type: 'index-update'
  docId: string
  meta: {
    schemaIri: string
    title: string
    properties?: Record<string, unknown>
  }
  text?: string
}

export type IndexAck = {
  type: 'index-ack'
  docId: string
  indexed: boolean
}

export class QueryService {
  constructor(private storage: HubStorage) {}

  async handleQuery(request: QueryRequest): Promise<QueryResponse> {
    const start = Date.now()

    const options: SearchOptions = {
      schemaIri: request.filters?.schemaIri,
      ownerDid: request.filters?.ownerDid,
      limit: Math.min(request.limit ?? 20, 100),
      offset: request.offset ?? 0
    }

    const safeQuery = sanitizeFtsQuery(request.query)
    if (!safeQuery) {
      return {
        type: 'query-response',
        id: request.id,
        results: [],
        total: 0,
        took: Date.now() - start
      }
    }

    const results = await this.storage.search(safeQuery, options)

    // Estimate total: if we got a full page, there are likely more results
    const limit = options.limit ?? 20
    const offset = options.offset ?? 0
    const hasMore = results.length === limit
    const total = hasMore ? offset + results.length + 1 : offset + results.length

    return {
      type: 'query-response',
      id: request.id,
      results,
      total,
      took: Date.now() - start
    }
  }

  async handleIndexUpdate(docId: string, ownerDid: string, update: IndexUpdate): Promise<IndexAck> {
    const now = Date.now()
    const existing = await this.storage.getDocMeta(docId)

    const meta: DocMeta = {
      docId,
      ownerDid,
      schemaIri: update.meta.schemaIri,
      title: update.meta.title,
      properties: update.meta.properties,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    }

    await this.storage.setDocMeta(docId, meta)

    if (update.text !== undefined) {
      await this.updateSearchBody(docId, update.text)
    }

    return { type: 'index-ack', docId, indexed: true }
  }

  async removeFromIndex(docId: string): Promise<void> {
    const existing = await this.storage.getDocMeta(docId)
    if (existing) {
      await this.storage.setDocMeta(docId, {
        ...existing,
        title: '',
        updatedAt: Date.now()
      })
    }

    if ('updateSearchBody' in this.storage && typeof this.storage.updateSearchBody === 'function') {
      await this.storage.updateSearchBody(docId, '')
    }
  }

  private async updateSearchBody(docId: string, text: string): Promise<void> {
    if ('updateSearchBody' in this.storage && typeof this.storage.updateSearchBody === 'function') {
      await this.storage.updateSearchBody(docId, text)
    }
  }
}

// Re-export for backward compatibility
export { sanitizeFtsQuery } from '../utils/fts'
