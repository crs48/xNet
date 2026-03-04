# 08: JSON-LD Integration

> Adding semantic web capabilities to the unified data model

**Duration:** 3-4 days
**Risk Level:** Low
**Dependencies:** Package merge complete

## Overview

The original plan specified JSON-LD schemas for all content, but this was never implemented. This document adds JSON-LD support to fulfill that requirement.

## What JSON-LD Provides

1. **Semantic typing** - `@type` identifies what something is (machine-readable)
2. **Global identifiers** - `@id` creates URIs that work across systems
3. **Context mapping** - Short names map to full semantic URIs
4. **Interoperability** - Standard format for linked data, RDF tools, AI systems

## xNet JSON-LD Context

```typescript
// packages/data/src/schema/context.ts

/**
 * xNet JSON-LD context definition.
 * Maps short property names to semantic URIs.
 */
export const XNET_CONTEXT = {
  '@context': {
    // Namespaces
    xnet: 'https://xnet.dev/vocab/',
    schema: 'https://schema.org/',
    dc: 'http://purl.org/dc/terms/',

    // Document types
    Page: 'xnet:Page',
    Database: 'xnet:Database',
    Item: 'xnet:Item',
    Canvas: 'xnet:Canvas',

    // Common properties (mapped to Schema.org where applicable)
    title: 'schema:name',
    content: 'xnet:content',
    created: 'schema:dateCreated',
    updated: 'schema:dateModified',
    createdBy: 'schema:creator',
    updatedBy: 'xnet:updatedBy',

    // xNet-specific properties
    workspaceId: 'xnet:workspace',
    parentId: 'xnet:parent',
    databaseId: 'xnet:database',
    properties: 'xnet:properties',
    schema: 'xnet:schema',
    views: 'xnet:views',

    // Property types
    PropertyDefinition: 'xnet:PropertyDefinition',
    View: 'xnet:View',

    // Sync metadata
    vectorClock: 'xnet:vectorClock',
    signature: 'xnet:signature',
    hash: 'xnet:contentHash'
  }
} as const

export type XNetContext = (typeof XNET_CONTEXT)['@context']
```

## Document Types with JSON-LD

```typescript
// packages/data/src/types/document.ts

import type { DID, ContentId } from '@xnetjs/core'
import type { XNetContext } from '../schema/context'

/**
 * JSON-LD metadata (optional on internal types, required on export)
 */
interface JsonLdMetadata {
  '@context'?: XNetContext
  '@type'?: string
  '@id'?: string
}

/**
 * Base document interface - all documents share these fields
 */
export interface DocumentBase extends JsonLdMetadata {
  // Core identity
  id: string
  type: DocumentType

  // Location
  workspaceId: string
  parentId?: string

  // Display
  title: string
  icon?: string
  cover?: string

  // Timestamps (as numbers for JSON compatibility)
  created: number
  updated: number

  // Authorship
  createdBy: DID
  updatedBy: DID

  // Soft delete
  deleted: boolean
  deletedAt?: number
  deletedBy?: DID
}

export type DocumentType = 'page' | 'database' | 'item' | 'canvas'

/**
 * Page - rich text document backed by Yjs
 */
export interface Page extends DocumentBase {
  type: 'page'
  content: Y.Doc
}

/**
 * Database - schema definition for structured data
 */
export interface Database extends DocumentBase {
  type: 'database'
  schema: PropertyDefinition[]
  views: View[]
  defaultViewId: ViewId
}

/**
 * Item - row in a database
 */
export interface Item extends DocumentBase {
  type: 'item'
  databaseId: string
  properties: Record<PropertyId, PropertyValue>
  content?: Y.Doc // Optional rich text body
}

/**
 * Canvas - spatial/infinite canvas
 */
export interface Canvas extends DocumentBase {
  type: 'canvas'
  content: Y.Doc
}

/**
 * Union of all document types
 */
export type Document = Page | Database | Item | Canvas
```

## JSON-LD Conversion Functions

```typescript
// packages/data/src/schema/conversion.ts

import { XNET_CONTEXT } from './context'
import type { Document, Page, Database, Item, Canvas } from '../types/document'

/**
 * Generate a JSON-LD @id for a document
 */
export function generateJsonLdId(doc: Document): string {
  return `xnet://${doc.createdBy}/${doc.workspaceId}/${doc.type}/${doc.id}`
}

/**
 * Map document type to JSON-LD @type
 */
export function getJsonLdType(type: Document['type']): string {
  const typeMap: Record<Document['type'], string> = {
    page: 'Page',
    database: 'Database',
    item: 'Item',
    canvas: 'Canvas'
  }
  return typeMap[type]
}

/**
 * Convert a document to JSON-LD format for export/interop
 */
