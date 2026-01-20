/**
 * Local query engine
 */
import type { StorageAdapter } from '@xnet/storage'
import type { XDocument } from '@xnet/data'
import type { Query, QueryResult, Filter, Sort, FilterOperator } from '../types'

/**
 * Local query engine interface
 */
export interface LocalQueryEngine {
  query<T>(q: Query): Promise<QueryResult<T>>
  count(q: Query): Promise<number>
}

/**
 * Create a local query engine
 */
export function createLocalQueryEngine(
  storage: StorageAdapter,
  getDocument: (id: string) => Promise<XDocument | null>
): LocalQueryEngine {
  return {
    async query<T>(q: Query): Promise<QueryResult<T>> {
      // Get all document IDs
      const docIds = await storage.listDocuments()

      // Load and filter documents
      const items: T[] = []
      for (const docId of docIds) {
        const doc = await getDocument(docId)
        if (!doc) continue

        // Type filter
        if (q.type !== 'any' && doc.type !== q.type) continue

        // Apply filters
        const metadata = doc.metadata as unknown as Record<string, unknown>
        if (!matchesFilters(metadata, q.filters)) continue

        items.push(documentToResult(doc) as T)
      }

      // Sort
      if (q.sort && q.sort.length > 0) {
        sortResults(items, q.sort)
      }

      // Paginate
      const offset = q.offset ?? 0
      const limit = q.limit ?? 50
      const paginated = items.slice(offset, offset + limit)

      return {
        items: paginated,
        total: items.length,
        hasMore: offset + limit < items.length,
        cursor: offset + limit < items.length ? String(offset + limit) : undefined
      }
    },

    async count(q: Query): Promise<number> {
      const result = await this.query(q)
      return result.total
    }
  }
}

/**
 * Check if data matches all filters
 */
function matchesFilters(data: Record<string, unknown>, filters: Filter[]): boolean {
  for (const filter of filters) {
    const value = data[filter.field]
    if (!matchesFilter(value, filter.operator, filter.value)) {
      return false
    }
  }
  return true
}

/**
 * Check if a value matches a single filter
 */
function matchesFilter(value: unknown, operator: FilterOperator, target: unknown): boolean {
  switch (operator) {
    case 'eq':
      return value === target
    case 'ne':
      return value !== target
    case 'gt':
      return (value as number) > (target as number)
    case 'gte':
      return (value as number) >= (target as number)
    case 'lt':
      return (value as number) < (target as number)
    case 'lte':
      return (value as number) <= (target as number)
    case 'in':
      return (target as unknown[]).includes(value)
    case 'nin':
      return !(target as unknown[]).includes(value)
    case 'contains':
      return String(value).includes(String(target))
    case 'startsWith':
      return String(value).startsWith(String(target))
    case 'endsWith':
      return String(value).endsWith(String(target))
    default:
      return false
  }
}

/**
 * Sort items by sort specifications
 */
function sortResults<T>(items: T[], sorts: Sort[]): void {
  items.sort((a, b) => {
    for (const sort of sorts) {
      const aVal = (a as Record<string, unknown>)[sort.field] as string | number | boolean
      const bVal = (b as Record<string, unknown>)[sort.field] as string | number | boolean
      if (aVal < bVal) return sort.direction === 'asc' ? -1 : 1
      if (aVal > bVal) return sort.direction === 'asc' ? 1 : -1
    }
    return 0
  })
}

/**
 * Convert document to query result format
 */
function documentToResult(doc: XDocument): unknown {
  return {
    id: doc.id,
    type: doc.type,
    workspace: doc.workspace,
    ...doc.metadata
  }
}
