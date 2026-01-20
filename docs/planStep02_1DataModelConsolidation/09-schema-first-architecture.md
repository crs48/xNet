# 09: Schema-First Architecture

> What if everything is just a schema-defined node?

**Status:** Exploratory - evaluating whether to adopt this approach

## The Insight

Instead of hardcoding `Page`, `Database`, `Item`, `Canvas` as distinct TypeScript types, what if:

1. **Everything is a Node** (or Document, or whatever we call it)
2. **A Schema defines what the node IS** (its type, properties, behaviors)
3. **Built-in schemas** for common types (Page, Database, Item, Canvas)
4. **User-defined schemas** for custom types (Task, Project, Meeting, etc.)

This is how Tana, Notion, and Airtable fundamentally work.

## Current vs. Schema-First

### Current Approach

```typescript
// Hardcoded types in TypeScript
interface Page extends DocumentBase {
  type: 'page'
  content: Y.Doc
}

interface Database extends DocumentBase {
  type: 'database'
  schema: PropertyDefinition[]
  views: View[]
}

interface Item extends DocumentBase {
  type: 'item'
  databaseId: string
  properties: Record<PropertyId, PropertyValue>
}
```

**Problem:** Adding a new type (e.g., Whiteboard) requires code changes.

### Schema-First Approach

```typescript
// One universal type
interface Node {
  id: string
  schemaId: SchemaId // What schema defines this node?
  properties: PropertyBag // Schema-defined properties
  content?: Y.Doc // Optional rich content
  children?: NodeId[] // Optional child nodes

  // Metadata
  created: number
  updated: number
  createdBy: DID
  workspaceId: string

  // JSON-LD
  '@context'?: JsonLdContext
  '@type'?: string // Derived from schema
  '@id'?: string
}

// Schema defines what a node IS
interface Schema {
  id: SchemaId
  name: string // "Page", "Task", "Meeting"

  // JSON-LD identity
  '@type': string // "xnet:Page", "xnet:Task"
  '@context'?: JsonLdContext // Custom context extensions

  // What properties does this type have?
  properties: PropertyDefinition[]

  // Behavioral flags
  hasContent: boolean // Does it have a Y.Doc body?
  hasChildren: boolean // Can it contain other nodes?
  isCollection: boolean // Is it a "database" (contains items)?

  // UI hints
  icon?: string
  color?: string
  defaultView?: ViewType
}
```

## Built-in Schemas

We'd ship with schemas for common types:

```typescript
// packages/data/src/schemas/builtin.ts

export const PAGE_SCHEMA: Schema = {
  id: 'schema:page' as SchemaId,
  name: 'Page',
  '@type': 'xnet:Page',
  properties: [
    { id: 'prop:title', name: 'Title', type: 'text', required: true },
    { id: 'prop:icon', name: 'Icon', type: 'text' },
    { id: 'prop:cover', name: 'Cover', type: 'file' }
  ],
  hasContent: true, // Pages have rich text
  hasChildren: true, // Pages can have subpages
  isCollection: false, // Pages aren't databases
  icon: '📄'
}

export const DATABASE_SCHEMA: Schema = {
  id: 'schema:database' as SchemaId,
  name: 'Database',
  '@type': 'xnet:Database',
  properties: [
    { id: 'prop:title', name: 'Title', type: 'text', required: true },
    { id: 'prop:icon', name: 'Icon', type: 'text' },
    // Schema properties are stored as a special property
    { id: 'prop:schema', name: 'Schema', type: 'schema', hidden: true }
  ],
  hasContent: false, // Databases don't have body text
  hasChildren: true, // Databases contain items
  isCollection: true, // This IS a collection
  icon: '🗃️',
  defaultView: 'table'
}

export const ITEM_SCHEMA: Schema = {
  id: 'schema:item' as SchemaId,
  name: 'Item',
  '@type': 'xnet:Item',
  properties: [], // Inherited from parent database
  hasContent: true, // Items can have body content
  hasChildren: false, // Items don't have children
  isCollection: false,
  icon: '📋'
}

export const CANVAS_SCHEMA: Schema = {
  id: 'schema:canvas' as SchemaId,
  name: 'Canvas',
  '@type': 'xnet:Canvas',
  properties: [{ id: 'prop:title', name: 'Title', type: 'text', required: true }],
  hasContent: true, // Canvas uses Y.Doc for spatial data
  hasChildren: false,
  isCollection: false,
  icon: '🎨'
}

// Common user-facing schemas
export const TASK_SCHEMA: Schema = {
  id: 'schema:task' as SchemaId,
  name: 'Task',
  '@type': 'xnet:Task',
  properties: [
    { id: 'prop:title', name: 'Title', type: 'text', required: true },
    {
      id: 'prop:status',
      name: 'Status',
      type: 'select',
      config: {
        options: [
          { id: 'todo', name: 'To Do', color: 'gray' },
          { id: 'in-progress', name: 'In Progress', color: 'blue' },
          { id: 'done', name: 'Done', color: 'green' }
        ]
      }
    },
    { id: 'prop:due', name: 'Due Date', type: 'date' },
    { id: 'prop:assignee', name: 'Assignee', type: 'person' },
    {
      id: 'prop:priority',
      name: 'Priority',
      type: 'select',
      config: {
        options: [
          { id: 'low', name: 'Low', color: 'gray' },
          { id: 'medium', name: 'Medium', color: 'yellow' },
          { id: 'high', name: 'High', color: 'red' }
        ]
      }
    }
  ],
  hasContent: true,
  hasChildren: false,
  isCollection: false,
  icon: '✅'
}

export const BUILTIN_SCHEMAS = {
  page: PAGE_SCHEMA,
  database: DATABASE_SCHEMA,
  item: ITEM_SCHEMA,
  canvas: CANVAS_SCHEMA,
  task: TASK_SCHEMA
}
```