export function toJsonLd<T extends Document>(doc: T): T & Required<JsonLdMetadata> {
  return {
    '@context': XNET_CONTEXT['@context'],
    '@type': getJsonLdType(doc.type),
    '@id': generateJsonLdId(doc),
    ...doc
  }
}

/**
 * Convert JSON-LD document back to internal format
 */
export function fromJsonLd<T extends Document>(jsonLd: T & JsonLdMetadata): T {
  const { '@context': _ctx, '@type': _type, '@id': _id, ...doc } = jsonLd
  return doc as T
}

/**
 * Validate that a JSON-LD document has required fields
 */
export function validateJsonLd(doc: unknown): doc is Document & Required<JsonLdMetadata> {
  if (typeof doc !== 'object' || doc === null) return false

  const d = doc as Record<string, unknown>
  return (
    typeof d['@context'] === 'object' &&
    typeof d['@type'] === 'string' &&
    typeof d['@id'] === 'string' &&
    typeof d.id === 'string' &&
    typeof d.type === 'string'
  )
}

/**
 * Expand a document with full JSON-LD URIs (for RDF tools)
 */
export function expandJsonLd(doc: Document): Record<string, unknown> {
  const jsonLd = toJsonLd(doc)

  return {
    '@id': jsonLd['@id'],
    '@type': `https://xnet.dev/vocab/${jsonLd['@type']}`,
    'https://schema.org/name': jsonLd.title,
    'https://schema.org/dateCreated': new Date(jsonLd.created).toISOString(),
    'https://schema.org/dateModified': new Date(jsonLd.updated).toISOString(),
    'https://schema.org/creator': { '@id': jsonLd.createdBy },
    'https://xnet.dev/vocab/workspace': jsonLd.workspaceId
    // ... more properties
  }
}
```

## Schema Registry for Property Types

```typescript
// packages/data/src/schema/properties.ts

/**
 * JSON-LD schema for property types in databases
 */
export const PROPERTY_TYPE_SCHEMA = {
  '@context': {
    ...XNET_CONTEXT['@context'],

    // Property types
    TextProperty: 'xnet:TextProperty',
    NumberProperty: 'xnet:NumberProperty',
    CheckboxProperty: 'xnet:CheckboxProperty',
    DateProperty: 'xnet:DateProperty',
    DateRangeProperty: 'xnet:DateRangeProperty',
    SelectProperty: 'xnet:SelectProperty',
    MultiSelectProperty: 'xnet:MultiSelectProperty',
    PersonProperty: 'xnet:PersonProperty',
    RelationProperty: 'xnet:RelationProperty',
    RollupProperty: 'xnet:RollupProperty',
    FormulaProperty: 'xnet:FormulaProperty',
    UrlProperty: 'xnet:UrlProperty',
    EmailProperty: 'xnet:EmailProperty',
    PhoneProperty: 'xnet:PhoneProperty',
    FileProperty: 'xnet:FileProperty',
    CreatedProperty: 'xnet:CreatedProperty',
    UpdatedProperty: 'xnet:UpdatedProperty',
    CreatedByProperty: 'xnet:CreatedByProperty',

    // Property definition fields
    propertyName: 'xnet:propertyName',
    propertyType: 'xnet:propertyType',
    required: 'xnet:required',
    config: 'xnet:config'
  }
}

/**
 * Convert a PropertyDefinition to JSON-LD
 */
export function propertyToJsonLd(prop: PropertyDefinition): object {
  const typeMap: Record<PropertyType, string> = {
    text: 'TextProperty',
    number: 'NumberProperty',
    checkbox: 'CheckboxProperty',
    date: 'DateProperty',
    dateRange: 'DateRangeProperty',
    select: 'SelectProperty',
    multiSelect: 'MultiSelectProperty',
    person: 'PersonProperty',
    relation: 'RelationProperty',
    rollup: 'RollupProperty',
    formula: 'FormulaProperty',
    url: 'UrlProperty',
    email: 'EmailProperty',
    phone: 'PhoneProperty',
    file: 'FileProperty',
    created: 'CreatedProperty',
    updated: 'UpdatedProperty',
    createdBy: 'CreatedByProperty'
  }

  return {
    '@type': typeMap[prop.type],
    '@id': `xnet:property/${prop.id}`,
    propertyName: prop.name,
    propertyType: prop.type,
    required: prop.required ?? false,
    config: prop.config
  }
}
```

## Export/Import with JSON-LD

```typescript
// packages/data/src/io/export.ts

import { toJsonLd, propertyToJsonLd } from '../schema'
import type { Document, Database, Item } from '../types'

/**
 * Export a document tree as JSON-LD
 */
