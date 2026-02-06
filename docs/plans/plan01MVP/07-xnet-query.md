# 07: @xnet/query

> Local and federated queries, full-text search

**Duration:** 2 weeks
**Dependencies:** @xnet/data, @xnet/storage, @xnet/network

## Overview

This package provides query capabilities for local and federated data queries, plus full-text search.

## Package Setup

```bash
cd packages/query
pnpm add lunr minisearch
pnpm add -D vitest typescript tsup @types/lunr
pnpm add @xnet/data@workspace:* @xnet/storage@workspace:* @xnet/network@workspace:* @xnet/core@workspace:*
```

## Directory Structure

```
packages/query/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts              # Public exports
│   ├── types.ts              # Query types
│   ├── local/
│   │   ├── engine.ts         # Local query engine
│   │   ├── engine.test.ts
│   │   └── operators.ts      # Query operators
│   ├── search/
│   │   ├── index.ts          # Search index
│   │   ├── index.test.ts
│   │   └── tokenizer.ts      # Text tokenization
│   └── federation/
│       ├── router.ts         # Query routing
│       ├── aggregator.ts     # Result aggregation
│       └── planner.ts        # Query planning
└── README.md
```

## Implementation

### Types (types.ts)

```typescript
export interface Query {
  type: QueryType
  filters: Filter[]
  sort?: Sort[]
  limit?: number
  offset?: number
}

export type QueryType = 'page' | 'task' | 'database' | 'block' | 'any'

export interface Filter {
  field: string
  operator: FilterOperator
  value: unknown
}

export type FilterOperator =
  | 'eq' // equals
  | 'ne' // not equals
  | 'gt' // greater than
  | 'gte' // greater than or equal
  | 'lt' // less than
  | 'lte' // less than or equal
  | 'in' // in array
  | 'nin' // not in array
  | 'contains' // string contains
  | 'startsWith' // string starts with
  | 'endsWith' // string ends with

export interface Sort {
  field: string
  direction: 'asc' | 'desc'
}

export interface QueryResult<T = unknown> {
  items: T[]
  total: number
  hasMore: boolean
  cursor?: string
}

export interface SearchQuery {
  text: string
  filters?: Filter[]
  limit?: number
}

export interface SearchResult {
  id: string
  type: string
  title: string
  snippet: string
  score: number
}
```

### Local Query Engine (local/engine.ts)

```typescript
import type { StorageAdapter } from '@xnet/storage'
import type { XDocument, DocumentType } from '@xnet/data'
import type { Query, QueryResult, Filter, Sort, FilterOperator } from '../types'

export interface LocalQueryEngine {
  query<T>(q: Query): Promise<QueryResult<T>>
  count(q: Query): Promise<number>
}

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
        const metadata = doc.metadata as Record<string, unknown>
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

function matchesFilters(data: Record<string, unknown>, filters: Filter[]): boolean {
  for (const filter of filters) {
    const value = data[filter.field]
    if (!matchesFilter(value, filter.operator, filter.value)) {
      return false
    }
  }
  return true
}

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

function sortResults<T>(items: T[], sorts: Sort[]): void {
  items.sort((a, b) => {
    for (const sort of sorts) {
      const aVal = (a as Record<string, unknown>)[sort.field]
      const bVal = (b as Record<string, unknown>)[sort.field]
      if (aVal < bVal) return sort.direction === 'asc' ? -1 : 1
      if (aVal > bVal) return sort.direction === 'asc' ? 1 : -1
    }
    return 0
  })
}

function documentToResult(doc: XDocument): unknown {
  return {
    id: doc.id,
    type: doc.type,
    workspace: doc.workspace,
    ...doc.metadata
  }
}
```

### Tests (local/engine.test.ts)

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { createLocalQueryEngine } from './engine'
import { MemoryAdapter } from '@xnet/storage'
import { createDocument } from '@xnet/data'
import { generateIdentity } from '@xnet/identity'

