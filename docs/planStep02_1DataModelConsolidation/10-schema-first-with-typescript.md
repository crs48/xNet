# 10: Schema-First with TypeScript Safety

> How to get schema flexibility AND TypeScript types

**Status:** Design exploration

## The Challenge

We want:

1. **Schema flexibility** - Users define types at runtime, no code changes
2. **TypeScript safety** - Developers get autocomplete, type checking, linting
3. **AI-friendly** - LLMs and agents can understand the code via types

These seem contradictory: runtime schemas vs compile-time types.

## The Solution: Generated Types + Runtime Validation

```
┌─────────────────────────────────────────────────────────────────┐
│                         Schema Definition                        │
│  (JSON-LD, stored as Node, editable in UI)                      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
              ┌───────────────┴───────────────┐
              │                               │
              ▼                               ▼
┌─────────────────────────┐     ┌─────────────────────────┐
│   TypeScript Types      │     │   Runtime Validation    │
│   (generated at build)  │     │   (always available)    │
│                         │     │                         │
│   - Built-in schemas    │     │   - Schema registry     │
│   - Plugin schemas      │     │   - Property validation │
│   - User schemas (opt)  │     │   - Type guards         │
└─────────────────────────┘     └─────────────────────────┘
```

## How It Works

### 1. Schema Definition (Source of Truth)

Schemas are defined as JSON-LD and stored as Nodes:

```typescript
// This IS a Node, stored in the database, synced via CRDT
const pageSchema: SchemaNode = {
  id: 'schema:xnet:page',
  schemaId: 'schema:xnet:schema', // Meta: schema of schemas
  properties: {
    'prop:name': 'Page',
    'prop:jsonld-type': 'xnet:Page',
    'prop:properties': [
      { name: 'title', type: 'text', required: true },
      { name: 'icon', type: 'text' },
      { name: 'cover', type: 'file' }
    ],
    'prop:has-content': true,
    'prop:has-children': true,
    'prop:is-collection': false
  }
}
```

### 2. TypeScript Generation (Build Time)

For built-in and plugin schemas, we generate TypeScript:

```typescript
// packages/data/src/types/generated/page.ts
// AUTO-GENERATED FROM schema:xnet:page - DO NOT EDIT

import type { Node, NodeBase } from '../node'
import type { Y } from 'yjs'

/**
 * Page - A rich text document
 * @schema schema:xnet:page
 * @jsonld xnet:Page
 */
export interface Page extends NodeBase {
  schemaId: 'schema:xnet:page'

  properties: {
    'prop:title': string
    'prop:icon'?: string
    'prop:cover'?: FileValue
  }

  /** Rich text content (Yjs document) */
  content: Y.Doc

  /** Child node IDs */
  children?: string[]
}

/**
 * Type guard for Page nodes
 */
export function isPage(node: Node): node is Page {
  return node.schemaId === 'schema:xnet:page'
}

/**
 * Create a new Page node
 */
export function createPage(options: CreatePageOptions): Page {
  return createNode({
    schemaId: 'schema:xnet:page',
    properties: {
      'prop:title': options.title,
      'prop:icon': options.icon,
      'prop:cover': options.cover
    },
    content: options.content ?? new Y.Doc(),
    ...options
  }) as Page
}
```

### 3. Runtime Validation (Always)

Even with generated types, runtime validation ensures data integrity:

```typescript
// packages/data/src/schema/validation.ts

export function validateNode(node: Node): ValidationResult {
  const schema = schemaRegistry.get(node.schemaId)
  if (!schema) {
    return { valid: false, error: `Unknown schema: ${node.schemaId}` }
  }

  // Validate required properties
  for (const prop of schema.properties) {
    if (prop.required && !(prop.id in node.properties)) {
      return { valid: false, error: `Missing required property: ${prop.name}` }
    }
  }

  // Validate property types
  for (const [propId, value] of Object.entries(node.properties)) {
    const propDef = schema.properties.find((p) => p.id === propId)
    if (propDef && !validatePropertyValue(value, propDef.type)) {
      return { valid: false, error: `Invalid type for ${propDef.name}` }
    }
  }

  // Validate structural constraints
  if (schema.hasContent && !node.content) {
    return { valid: false, error: 'Schema requires content but none provided' }
  }

  return { valid: true }
}
```

