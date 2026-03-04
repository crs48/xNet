# 06: Package Naming & JSON-LD Integration Proposal

> Exploring options for merging @xnetjs/data and @xnetjs/records, with JSON-LD support

**Status:** Draft for discussion

## Current State

Two separate packages with overlapping responsibilities:

| Package           | Contains                       | Sync              | Use Case                |
| ----------------- | ------------------------------ | ----------------- | ----------------------- |
| `@xnetjs/data`    | XDocument, Blocks, Yjs wrapper | Yjs CRDT          | Rich text documents     |
| `@xnetjs/records` | Database, Item, Properties     | Event-sourced LWW | Tabular/structured data |

**Problem:** The name `@xnetjs/data` suggests "all data" but only handles Yjs documents. A layperson would expect database records to also live under "data."

## Naming Options

### Option A: Merge into unified `@xnetjs/data`

```
@xnetjs/data/
├── document/           # Rich text (Yjs)
│   ├── types.ts
│   ├── blocks.ts
│   └── sync.ts
├── record/             # Tabular data (Event-sourced)
│   ├── types.ts
│   ├── properties/
│   └── sync.ts
├── schema/             # JSON-LD schemas (NEW)
│   ├── context.ts
│   └── validation.ts
└── index.ts            # Unified exports
```

**Imports:**

```typescript
import { Document, Block } from '@xnetjs/data/document'
import { Database, Item, Property } from '@xnetjs/data/record'
import { Schema, Context } from '@xnetjs/data/schema'

// Or flat:
import { Document, Database, Item, Schema } from '@xnetjs/data'
```

**Pros:**

- Single package for "all data"
- Clear subpath imports for organization
- Matches layperson expectation
- Simpler dependency graph

**Cons:**

- Large package (might be slower to build)
- Changes to records affect document builds
- Different sync mechanisms coexist

---

### Option B: Rename to explicit names

```
@xnetjs/document   # Was @xnetjs/data - rich text documents
@xnetjs/database   # Was @xnetjs/records - tabular data
```

**Imports:**

```typescript
import { Document, Block } from '@xnetjs/document'
import { Database, Item, Property } from '@xnetjs/database'
```

**Pros:**

- Very explicit naming
- Separate build/test cycles
- Clear mental model

**Cons:**