## How It Works

### Creating a Node

```typescript
// Create a page (using built-in schema)
const page = createNode({
  schemaId: 'schema:page',
  properties: {
    'prop:title': 'My Page'
  },
  content: new Y.Doc()
})

// Create a task (using built-in schema)
const task = createNode({
  schemaId: 'schema:task',
  properties: {
    'prop:title': 'Fix the bug',
    'prop:status': 'todo',
    'prop:due': 1706400000000,
    'prop:priority': 'high'
  }
})

// Create a custom type (user-defined schema)
const meeting = createNode({
  schemaId: userDefinedMeetingSchema.id,
  properties: {
    'prop:title': 'Standup',
    'prop:date': 1706400000000,
    'prop:attendees': ['did:key:alice', 'did:key:bob']
  }
})
```

### Querying Nodes

```typescript
// Find all tasks
const tasks = await query({
  schemaId: 'schema:task'
})

// Find all nodes with a due date
const withDueDate = await query({
  hasProperty: 'prop:due',
  propertyFilter: {
    'prop:due': { $lt: Date.now() + 86400000 } // Due in next 24h
  }
})

// Find all "collection" nodes (databases)
const databases = await query({
  schemaFilter: { isCollection: true }
})
```

### Schema Inheritance

Schemas can extend other schemas:

```typescript
const BUG_SCHEMA: Schema = {
  id: 'schema:bug',
  name: 'Bug',
  '@type': 'xnet:Bug',
  extends: 'schema:task', // Inherits Task properties
  properties: [
    // Additional properties
    {
      id: 'prop:severity',
      name: 'Severity',
      type: 'select',
      config: {
        options: [
          { id: 'critical', name: 'Critical', color: 'red' },
          { id: 'major', name: 'Major', color: 'orange' },
          { id: 'minor', name: 'Minor', color: 'yellow' }
        ]
      }
    },
    { id: 'prop:reproduction', name: 'Steps to Reproduce', type: 'text' }
  ],
  icon: '🐛'
}
```

## JSON-LD Integration

Every schema IS a JSON-LD type definition:

```typescript
// A node with schema becomes valid JSON-LD automatically
const task = createNode({
  schemaId: 'schema:task',
  properties: {
    'prop:title': 'Fix the bug',
    'prop:status': 'in-progress'
  }
})

// Export as JSON-LD
const jsonLd = toJsonLd(task)
// {
//   "@context": { ... },
//   "@type": "xnet:Task",
//   "@id": "xnet://did:key:.../node-123",
//   "schema:name": "Fix the bug",
//   "xnet:status": "in-progress"
// }
```

Schemas can define their own context extensions:

```typescript
const MEETING_SCHEMA: Schema = {
  id: 'schema:meeting',
  name: 'Meeting',
  '@type': 'xnet:Meeting',
  '@context': {
    // Extend base context with meeting-specific mappings
    'attendees': 'schema:attendee',
    'location': 'schema:location',
    'startTime': 'schema:startDate',
    'endTime': 'schema:endDate'
  },
  properties: [...]
}
```

## Benefits

### 1. Ultimate Flexibility

Users can create ANY type without code changes:

- Project management: Task, Project, Sprint, Epic
- CRM: Contact, Company, Deal, Activity
- Knowledge base: Note, Concept, Reference
- Personal: Recipe, Book, Movie, Habit

### 2. One Mental Model

Instead of "Pages work this way, Databases work that way, Items work another way":

- Everything is a Node
- Schema defines behavior
- Same API for everything

### 3. JSON-LD Native

Every schema is a JSON-LD type. Export is trivial:

```typescript
const exported = nodes.map(toJsonLd)
// Valid JSON-LD array, ready for any RDF tool
```

### 4. Schema Evolution

Schemas can evolve without migrations:

- Add new property? Old nodes just don't have it
- Remove property? Old nodes keep the data
- Change property type? Provide migration function

### 5. Interoperability

Import schemas from other systems:

```typescript
// Import a schema from another xNet instance
const importedSchema = await importSchema('xnet://other-user/schema:recipe')

// Now you can create nodes of that type
const recipe = createNode({ schemaId: importedSchema.id, ... })
```

## Challenges

### 1. Type Safety

With everything being a generic `Node`, we lose TypeScript's help:

