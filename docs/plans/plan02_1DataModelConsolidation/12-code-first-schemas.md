# 12: Code-First Schema Definition

> Schemas defined in TypeScript, living next to their validation and business logic

**Status:** Design exploration

## The Goal

Developers should define schemas in code, right next to the property handlers:

```typescript
// packages/data/src/schemas/task.ts

import { defineSchema, text, select, date, person } from '@xnetjs/data/schema'

export const TaskSchema = defineSchema({
  name: 'Task',
  namespace: 'xnet://xnet.dev/',

  properties: {
    title: text({ required: true }),
    status: select({
      options: [
        { id: 'todo', name: 'To Do', color: 'gray' },
        { id: 'in-progress', name: 'In Progress', color: 'blue' },
        { id: 'done', name: 'Done', color: 'green' }
      ],
      default: 'todo'
    }),
    dueDate: date({ includeTime: false }),
    assignee: person({ multiple: false }),
    priority: select({
      options: [
        { id: 'low', name: 'Low', color: 'gray' },
        { id: 'medium', name: 'Medium', color: 'yellow' },
        { id: 'high', name: 'High', color: 'red' }
      ]
    })
  },

  hasContent: true, // Tasks can have a rich text body
  icon: '✅'
})

// TypeScript type is INFERRED from the schema definition!
type Task = InferNode<typeof TaskSchema>
//   ^? {
//        id: string,
//        schemaId: 'xnet://xnet.dev/Task',
//        title: string,                              // Required, at root
//        status: 'todo' | 'in-progress' | 'done',   // Required, at root
//        dueDate?: number,                          // Optional
//        assignee?: string,                         // Optional
//        priority?: 'low' | 'medium' | 'high'       // Optional
//      }
//
// Note: Properties are flat on the node, not nested under `properties`.
// Content (Yjs) is a runtime capability, not part of the type.
```

## The Schema Builder API

### Property Helpers

Each property type has a helper function that returns both the schema definition AND the validator:

```typescript
// packages/data/src/schema/properties/text.ts

import type { PropertyDefinition, PropertyValue } from '../types'

interface TextOptions {
  required?: boolean
  minLength?: number
  maxLength?: number
  pattern?: RegExp
  placeholder?: string
}

export function text(options: TextOptions = {}) {
  return {
    // Schema definition (for JSON-LD export, UI rendering)
    definition: {
      type: 'text' as const,
      required: options.required ?? false,
      config: {
        minLength: options.minLength,
        maxLength: options.maxLength,
        pattern: options.pattern?.source,
        placeholder: options.placeholder
      }
    },

    // Validator (runs at runtime)
    validate(value: unknown): value is string {
      if (value === null || value === undefined) {
        return !options.required
      }
      if (typeof value !== 'string') return false
      if (options.minLength && value.length < options.minLength) return false
      if (options.maxLength && value.length > options.maxLength) return false
      if (options.pattern && !options.pattern.test(value)) return false
      return true
    },

    // Coercer (converts input to storage format)
    coerce(value: unknown): string | null {
      if (value === null || value === undefined) return null
      return String(value)
    },

    // TypeScript type inference helper
    _type: '' as string
  }
}
```

```typescript
// packages/data/src/schema/properties/select.ts

interface SelectOption {
  id: string
  name: string
  color?: string
}

interface SelectOptions<T extends readonly SelectOption[]> {
  options: T
  required?: boolean
  default?: T[number]['id']
}

export function select<T extends readonly SelectOption[]>(options: SelectOptions<T>) {
  type OptionId = T[number]['id']

  return {
    definition: {
      type: 'select' as const,
      required: options.required ?? false,
      config: {
        options: options.options,
        default: options.default
      }
    },

    validate(value: unknown): value is OptionId {
      if (value === null || value === undefined) {
        return !options.required
      }
      return options.options.some((opt) => opt.id === value)
    },

    coerce(value: unknown): OptionId | null {
      if (value === null || value === undefined) {
        return options.default ?? null
      }
      const opt = options.options.find((o) => o.id === value || o.name === value)
      return (opt?.id as OptionId) ?? null
    },

    // Type is inferred as union of option IDs!
    _type: '' as OptionId
  }
}
```

### The defineSchema Function