export async function exportAsJsonLd(
  doc: Document,
  options?: {
    includeChildren?: boolean
    includeRelated?: boolean
    pretty?: boolean
  }
): Promise<string> {
  const jsonLd = toJsonLd(doc)

  // For databases, include schema as JSON-LD
  if (doc.type === 'database') {
    const db = doc as Database
    jsonLd.schema = db.schema.map(propertyToJsonLd)
  }

  // For items with content, serialize Yjs state
  if (doc.type === 'item' && (doc as Item).content) {
    // Convert Y.Doc to portable format
    jsonLd.content = encodeYjsContent((doc as Item).content!)
  }

  return JSON.stringify(jsonLd, null, options?.pretty ? 2 : undefined)
}

/**
 * Import a JSON-LD document
 */
export async function importFromJsonLd(
  jsonLdString: string,
  options?: {
    workspaceId: string
    importedBy: DID
  }
): Promise<Document> {
  const parsed = JSON.parse(jsonLdString)

  if (!validateJsonLd(parsed)) {
    throw new Error('Invalid JSON-LD document')
  }

  // Convert back to internal format
  const doc = fromJsonLd(parsed)

  // Optionally remap to new workspace
  if (options?.workspaceId) {
    doc.workspaceId = options.workspaceId
  }

  return doc
}
```

## Integration with Sync

The JSON-LD fields are metadata for export/interop. They don't affect sync:

```typescript
// Sync still uses Change<T> internally
interface Change<T> {
  id: string
  type: string
  payload: T
  hash: ContentId
  // ... no JSON-LD here
}

// JSON-LD is added at the export boundary
const exported = toJsonLd(document)
```

## Tests

```typescript
// packages/data/test/schema/jsonld.test.ts

import { describe, it, expect } from 'vitest'
import {
  toJsonLd,
  fromJsonLd,
  generateJsonLdId,
  validateJsonLd,
  XNET_CONTEXT
} from '../../src/schema'

describe('JSON-LD conversion', () => {
  const testPage: Page = {
    id: 'page-123',
    type: 'page',
    workspaceId: 'ws-1',
    title: 'Test Page',
    created: 1706140800000,
    updated: 1706140800000,
    createdBy: 'did:key:z6MkTest' as DID,
    updatedBy: 'did:key:z6MkTest' as DID,
    deleted: false,
    content: new Y.Doc()
  }

  it('generates correct @id', () => {
    const id = generateJsonLdId(testPage)
    expect(id).toBe('xnet://did:key:z6MkTest/ws-1/page/page-123')
  })

  it('converts to JSON-LD', () => {
    const jsonLd = toJsonLd(testPage)

    expect(jsonLd['@context']).toEqual(XNET_CONTEXT['@context'])
    expect(jsonLd['@type']).toBe('Page')
    expect(jsonLd['@id']).toMatch(/^xnet:\/\//)
    expect(jsonLd.title).toBe('Test Page')
  })

  it('round-trips through JSON-LD', () => {
    const jsonLd = toJsonLd(testPage)
    const restored = fromJsonLd(jsonLd)

    expect(restored.id).toBe(testPage.id)
    expect(restored.type).toBe(testPage.type)
    expect(restored.title).toBe(testPage.title)
  })

  it('validates JSON-LD documents', () => {
    const valid = toJsonLd(testPage)
    const invalid = { title: 'No @context' }

    expect(validateJsonLd(valid)).toBe(true)
    expect(validateJsonLd(invalid)).toBe(false)
  })
})
```

## Checklist

### Day 1: Context and Types

- [ ] Create `packages/data/src/schema/` directory
- [ ] Define `XNET_CONTEXT` with all mappings
- [ ] Define `PROPERTY_TYPE_SCHEMA` for property types
- [ ] Add JSON-LD optional fields to document types
- [ ] Write context tests

### Day 2: Conversion Functions

- [ ] Implement `toJsonLd()` for all document types
- [ ] Implement `fromJsonLd()` for import
- [ ] Implement `validateJsonLd()` for validation
- [ ] Implement `expandJsonLd()` for RDF tools
- [ ] Write conversion tests

### Day 3: Export/Import

- [ ] Implement `exportAsJsonLd()` with options
- [ ] Implement `importFromJsonLd()` with remapping
- [ ] Handle Yjs content serialization
- [ ] Handle database schema export
- [ ] Write integration tests

### Day 4: Documentation

- [ ] Document JSON-LD context in README
- [ ] Add examples for export/import
- [ ] Update CLAUDE.md with JSON-LD info
- [ ] Publish context at https://xnet.dev/vocab/ (future)

---

## Benefits

1. **Interoperability** - Export data that other tools understand
2. **AI-friendly** - LLMs can parse JSON-LD with semantic understanding
3. **Future-proof** - Ready for ActivityPub, Solid, federation
4. **Standards-based** - W3C JSON-LD, Schema.org mappings

---

[← Back to Naming Research](./07-naming-research.md) | [Back to README](./README.md)