### 4. The Code Generator

A CLI tool generates TypeScript from schemas:

```bash
# Generate types for built-in schemas
pnpm xnet-codegen --schemas packages/data/schemas/*.json --out packages/data/src/types/generated/

# Generate types for a plugin's schemas
pnpm xnet-codegen --schemas my-plugin/schemas/*.json --out my-plugin/src/types/
```

```typescript
// tools/codegen/src/generate-types.ts

export function generateTypeScript(schema: Schema): string {
  const interfaceName = pascalCase(schema.name)
  const properties = schema.properties
    .map((p) => {
      const tsType = propertyTypeToTS(p.type)
      const optional = p.required ? '' : '?'
      return `    '${p.id}'${optional}: ${tsType}`
    })
    .join('\n')

  return `
/**
 * ${schema.name}
 * @schema ${schema.id}
 * @jsonld ${schema['@type']}
 */
export interface ${interfaceName} extends NodeBase {
  schemaId: '${schema.id}'
  
  properties: {
${properties}
  }
  ${schema.hasContent ? '\n  content: Y.Doc' : ''}
  ${schema.hasChildren ? '\n  children?: string[]' : ''}
}

export function is${interfaceName}(node: Node): node is ${interfaceName} {
  return node.schemaId === '${schema.id}'
}
`
}
```

## Three Tiers of Type Safety

### Tier 1: Built-in Schemas (Full TypeScript)

Page, Database, Item, Canvas, Task - these ship with xNet and have generated types:

```typescript
import { Page, Database, Item, isPage, createPage } from '@xnet/data'

const page = createPage({ title: 'Hello' })
//    ^? Page - full autocomplete

if (isPage(node)) {
  console.log(node.properties['prop:title'])
  //                          ^? string - TypeScript knows
}
```

### Tier 2: Plugin Schemas (Generated TypeScript)

Plugins can define schemas and generate types at build time:

```typescript
// my-crm-plugin/schemas/contact.json
{
  "id": "schema:crm:contact",
  "name": "Contact",
  "@type": "crm:Contact",
  "properties": [
    { "id": "prop:name", "name": "Name", "type": "text", "required": true },
    { "id": "prop:email", "name": "Email", "type": "email" },
    { "id": "prop:company", "name": "Company", "type": "relation" }
  ]
}

// After codegen: my-crm-plugin/src/types/contact.ts
export interface Contact extends NodeBase {
  schemaId: 'schema:crm:contact'
  properties: {
    'prop:name': string
    'prop:email'?: string
    'prop:company'?: string[]
  }
}
```

### Tier 3: User Schemas (Runtime Only)

Users create schemas in the UI - no TypeScript, but full runtime validation:

```typescript
// User creates "Recipe" schema in UI
// No TypeScript types, but:

const recipe = createNode({
  schemaId: 'schema:user:recipe', // User-defined
  properties: {
    'prop:title': 'Pancakes',
    'prop:ingredients': ['flour', 'eggs', 'milk'],
    'prop:cook-time': 15
  }
})

// Runtime validation still works
const result = validateNode(recipe) // ✓ Valid

// Type-safe access via helper
const title = getProperty(recipe, 'prop:title', 'text')
//    ^? string | undefined
```

## Developer Experience

### For xNet Core Developers

Full TypeScript, everything is typed:

