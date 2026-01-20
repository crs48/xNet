# @xnet/query

Local and federated query engine.

## Installation

```bash
pnpm add @xnet/query
```

## Usage

```typescript
import { createLocalQueryEngine, createSearchIndex } from '@xnet/query'

// Create query engine
const engine = createLocalQueryEngine(storage, getDocument)

// Query documents
const results = await engine.query({
  type: 'page',
  filters: [{ field: 'workspace', op: 'eq', value: 'default' }],
  sort: [{ field: 'updated', direction: 'desc' }],
  limit: 20
})

// Search
const searchIndex = createSearchIndex()
searchIndex.add(doc)
const matches = searchIndex.search({ text: 'hello', limit: 10 })
```

## Features

- Local query engine
- Full-text search
- Filtering and sorting
- Pagination