```typescript
// packages/data/src/schema/define.ts

import type { Schema, PropertyDefinition } from './types'

interface SchemaOptions<P extends Record<string, PropertyBuilder>> {
  name: string
  namespace: string
  properties: P
  extends?: Schema
  document?: 'yjs' | 'automerge' // CRDT document type
}

type PropertyBuilder = ReturnType<typeof text> | ReturnType<typeof select> | /* ... */

export function defineSchema<P extends Record<string, PropertyBuilder>>(
  options: SchemaOptions<P>
): DefinedSchema<P> {
  const schemaId = `${options.namespace}${options.name}` as const

  // Build property definitions
  const properties: PropertyDefinition[] = Object.entries(options.properties).map(
    ([name, builder]) => ({
      '@id': `${schemaId}#${name}`,
      name,
      ...builder.definition
    })
  )

  // Build validators map
  const validators = Object.fromEntries(
    Object.entries(options.properties).map(([name, builder]) => [
      `${schemaId}#${name}`,
      builder.validate
    ])
  )

  // Build coercers map
  const coercers = Object.fromEntries(
    Object.entries(options.properties).map(([name, builder]) => [
      `${schemaId}#${name}`,
      builder.coerce
    ])
  )

  return {
    // The schema definition (JSON-LD compatible)
    schema: {
      '@id': schemaId,
      '@type': 'xnet://xnet.dev/Schema',
      name: options.name,
      namespace: options.namespace,
      properties,
      extends: options.extends?.['@id'],
      document: options.document
    },

    // Runtime validation
    validate(node: unknown): ValidationResult {
      // ... uses validators map
    },

    // Create a node of this type
    create(props: InferProperties<P>, options?: CreateOptions): Node {
      // ... uses coercers, sets schemaId
    },

    // Type guard
    is(node: Node): node is InferNode<P> {
      return node.schemaId === schemaId
    },

    // For type inference
    _schemaId: schemaId,
    _properties: {} as P
  }
}
```

### Type Inference Magic

The key insight: TypeScript can infer the node type FROM the schema definition:

```typescript
// packages/data/src/schema/infer.ts

// Infer the property type from a property builder
type InferPropertyType<B> = B extends { _type: infer T } ? T : never

// Infer all properties from a schema's property builders (flat, not nested)
type InferProperties<P extends Record<string, PropertyBuilder>> = {
  [K in keyof P as P[K]['definition']['required'] extends true ? K : never]: InferPropertyType<P[K]>
} & {
  [K in keyof P as P[K]['definition']['required'] extends true ? never : K]?: InferPropertyType<
    P[K]
  >
}

// Infer the full node type from a defined schema
// Properties are FLAT on the node (not nested under `properties`)
type InferNode<S extends DefinedSchema<any>> = {
  id: string
  schemaId: S['_schemaId']
} & InferProperties<S['_properties']>

// Example result for TaskSchema:
// {
//   id: string,
//   schemaId: 'xnet://xnet.dev/Task',
//   title: string,
//   status: 'todo' | 'in-progress' | 'done',
//   dueDate?: number,
//   ...
// }
```

## Full Example: Task Schema with Validation

```typescript
// packages/data/src/schemas/task.ts

import { defineSchema, text, select, date, person, checkbox } from '@xnetjs/data/schema'

// Define the schema with full validation
export const TaskSchema = defineSchema({
  name: 'Task',
  namespace: 'xnet://xnet.dev/',

  properties: {
    title: text({
      required: true,
      minLength: 1,
      maxLength: 500
    }),

    status: select({
      required: true,
      options: [
        { id: 'todo', name: 'To Do', color: 'gray' },
        { id: 'in-progress', name: 'In Progress', color: 'blue' },
        { id: 'done', name: 'Done', color: 'green' }
      ] as const, // as const for literal type inference
      default: 'todo'
    }),

    dueDate: date({
      includeTime: false
    }),

    assignee: person({
      multiple: false
    }),

    priority: select({
      options: [
        { id: 'low', name: 'Low', color: 'gray' },
        { id: 'medium', name: 'Medium', color: 'yellow' },
        { id: 'high', name: 'High', color: 'red' }
      ] as const
    }),

    completed: checkbox({
      default: false
    })
  },

  hasContent: true,
  icon: '✅'
})

