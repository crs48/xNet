# @xnet/query

Local query engine, full-text search, and federated query routing for xNet.

## Installation

```bash
pnpm add @xnet/query
```

## Features

- **Local query engine** -- Filter, sort, paginate nodes from local storage
- **Full-text search** -- MiniSearch-powered indexing and search
- **Federated query router** -- Route queries across multiple hubs

## Usage

```typescript
import { LocalQueryEngine } from '@xnet/query'

// Create query engine
const engine = new LocalQueryEngine(storage, getDocument)

// Query with filters, sorting, and pagination
const results = await engine.query({
  type: 'page',
  filters: [{ field: 'workspace', op: 'eq', value: 'default' }],
  sort: [{ field: 'updated', direction: 'desc' }],
  limit: 20,
  offset: 0
})
```

```typescript
import { SearchIndex } from '@xnet/query'

// Full-text search
const index = new SearchIndex()
index.add(doc)
index.add(anotherDoc)

const matches = index.search({ text: 'hello', limit: 10 })
```

```typescript
import { FederatedQueryRouter } from '@xnet/query'

// Federated queries across hubs
const router = new FederatedQueryRouter(hubs)
const results = await router.query(queryParams)
```

## Architecture

```mermaid
flowchart LR
    App["Application"]
    Local["LocalQueryEngine<br/><small>Filter, sort, paginate</small>"]
    Search["SearchIndex<br/><small>MiniSearch FTS</small>"]
    Fed["FederatedQueryRouter<br/><small>Cross-hub queries</small>"]

    App --> Local
    App --> Search
    App --> Fed
    Fed --> Hub1["Hub A"]
    Fed --> Hub2["Hub B"]
```

## Modules

| Module                 | Description                       |
| ---------------------- | --------------------------------- |
| `local/engine.ts`      | Local query engine                |
| `search/index.ts`      | MiniSearch full-text search index |
| `federation/router.ts` | Federated query routing           |
| `types.ts`             | Query, Filter, Sort types         |

## Dependencies

- `@xnet/core`, `@xnet/data`, `@xnet/identity`, `@xnet/network`, `@xnet/storage`
- `minisearch` -- Full-text search engine

## Testing

```bash
pnpm --filter @xnet/query test
```