```typescript
import { Node, Page, Database, Item, isPage, isDatabase } from '@xnet/data'

function renderNode(node: Node) {
  if (isPage(node)) {
    // TypeScript knows this is a Page
    return <PageEditor content={node.content} title={node.properties['prop:title']} />
  }
  if (isDatabase(node)) {
    // TypeScript knows this is a Database
    return <DatabaseView schema={node.properties['prop:schema']} />
  }
  // Generic node renderer
  return <GenericNodeView node={node} />
}
```

### For Plugin Developers

Generate types from their schemas:

```typescript
// plugin/package.json
{
  "scripts": {
    "codegen": "xnet-codegen --schemas ./schemas --out ./src/types"
  }
}

// plugin/src/index.ts
import { Contact, isContact, createContact } from './types/contact'

export function createNewContact(name: string, email: string): Contact {
  return createContact({
    name,
    email,
    createdBy: getCurrentUser()
  })
}
```

### For AI Agents

Types provide context:

```typescript
// AI sees this interface and understands the structure
interface Task extends NodeBase {
  schemaId: 'schema:xnet:task'
  properties: {
    'prop:title': string
    'prop:status': 'todo' | 'in-progress' | 'done'
    'prop:due'?: number
    'prop:assignee'?: string[]
    'prop:priority'?: 'low' | 'medium' | 'high'
  }
  content?: Y.Doc
}

// AI can write correct code:
const task = createTask({
  title: 'Fix the bug',
  status: 'todo',
  priority: 'high'
})
```

### For End Users

No TypeScript needed - just the UI:

```
┌─────────────────────────────────────────┐
│  Create New Type                        │
├─────────────────────────────────────────┤
│  Name: [Recipe                      ]   │
│  Icon: [🍳]                             │
│                                         │
│  Properties:                            │
│  ┌─────────────┬──────────┬──────────┐  │
│  │ Name        │ Type     │ Required │  │
│  ├─────────────┼──────────┼──────────┤  │
│  │ Title       │ Text     │ ✓        │  │
│  │ Ingredients │ Text     │          │  │
│  │ Cook Time   │ Number   │          │  │
│  │ Image       │ File     │          │  │
│  └─────────────┴──────────┴──────────┘  │
│                                         │
│  [+ Add Property]                       │
│                                         │
│              [Cancel]  [Create Type]    │
└─────────────────────────────────────────┘
```

## Schema as Node (Self-Describing)

The schema for schemas is itself a schema:

```typescript
const META_SCHEMA: Schema = {
  id: 'schema:xnet:schema',
  name: 'Schema',
  '@type': 'xnet:Schema',
  properties: [
    { id: 'prop:name', name: 'Name', type: 'text', required: true },
    { id: 'prop:jsonld-type', name: 'JSON-LD Type', type: 'text', required: true },
    { id: 'prop:properties', name: 'Properties', type: 'json', required: true },
    { id: 'prop:has-content', name: 'Has Content', type: 'checkbox' },
    { id: 'prop:has-children', name: 'Has Children', type: 'checkbox' },
    { id: 'prop:is-collection', name: 'Is Collection', type: 'checkbox' },
    { id: 'prop:extends', name: 'Extends', type: 'relation' },
    { id: 'prop:icon', name: 'Icon', type: 'text' },
    { id: 'prop:color', name: 'Color', type: 'text' }
  ],
  hasContent: false,
  hasChildren: false,
  isCollection: false
}
```

So when you create a new "Recipe" type in the UI, you're actually creating:

```typescript
const recipeSchemaNode: Node = {
  id: 'node:user-schema-recipe',
  schemaId: 'schema:xnet:schema', // It's a Schema node
  properties: {
    'prop:name': 'Recipe',
    'prop:jsonld-type': 'user:Recipe',
    'prop:properties': [
      { id: 'prop:title', name: 'Title', type: 'text', required: true },
      { id: 'prop:ingredients', name: 'Ingredients', type: 'text' },
      { id: 'prop:cook-time', name: 'Cook Time', type: 'number' }
    ],
    'prop:has-content': true,
    'prop:icon': '🍳'
  },
  createdBy: 'did:key:user...',
  workspaceId: 'ws-123'
  // ...
}
```