// Type is automatically inferred!
export type Task = InferNode<typeof TaskSchema>

// Usage
const task = TaskSchema.create({
  title: 'Fix the bug', // required, TypeScript enforces
  status: 'todo', // must be 'todo' | 'in-progress' | 'done'
  priority: 'high' // optional, but typed
})

// Type guard
if (TaskSchema.is(someNode)) {
  someNode.status // TypeScript knows this is 'todo' | 'in-progress' | 'done'
  // Properties are flat on the node, not nested under `properties`
}

// Validation at runtime
const result = TaskSchema.validate(untrustedData)
if (!result.valid) {
  console.error(result.errors)
}
```

## Co-locating Schema with Business Logic

Schemas can live right next to their related logic:

```typescript
// packages/data/src/schemas/task/index.ts
export { TaskSchema, type Task } from './schema'
export { TaskView } from './view'
export { useTask, useTasks } from './hooks'

// packages/data/src/schemas/task/schema.ts
export const TaskSchema = defineSchema({ ... })
export type Task = InferNode<typeof TaskSchema>

// packages/data/src/schemas/task/view.ts
import { TaskSchema, type Task } from './schema'

export function TaskView({ task }: { task: Task }) {
  // Full type safety! Properties are flat on the node.
  return (
    <div>
      <h1>{task.title}</h1>
      <Badge color={getStatusColor(task.status)}>
        {task.status}
      </Badge>
    </div>
  )
}

// packages/data/src/schemas/task/hooks.ts
import { TaskSchema, type Task } from './schema'
import { useNodes, useCreateNode } from '@xnetjs/data/hooks'

export function useTasks() {
  return useNodes<Task>({ schemaId: TaskSchema.schema['@id'] })
}

export function useCreateTask() {
  const create = useCreateNode()
  return (props: Parameters<typeof TaskSchema.create>[0]) => {
    return create(TaskSchema.create(props))
  }
}
```

## Property Type Definitions

All 18 property types as builder functions:

```typescript
// packages/data/src/schema/properties/index.ts

export { text } from './text'
export { number } from './number'
export { checkbox } from './checkbox'
export { date } from './date'
export { dateRange } from './date-range'
export { select } from './select'
export { multiSelect } from './multi-select'
export { person } from './person'
export { relation } from './relation'
export { rollup } from './rollup'
export { formula } from './formula'
export { url } from './url'
export { email } from './email'
export { phone } from './phone'
export { file } from './file'
export { created } from './created'
export { updated } from './updated'
export { createdBy } from './created-by'
```

Each one follows the same pattern:

```typescript
// packages/data/src/schema/properties/email.ts

interface EmailOptions {
  required?: boolean
}

export function email(options: EmailOptions = {}) {
  const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

  return {
    definition: {
      type: 'email' as const,
      required: options.required ?? false
    },

    validate(value: unknown): value is string {
      if (value === null || value === undefined) {
        return !options.required
      }
      return typeof value === 'string' && EMAIL_REGEX.test(value)
    },

    coerce(value: unknown): string | null {
      if (value === null || value === undefined) return null
      const str = String(value).trim().toLowerCase()
      return EMAIL_REGEX.test(str) ? str : null
    },

    _type: '' as string
  }
}
```

## Relation Properties with Type Safety

Relations can reference specific schema types:

```typescript
// packages/data/src/schema/properties/relation.ts

interface RelationOptions<S extends DefinedSchema<any>> {
  schema: S
  multiple?: boolean
  required?: boolean
}

export function relation<S extends DefinedSchema<any>>(options: RelationOptions<S>) {
  type TargetId = string // Could be more specific with branded types

  return {
    definition: {
      type: 'relation' as const,
      required: options.required ?? false,
      config: {
        targetSchema: options.schema.schema['@id'],
        multiple: options.multiple ?? false
      }
    },

    validate(value: unknown): value is TargetId | TargetId[] {
      // ... validation logic
    },

    coerce(value: unknown): TargetId | TargetId[] | null {
      // ... coercion logic
    },

    // Type depends on multiple flag
    _type: '' as typeof options.multiple extends true ? TargetId[] : TargetId
  }
}