```typescript
// Current: TypeScript knows what a Page is
const page: Page = { type: 'page', content: doc, ... }
page.content.getText()  // ✓ TypeScript knows content exists

// Schema-first: Everything is Node
const node: Node = { schemaId: 'schema:page', ... }
node.content?.getText()  // Need optional chaining everywhere
```

**Solution:** Schema-aware type guards:

```typescript
function isPage(node: Node): node is Node & { content: Y.Doc } {
  return node.schemaId === 'schema:page'
}

if (isPage(node)) {
  node.content.getText() // ✓ TypeScript knows
}
```

### 2. Performance

Looking up schema for every node access could be slow.

**Solution:** Cache schema lookups, denormalize critical flags:

```typescript
interface Node {
  schemaId: SchemaId
  // Denormalized from schema for fast access
  _hasContent: boolean
  _isCollection: boolean
}
```

### 3. Built-in Behaviors

Some types need special behavior (Database creates Items, Canvas has spatial layout).

**Solution:** Schema can reference behavior handlers:

```typescript
interface Schema {
  // ...
  behaviors?: {
    onCreate?: (node: Node) => void
    onAddChild?: (parent: Node, child: Node) => void
    renderer?: string // Component name for UI
  }
}
```

### 4. Migration Complexity

Existing code assumes `Page`, `Database`, `Item` types.

**Solution:** Gradual migration with compatibility layer:

```typescript
// Old code still works
const page = (await getDocument(id)) as Page

// Internally, it's just a Node with schema:page
// Type aliases maintained for backward compatibility
type Page = Node & { schemaId: 'schema:page'; content: Y.Doc }
```

## Comparison

| Aspect           | Current (Hardcoded Types) | Schema-First           |
| ---------------- | ------------------------- | ---------------------- |
| Adding new types | Code change required      | Schema definition only |
| Type safety      | Strong TypeScript         | Weaker, needs guards   |
| Performance      | Direct property access    | Schema lookup overhead |
| Flexibility      | Fixed set of types        | Unlimited user types   |
| JSON-LD fit      | Mapping required          | Native                 |
| Learning curve   | Multiple type APIs        | One Node API           |
| Notion-like UX   | Partial                   | Full                   |

## Recommendation

**Adopt schema-first architecture** with these guardrails:

1. **Built-in schemas are special** - Page, Database, Item, Canvas have hardcoded behaviors
2. **TypeScript helpers** - Provide `isPage()`, `isDatabase()` etc. guards
3. **Performance optimization** - Denormalize critical schema flags
4. **Gradual migration** - Keep type aliases for backward compatibility

## Implementation Sketch

### Phase 1: Schema Infrastructure

```typescript
// packages/data/src/schema/types.ts
interface Schema {
  id: SchemaId
  name: string
  '@type': string
  properties: PropertyDefinition[]
  hasContent: boolean
  hasChildren: boolean
  isCollection: boolean
  extends?: SchemaId
  behaviors?: SchemaBehaviors
}

// packages/data/src/schema/registry.ts
class SchemaRegistry {
  private schemas = new Map<SchemaId, Schema>()

  register(schema: Schema): void
  get(id: SchemaId): Schema | undefined
  resolve(id: SchemaId): Schema // Includes inherited properties
  validate(node: Node): ValidationResult
}
```

### Phase 2: Node Type

```typescript
// packages/data/src/types/node.ts
interface Node {
  id: string
  schemaId: SchemaId
  properties: Record<PropertyId, PropertyValue>
  content?: Y.Doc
  children?: NodeId[]
  parentId?: NodeId

  created: number
  updated: number
  createdBy: DID
  workspaceId: string

  // JSON-LD (populated on export)
  '@context'?: JsonLdContext
  '@type'?: string
  '@id'?: string
}
```

### Phase 3: Compatibility Layer

```typescript
// packages/data/src/compat/types.ts

// Type aliases for backward compatibility
type Page = Node & {
  schemaId: 'schema:page'
  content: Y.Doc
}

type Database = Node & {
  schemaId: 'schema:database'
  // Schema stored in properties['prop:schema']
}

type Item = Node & {
  schemaId: 'schema:item'
  properties: Record<PropertyId, PropertyValue>
}

// Type guards
function isPage(node: Node): node is Page {
  return node.schemaId === 'schema:page'
}
```

## Questions to Resolve

1. **Naming:** If everything is schema-based, should we call it `Node` instead of `Document`?

2. **Schema storage:** Where do user-defined schemas live? In the same Node structure?

3. **Schema sync:** How do schemas sync across peers? Same as documents?

4. **Property inheritance:** How exactly does `extends` work for property merging?

5. **Breaking change:** Is this worth the migration effort, or should we defer to v2?

---

## Conclusion

Schema-first architecture would:

- Simplify the mental model (everything is a Node with a Schema)
- Enable user-defined types (like Notion/Tana)
- Make JSON-LD native (schemas ARE types)
- Require migration effort but provide long-term flexibility

**Next step:** Decide whether to adopt this for the current consolidation or plan it for a future major version.

---

[← Back to JSON-LD Integration](./08-jsonld-integration.md) | [Back to README](./README.md)
