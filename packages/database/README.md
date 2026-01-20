# @xnet/database

Database schema, property types, and item operations for xNet.

## Overview

This package provides a Notion-like database system with:

- **18 property types** (text, number, date, select, relation, formula, etc.)
- **Schema operations** for databases, properties, and views
- **Item CRUD** with filtering, sorting, and validation
- **View configurations** for table, board, gallery, timeline, calendar

## Installation

```bash
pnpm add @xnet/database
```

## Usage

### Create a Database

```typescript
import { createDatabase, createProperty, createItem } from '@xnet/database'

// Create database with default title property
const db = createDatabase({
  name: 'Tasks',
  createdBy: 'did:key:z6Mk...'
})

// Add a status property
const dbWithStatus = createProperty(db, {
  name: 'Status',
  type: 'select',
  config: {
    options: [
      { id: 'todo', name: 'To Do', color: '#ff0000' },
      { id: 'done', name: 'Done', color: '#00ff00' }
    ]
  }
})

// Create an item
const item = createItem(dbWithStatus, {
  databaseId: dbWithStatus.id,
  createdBy: 'did:key:z6Mk...',
  properties: {
    [dbWithStatus.properties[0].id]: 'My Task',
    [dbWithStatus.properties[1].id]: 'todo'
  }
})
```

### Query Items

```typescript
import { queryItems } from '@xnet/database'

const results = queryItems(db, items, {
  filter: {
    operator: 'and',
    filters: [{ propertyId: statusPropId, operator: 'equals', value: 'todo' }]
  },
  sorts: [{ propertyId: priorityPropId, direction: 'desc' }],
  limit: 10
})
```

### Property Types

| Category  | Types                       |
| --------- | --------------------------- |
| Basic     | text, number, checkbox      |
| Temporal  | date, dateRange             |
| Selection | select, multiSelect         |
| Reference | person, relation, rollup    |
| Computed  | formula                     |
| Rich      | url, email, phone, file     |
| Auto      | created, updated, createdBy |

## Testing

```bash
pnpm test
```

## API Reference

See source files for detailed type definitions:

- `src/types.ts` - Core type definitions
- `src/schema/` - Database, property, view operations
- `src/operations/` - Item CRUD and queries
- `src/properties/` - Property handlers and registry