This means:

- Schemas sync via the same CRDT mechanism as everything else
- Users can share schemas with each other
- Schemas can be imported/exported as JSON-LD
- The system is fully self-describing

## Migration Path

### Phase 1: Add Schema Infrastructure (Week 1)

1. Define `Schema` interface and `META_SCHEMA`
2. Create `SchemaRegistry` with built-in schemas
3. Add `schemaId` field to existing Node/Document
4. Runtime validation for all nodes

### Phase 2: Code Generator (Week 2)

1. Build `xnet-codegen` CLI tool
2. Generate types for built-in schemas (Page, Database, Item, Canvas, Task)
3. Replace handwritten types with generated ones
4. Verify all tests pass

### Phase 3: Migrate Existing Code (Week 2-3)

1. Update `@xnet/data` to use generated types
2. Maintain backward compatibility aliases
3. Update React hooks to be schema-aware
4. Update query layer

### Phase 4: User-Defined Schemas (Week 3-4)

1. UI for creating/editing schemas
2. Schema storage as Nodes
3. Schema sync via CRDT
4. Import/export schemas

## File Structure

```
packages/data/
├── schemas/                    # Schema definitions (JSON)
│   ├── builtin/
│   │   ├── page.json
│   │   ├── database.json
│   │   ├── item.json
│   │   ├── canvas.json
│   │   └── task.json
│   └── meta/
│       └── schema.json         # Schema of schemas
│
├── src/
│   ├── types/
│   │   ├── node.ts             # Base Node interface
│   │   ├── schema.ts           # Schema interface
│   │   └── generated/          # AUTO-GENERATED
│   │       ├── index.ts
│   │       ├── page.ts
│   │       ├── database.ts
│   │       ├── item.ts
│   │       ├── canvas.ts
│   │       └── task.ts
│   │
│   ├── schema/
│   │   ├── registry.ts         # Schema registry
│   │   ├── validation.ts       # Runtime validation
│   │   └── loader.ts           # Load schemas from nodes
│   │
│   └── index.ts

tools/
└── codegen/
    ├── src/
    │   ├── index.ts            # CLI entry
    │   ├── parser.ts           # Parse schema JSON
    │   └── generator.ts        # Generate TypeScript
    └── package.json
```

## Trade-off Summary

| Aspect               | Without Codegen  | With Codegen                  |
| -------------------- | ---------------- | ----------------------------- |
| TypeScript safety    | ❌ Weak          | ✅ Strong for built-in/plugin |
| Runtime flexibility  | ✅ Full          | ✅ Full                       |
| Developer experience | ⚠️ Manual guards | ✅ Autocomplete, linting      |
| AI/LLM friendliness  | ⚠️ Limited       | ✅ Full type context          |
| Build complexity     | ✅ Simple        | ⚠️ Codegen step               |
| User-defined types   | ✅ Works         | ✅ Works (no TS)              |

## Decision Point

**Recommended approach:** Schema-first with TypeScript codegen

- **Built-in schemas** → Generated TypeScript, full type safety
- **Plugin schemas** → Generated TypeScript via CLI
- **User schemas** → Runtime only, no TypeScript

This gives us:

1. ✅ Schema flexibility (users can create any type)
2. ✅ TypeScript safety (for core and plugins)
3. ✅ AI-friendly (types provide context)
4. ✅ Self-describing (schemas are nodes)
5. ✅ JSON-LD native (schemas define types)

---

## Questions Resolved

1. **TypeScript types?** → Generated from schemas at build time
2. **Naming?** → `Node` instead of `Document` (everything is a node)
3. **Schema storage?** → Schemas are Nodes (self-describing)
4. **Timing?** → Part of current consolidation (foundational change)

---

[← Back to Schema-First Architecture](./09-schema-first-architecture.md) | [Back to README](./README.md)