// Usage
const ProjectSchema = defineSchema({
  name: 'Project',
  namespace: 'xnet://acme.com/',
  properties: {
    name: text({ required: true }),
    tasks: relation({
      schema: TaskSchema,
      multiple: true
    })
  }
})

type Project = InferNode<typeof ProjectSchema>
// Project.properties.tasks is string[] (task IDs)
```

## JSON-LD Export

The schema definition IS valid JSON-LD:

```typescript
// Export schema as JSON-LD
const taskSchemaJsonLd = TaskSchema.schema
// {
//   "@id": "xnet://xnet.dev/Task",
//   "@type": "xnet://xnet.dev/Schema",
//   "name": "Task",
//   "namespace": "xnet://xnet.dev/",
//   "properties": [
//     { "@id": "xnet://xnet.dev/Task#title", "name": "title", "type": "text", "required": true },
//     { "@id": "xnet://xnet.dev/Task#status", "name": "status", "type": "select", ... },
//     ...
//   ],
//   "hasContent": true,
//   "icon": "✅"
// }
```

## Built-in Schemas

```typescript
// packages/data/src/schemas/index.ts

export { PageSchema, type Page } from './page'
export { DatabaseSchema, type Database } from './database'
export { ItemSchema, type Item } from './item'
export { CanvasSchema, type Canvas } from './canvas'
export { TaskSchema, type Task } from './task'

// Registry of all built-in schemas
export const BUILTIN_SCHEMAS = {
  page: PageSchema,
  database: DatabaseSchema,
  item: ItemSchema,
  canvas: CanvasSchema,
  task: TaskSchema
}
```

```typescript
// packages/data/src/schemas/page.ts

export const PageSchema = defineSchema({
  name: 'Page',
  namespace: 'xnet://xnet.dev/',

  properties: {
    title: text({ required: true }),
    icon: text({}),
    cover: file({ accept: ['image/*'] })
  },

  document: 'yjs' // Rich content
})

export type Page = InferNode<typeof PageSchema>
```

## Plugin Development

Third-party developers define schemas the same way:

```typescript
// my-crm-plugin/src/schemas/contact.ts

import { defineSchema, text, email, phone, relation } from '@xnetjs/data/schema'
import { CompanySchema } from './company'

export const ContactSchema = defineSchema({
  name: 'Contact',
  namespace: 'xnet://my-crm-plugin/',

  properties: {
    name: text({ required: true }),
    email: email({ required: true }),
    phone: phone({}),
    company: relation({ schema: CompanySchema }),
    notes: text({ maxLength: 5000 })
  }
})

export type Contact = InferNode<typeof ContactSchema>
```

## User-Defined Schemas at Runtime

When users create schemas in the UI, they're stored as nodes but use the same validation system:

```typescript
// Runtime schema creation (no TypeScript types, but same validation)
const userRecipeSchema = createSchemaNode({
  name: 'Recipe',
  namespace: `xnet://${currentUser.did}/`,
  properties: [
    { name: 'title', type: 'text', required: true },
    { name: 'ingredients', type: 'text' },
    { name: 'cookTime', type: 'number' }
  ],
  document: 'yjs'
})

// Creates a schema node that the registry can load
await saveNode(userRecipeSchema)

// Later, create nodes of that type
const recipe = await createNode({
  schemaId: userRecipeSchema.properties['@id'],
  properties: {
    title: 'Pancakes',
    ingredients: 'Flour, eggs, milk',
    cookTime: 15
  }
})
// Runtime validation still works!
```

## Summary

| Approach       | TypeScript     | Validation | Co-location | JSON-LD     |
| -------------- | -------------- | ---------- | ----------- | ----------- |
| **Code-first** | Full inference | Built-in   | ✅ Yes      | Auto-export |
| **JSON-first** | Needs codegen  | Separate   | ❌ No       | Native      |
| **UI-created** | None           | Runtime    | N/A         | Auto-export |

**Code-first is best for developers** because:

1. Schema lives next to validation and business logic
2. TypeScript types are inferred, not generated
3. Full IDE support (autocomplete, refactoring)
4. Validators run the same in dev and production
5. JSON-LD export is automatic

---

[← Back to Global Namespacing](./11-global-schema-namespacing.md) | [Back to README](./README.md)