- More packages to manage
- `@xnetjs/database` might imply we have a real DB (we don't)
- Still need a place for shared JSON-LD schemas

---

### Option C: Data + specific subpackages

```
@xnetjs/data           # Shared schemas, base types, JSON-LD
@xnetjs/data-document  # Rich text (Yjs)
@xnetjs/data-record    # Tabular (Event-sourced)
```

**Imports:**

```typescript
import { Schema, Context } from '@xnetjs/data'
import { Document, Block } from '@xnetjs/data-document'
import { Database, Item } from '@xnetjs/data-record'
```

**Pros:**

- `@xnetjs/data` becomes the shared foundation
- Explicit about what each subpackage does
- Can use any subpackage independently

**Cons:**

- Three packages instead of two
- Verbose imports
- Unusual naming convention

---

### Option D: Content types under unified `@xnetjs/data`

```
@xnetjs/data/
├── types/              # All type definitions
│   ├── document.ts     # Page, Canvas
│   ├── database.ts     # Database, Item
│   └── schema.ts       # JSON-LD context
├── sync/               # Sync primitives
│   ├── yjs.ts          # Yjs adapter
│   └── event.ts        # Event-sourced adapter
├── properties/         # Property type handlers
└── index.ts
```

This is similar to Option A but emphasizes that everything is "content types" with different sync strategies.

---

## Recommendation: Option A (Merge into `@xnetjs/data`)

**Rationale:**

1. **Layperson friendly** - "Where does data live? In `@xnetjs/data`."
2. **Subpaths are clean** - Modern bundlers handle subpath exports well
3. **Room for JSON-LD** - The `schema/` directory is a natural home
4. **Matches Notion's model** - Pages and databases are both "blocks" at some level

**Migration path:**

1. Move `@xnetjs/records` code into `@xnetjs/data/record/`
2. Re-export from `@xnetjs/records` for backward compatibility
3. Deprecate `@xnetjs/records` after a version cycle

---

## JSON-LD Integration

The original plan specified JSON-LD schemas for blocks. This was intended but **never implemented**.

### What JSON-LD Provides

1. **Semantic typing** - `@type` field identifies what something is
2. **Linked data** - `@id` creates globally unique identifiers
3. **Context mapping** - Short property names map to full URIs
4. **Interoperability** - Other systems can understand our data

### Current State vs. JSON-LD

| Aspect              | Current            | With JSON-LD                        |
| ------------------- | ------------------ | ----------------------------------- |
| Type identification | `type: 'page'`     | `@type: 'xnet:Page'`                |
| IDs                 | `id: 'doc-123'`    | `@id: 'xnet://did:key:.../doc-123'` |
| Property names      | `title`, `content` | Mapped via `@context`               |
| External tools      | Can't parse        | Standard RDF/JSON-LD tools work     |

### Proposed JSON-LD Schema

```typescript
// @xnetjs/data/schema/context.ts

export const XNET_CONTEXT = {
  '@context': {
    xnet: 'https://xnet.dev/schema/',
    schema: 'https://schema.org/',

    // Document types
    Page: 'xnet:Page',
    Database: 'xnet:Database',
    Item: 'xnet:Item',
    Canvas: 'xnet:Canvas',

    // Common properties
    title: 'schema:name',
    content: 'xnet:content',
    created: 'schema:dateCreated',
    updated: 'schema:dateModified',
    createdBy: 'schema:creator',

    // xNet-specific
    workspaceId: 'xnet:workspace',
    parentId: 'xnet:parent',
    properties: 'xnet:properties',
    schema: 'xnet:schema'
  }
}

// Example document with JSON-LD:
const page = {
  '@context': XNET_CONTEXT['@context'],
  '@type': 'Page',
  '@id': 'xnet://did:key:z6Mk.../ws-1/page-123',
  title: 'My Page',
  created: 1706140800000,
  createdBy: 'did:key:z6Mk...'
}
```

### Integration Strategy

**Phase 1: Add optional JSON-LD support**

```typescript
interface Document {
  // Existing fields
  id: string
  type: 'page' | 'database' | 'item' | 'canvas'
  title: string
  // ...

  // Optional JSON-LD fields
  '@context'?: (typeof XNET_CONTEXT)['@context']
  '@type'?: string
  '@id'?: string
}

// Helper to convert to JSON-LD format
function toJsonLd(doc: Document): JsonLdDocument {
  return {
    '@context': XNET_CONTEXT['@context'],
    '@type': capitalize(doc.type),
    '@id': `xnet://${doc.createdBy}/${doc.workspaceId}/${doc.id}`,
    ...doc
  }
}
```

**Phase 2: Full JSON-LD native**

- All documents store `@type` and `@id`
- Property definitions include JSON-LD mapping
- Export/import uses standard JSON-LD format

### Benefits of JSON-LD

1. **Export compatibility** - Users can export data that other tools understand
2. **AI/LLM friendly** - Semantic types help AI understand document structure
3. **Future federation** - Could interop with ActivityPub, Solid, etc.
4. **Schema validation** - JSON-LD schemas can be validated

### Risks

1. **Verbosity** - JSON-LD adds overhead to every document
2. **Complexity** - Another concept for developers to learn
3. **Performance** - String processing for URIs

### Recommendation

**Start with optional JSON-LD, make it native over time:**

1. Add `@xnetjs/data/schema` with context definitions
2. Add `toJsonLd()` and `fromJsonLd()` helpers
3. Store `@type` and `@id` internally but don't require them in API
4. Full JSON-LD becomes the export format

---

## Unified Data Model (Revised)

With JSON-LD and merged packages, the unified model looks like:

```typescript
// @xnetjs/data/types/base.ts

/**
 * Base interface for all content types in xNet.
 * Compatible with JSON-LD when @context is provided.
 */
interface Content {
  // Standard fields
  id: string
  type: ContentType
  workspaceId: string

  // Metadata
  title: string
  icon?: string
  cover?: string
  created: number
  updated: number
  createdBy: DID

  // Hierarchy
  parentId?: string

  // JSON-LD (optional, populated on export)
  '@context'?: JsonLdContext
  '@type'?: string
  '@id'?: string
}

type ContentType = 'page' | 'database' | 'item' | 'canvas'

/**
 * Page - rich text document
 */
interface Page extends Content {
  type: 'page'
  content: Y.Doc // Yjs for collaborative editing
}

/**
 * Database - schema for structured data
 */
interface Database extends Content {
  type: 'database'
  schema: PropertyDefinition[]
  views: View[]
  defaultViewId: ViewId
}

/**
 * Item - row in a database
 */
interface Item extends Content {
  type: 'item'
  databaseId: string
  properties: Record<PropertyId, PropertyValue>
  content?: Y.Doc // Optional rich text body
}

/**
 * Canvas - spatial/infinite canvas
 */
interface Canvas extends Content {
  type: 'canvas'
  content: Y.Doc // Yjs for spatial data
}
```

---

## Decision Needed

1. **Package structure:** Option A (merge) vs Option B (rename) vs other?
2. **JSON-LD priority:** Now vs later vs never?
3. **Base type name:** `Content` vs `Document` vs `Node` vs `Block`?

---

## Summary

| Question         | Recommendation                          |
| ---------------- | --------------------------------------- |
| Merge packages?  | Yes - into `@xnetjs/data` with subpaths |
| JSON-LD support? | Yes - optional now, native later        |
| Base type name?  | Keep `Document` (already decided)       |
| Migration?       | Gradual with backward compat            |

---

[← Back to Timeline](./05-timeline.md) | [Back to README](./README.md)
