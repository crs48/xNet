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
    recipients?: string[]
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

  async handleQuery(request: QueryRequest, subjectDid?: string): Promise<QueryResponse> {
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
    const filtered = await this.filterAuthorizedResults(results, subjectDid)

    // Estimate total: if we got a full page, there are likely more results
    const limit = options.limit ?? 20
    const offset = options.offset ?? 0
    const hasMore = filtered.length === limit
    const total = hasMore ? offset + filtered.length + 1 : offset + filtered.length

    return {
      type: 'query-response',
      id: request.id,
      results: filtered,
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
      properties: {
        ...(update.meta.properties ?? {}),
        recipients:
          update.meta.recipients ?? (update.meta.properties?.recipients as string[] | undefined)
      },
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    }

    await this.storage.setDocMeta(docId, meta)

    await this.syncGrantIndex(docId, update)

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

    await this.storage.removeGrantIndex(docId)
  }

  private async filterAuthorizedResults(
    results: SearchResult[],
    subjectDid?: string
  ): Promise<SearchResult[]> {
    if (!subjectDid || subjectDid === 'did:key:anonymous') {
      return results
    }

    const granted = new Set(await this.storage.listGrantedDocIds(subjectDid))
    const allowed: SearchResult[] = []

    for (const result of results) {
      const meta = await this.storage.getDocMeta(result.docId)
      if (!meta) continue
      if (meta.ownerDid === subjectDid || granted.has(result.docId)) {
        allowed.push(result)
        continue
      }

      const recipients = await this.storage.listDocRecipients(result.docId)
      if (recipients.includes(subjectDid) || recipients.includes('PUBLIC')) {
        allowed.push(result)
      }
    }

    return allowed
  }

  private async syncGrantIndex(docId: string, update: IndexUpdate): Promise<void> {
    if (!this.isGrantSchema(update.meta.schemaIri)) {
      return
    }

    const props = update.meta.properties
    if (!props) {
      await this.storage.removeGrantIndex(docId)
      return
    }

    const granteeDid = typeof props.grantee === 'string' ? props.grantee : null
    const resourceDocId = typeof props.resource === 'string' ? props.resource : null

    if (!granteeDid || !resourceDocId) {
      await this.storage.removeGrantIndex(docId)
      return
    }

    const actions = this.parseActions(props.actions)
    const expiresAt = typeof props.expiresAt === 'number' ? props.expiresAt : 0
    const revokedAt = typeof props.revokedAt === 'number' ? props.revokedAt : 0

    await this.storage.upsertGrantIndex({
      grantId: docId,
      granteeDid,
      resourceDocId,
      actions,
      expiresAt,
      revokedAt,
      createdAt: Date.now()
    })
  }

  private parseActions(input: unknown): string[] {
    if (Array.isArray(input)) {
      return input.filter((value): value is string => typeof value === 'string')
    }

    if (typeof input === 'string') {
      try {
        const parsed = JSON.parse(input) as unknown
        if (Array.isArray(parsed)) {
          return parsed.filter((value): value is string => typeof value === 'string')
        }
      } catch {
        return []
      }
    }

    return []
  }

  private isGrantSchema(schemaIri: string): boolean {
    return schemaIri === 'xnet://xnet.fyi/Grant' || schemaIri.endsWith('/Grant')
  }

  private async updateSearchBody(docId: string, text: string): Promise<void> {
    if ('updateSearchBody' in this.storage && typeof this.storage.updateSearchBody === 'function') {
      await this.storage.updateSearchBody(docId, text)
    }
  }
}

// Re-export for backward compatibility
export { sanitizeFtsQuery } from '../utils/fts'