describe('LocalQueryEngine', () => {
  let storage: MemoryAdapter
  let documents: Map<string, any>
  let engine: ReturnType<typeof createLocalQueryEngine>

  beforeEach(async () => {
    storage = new MemoryAdapter()
    await storage.open()
    documents = new Map()

    const { identity, privateKey } = generateIdentity()

    // Create test documents
    for (let i = 0; i < 5; i++) {
      const doc = createDocument({
        id: `doc-${i}`,
        workspace: 'ws-1',
        type: i < 3 ? 'page' : 'task',
        title: `Document ${i}`,
        createdBy: identity.did,
        signingKey: privateKey
      })
      documents.set(doc.id, doc)
      await storage.setDocument(doc.id, {
        id: doc.id,
        content: new Uint8Array(),
        metadata: { created: Date.now(), updated: Date.now(), type: doc.type },
        version: 1
      })
    }

    engine = createLocalQueryEngine(storage, async (id) => documents.get(id) ?? null)
  })

  it('should query all documents', async () => {
    const result = await engine.query({ type: 'any', filters: [] })
    expect(result.items).toHaveLength(5)
    expect(result.total).toBe(5)
  })

  it('should filter by type', async () => {
    const result = await engine.query({ type: 'page', filters: [] })
    expect(result.items).toHaveLength(3)
  })

  it('should filter by field', async () => {
    const result = await engine.query({
      type: 'any',
      filters: [{ field: 'title', operator: 'contains', value: '0' }]
    })
    expect(result.items).toHaveLength(1)
  })

  it('should paginate results', async () => {
    const result = await engine.query({ type: 'any', filters: [], limit: 2, offset: 0 })
    expect(result.items).toHaveLength(2)
    expect(result.hasMore).toBe(true)
    expect(result.cursor).toBe('2')
  })
})
```

### Search Index (search/index.ts)

```typescript
import MiniSearch from 'minisearch'
import type { XDocument } from '@xnet/data'
import type { SearchQuery, SearchResult } from '../types'

export interface SearchIndex {
  add(doc: XDocument): void
  remove(docId: string): void
  update(doc: XDocument): void
  search(query: SearchQuery): SearchResult[]
  clear(): void
}

interface IndexedDoc {
  id: string
  type: string
  title: string
  content: string
  workspace: string
}

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

  function extractText(doc: XDocument): string {
    // Extract text from Yjs document
    // Simplified - would walk through blocks
    const meta = doc.ydoc.getMap('metadata')
    return (meta.get('title') as string) ?? ''
  }

  return {
    add(doc: XDocument): void {
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

    update(doc: XDocument): void {
      this.remove(doc.id)
      this.add(doc)
    },

    search(query: SearchQuery): SearchResult[] {
      const results = miniSearch.search(query.text, {
        filter: query.filters
          ? (result) => {
              // Apply filters
              return true // Simplified
            }
          : undefined
      })

      return results.slice(0, query.limit ?? 20).map((result) => ({
        id: result.id,
        type: result.type,
        title: result.title,
        snippet: '', // Would generate snippet
        score: result.score
      }))
    },

    clear(): void {
      miniSearch.removeAll()
    }
  }
}
```

### Tests (search/index.test.ts)

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { createSearchIndex } from './index'
import { createDocument } from '@xnet/data'
import { generateIdentity } from '@xnet/identity'

describe('SearchIndex', () => {
  let index: ReturnType<typeof createSearchIndex>

  beforeEach(() => {
    index = createSearchIndex()
  })

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
})
```

### Query Federation (federation/router.ts)

```typescript
import type { NetworkNode, SyncMessage } from '@xnet/network'
import type { Query, QueryResult, Filter } from '../types'
import type { DataSource, QueryPlan, SubQuery } from '@xnet/core'

export interface FederatedQueryRouter {
  /** Find sources that can answer query */
  findSources(query: Query): Promise<DataSource[]>

  /** Route query to remote source */
  routeToRemote(query: Query, source: DataSource): Promise<QueryResult<unknown>>

  /** Execute federated query */
  execute(query: Query): Promise<QueryResult<unknown>>
}

export function createFederatedQueryRouter(
  node: NetworkNode,
  localEngine: { query: (q: Query) => Promise<QueryResult<unknown>> }
): FederatedQueryRouter {
  return {
    async findSources(query: Query): Promise<DataSource[]> {
      const sources: DataSource[] = [{ type: 'local', id: 'local', estimatedLatency: 0 }]

      // Would query connected peers to find relevant sources
      // Simplified: just return local

      return sources
    },

    async routeToRemote(query: Query, source: DataSource): Promise<QueryResult<unknown>> {
      // Would send query message to peer
      throw new Error('Remote query not implemented')
    },

    async execute(query: Query): Promise<QueryResult<unknown>> {
      const sources = await this.findSources(query)

      // For now, just use local
      const localSource = sources.find((s) => s.type === 'local')
      if (localSource) {
        return localEngine.query(query)
      }

      return { items: [], total: 0, hasMore: false }
    }
  }
}
```

### Public Exports (index.ts)

```typescript
// Types
export type {
  Query,
  QueryType,
  Filter,
  FilterOperator,
  Sort,
  QueryResult,
  SearchQuery,
  SearchResult
} from './types'

// Local query engine
export { createLocalQueryEngine, type LocalQueryEngine } from './local/engine'

// Search index
export { createSearchIndex, type SearchIndex } from './search/index'

// Federation
export { createFederatedQueryRouter, type FederatedQueryRouter } from './federation/router'
```

## Validation Checklist

- [ ] Local queries filter correctly
- [ ] Pagination works
- [ ] Sorting works
- [ ] Search finds documents
- [ ] Fuzzy search works
- [ ] Search respects limits
- [ ] All tests pass with >80% coverage

## Next Step

Proceed to [08-xnet-react.md](./08-xnet-react.md)
