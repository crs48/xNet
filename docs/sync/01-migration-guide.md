# Schema Migration Guide

How to safely evolve schemas in xNet without breaking existing data or peers.

## Overview

xNet uses a **translate-on-read** approach to schema evolution. This means:

1. Data is stored in its original format
2. Migrations are applied when reading, not when writing
3. Old clients can still read new data (graceful degradation)
4. No batch migrations required

## Schema Versioning

Every schema has a semantic version:

```typescript
import { defineSchema } from '@xnetjs/data'

const TaskSchema = defineSchema({
  name: 'Task',
  version: '2.0.0', // Major.Minor.Patch
  properties: {
    title: { type: 'text' },
    status: { type: 'select', options: ['todo', 'doing', 'done'] },
    // Added in v2.0.0
    priority: { type: 'select', options: ['low', 'medium', 'high'] }
  }
})
```

### Version Number Meanings

| Change Type                     | Version Bump | Example           |
| ------------------------------- | ------------ | ----------------- |
| Add optional field              | Minor        | `1.0.0` → `1.1.0` |
| Add required field with default | Minor        | `1.0.0` → `1.1.0` |
| Remove field                    | Major        | `1.0.0` → `2.0.0` |
| Rename field                    | Major        | `1.0.0` → `2.0.0` |
| Change field type               | Major        | `1.0.0` → `2.0.0` |
| Fix bug in migration            | Patch        | `1.0.1` → `1.0.2` |

## Creating Migrations with Lenses

Lenses transform data between schema versions. They're bidirectional - you can upgrade and downgrade.

### Basic Lens Structure

```typescript
import { createLens, type SchemaLens } from '@xnetjs/data'

const taskV1ToV2: SchemaLens = createLens({
  from: '1.0.0',
  to: '2.0.0',

  // Transform v1 → v2
  up(node) {
    return {
      ...node,
      priority: node.priority ?? 'medium' // Add default
    }
  },

  // Transform v2 → v1
  down(node) {
    const { priority, ...rest } = node
    return rest // Remove new field
  }
})
```

### Registering Lenses

```typescript
import { LensRegistry } from '@xnetjs/data'

const registry = new LensRegistry()

// Register all lenses for a schema
registry.register('Task', taskV1ToV2)
registry.register('Task', taskV2ToV3)

// The registry automatically chains lenses
// v1 → v2 → v3 happens automatically
```

### Using Migrations

```typescript
import { NodeStore } from '@xnetjs/data'

const store = new NodeStore({ lensRegistry: registry })

// Read with automatic migration
const task = await store.getWithMigration(taskId, {
  targetVersion: '3.0.0'
})
// Data is transformed to v3 format

// Original data unchanged in storage
const original = await store.get(taskId)
// Still in its original version
```

## Migration Patterns

### Adding a Field

```typescript
const addPriority: SchemaLens = createLens({
  from: '1.0.0',
  to: '1.1.0',
  up: (node) => ({
    ...node,
    priority: 'medium' // Sensible default
  }),
  down: (node) => {
    const { priority, ...rest } = node
    return rest
  }
})
```

### Renaming a Field

```typescript
const renameDueDate: SchemaLens = createLens({
  from: '1.0.0',
  to: '2.0.0',
  up: (node) => {
    const { due_date, ...rest } = node
    return { ...rest, dueDate: due_date }
  },
  down: (node) => {
    const { dueDate, ...rest } = node
    return { ...rest, due_date: dueDate }
  }
})
```

### Changing Field Type

```typescript
const statusToEnum: SchemaLens = createLens({
  from: '1.0.0',
  to: '2.0.0',
  up: (node) => ({
    ...node,
    // String → structured enum
    status: { value: node.status, color: getColorForStatus(node.status) }
  }),
  down: (node) => ({
    ...node,
    // Structured enum → string
    status: node.status.value
  })
})
```

### Splitting a Field

```typescript
const splitName: SchemaLens = createLens({
  from: '1.0.0',
  to: '2.0.0',
  up: (node) => {
    const [firstName, ...rest] = (node.name || '').split(' ')
    return {
      ...node,
      firstName,
      lastName: rest.join(' ')
    }
  },
  down: (node) => ({
    ...node,
    name: `${node.firstName} ${node.lastName}`.trim()
  })
})
```

### Merging Fields

```typescript
const mergeAddress: SchemaLens = createLens({
  from: '1.0.0',
  to: '2.0.0',
  up: (node) => ({
    ...node,
    address: {
      street: node.street,
      city: node.city,
      zip: node.zip
    }
  }),
  down: (node) => ({
    ...node,
    street: node.address?.street,
    city: node.address?.city,
    zip: node.address?.zip
  })
})
```

## React Integration

### useQuery with Migrations

```typescript
import { useQuery } from '@xnetjs/react'

function TaskList() {
  const { data: tasks } = useQuery({
    type: 'Task',
    targetVersion: '3.0.0', // Migrate to this version
  })

  // All tasks are v3 format, regardless of storage version
  return tasks.map(task => (
    <TaskCard key={task.id} task={task} />
  ))
}
```

### Migration Status

```typescript
import { useQuery } from '@xnetjs/react'

function TaskList() {
  const { data, migrationStats } = useQuery({
    type: 'Task',
    targetVersion: '3.0.0',
  })

  if (migrationStats.migrated > 0) {
    console.log(`Migrated ${migrationStats.migrated} tasks`)
  }

  return <>{/* ... */}</>
}
```

## CLI Tools

### Extract Schema

```bash
# Extract current schema to JSON
xnet schema extract --output schemas/

# Creates schemas/Task.v2.0.0.json
```

### Diff Schemas

```bash
# Compare two versions
xnet schema diff Task 1.0.0 2.0.0

# Output:
# + priority: select (added)
# ~ status: text → select (type changed)
```

### Validate Migration

```bash
# Check that lenses are registered for all version pairs
xnet migrate validate

# Output:
# ✓ Task: 1.0.0 → 2.0.0 (lens registered)
# ✓ Task: 2.0.0 → 3.0.0 (lens registered)
# ✗ Contact: 1.0.0 → 2.0.0 (no lens!)
```

### Dry Run Migration

```bash
# Preview what would happen
xnet migrate dry-run --schema Task --to 3.0.0

# Output:
# Would migrate 1,234 nodes
# - 500 from v1.0.0
# - 734 from v2.0.0
# Estimated time: 2.3s
```

## Best Practices

### 1. Always Provide Defaults

When adding fields, always provide sensible defaults in the `up` transform:

```typescript
// Good
up: (node) => ({ ...node, priority: node.priority ?? 'medium' })

// Bad - leaves field undefined
up: (node) => ({ ...node, priority: node.priority })
```

### 2. Make Down Transforms Lossy-Safe

The `down` transform may lose information. That's okay - document what's lost:

```typescript
const lens: SchemaLens = createLens({
  from: '1.0.0',
  to: '2.0.0',
  // Lossy: priority information is lost when downgrading
  down: (node) => {
    const { priority, ...rest } = node
    return rest
  }
})
```

### 3. Test Both Directions

```typescript
import { describe, it, expect } from 'vitest'

describe('Task v1 → v2 lens', () => {
  it('upgrades correctly', () => {
    const v1 = { title: 'Test' }
    const v2 = lens.up(v1)
    expect(v2.priority).toBe('medium')
  })

  it('downgrades correctly', () => {
    const v2 = { title: 'Test', priority: 'high' }
    const v1 = lens.down(v2)
    expect(v1).not.toHaveProperty('priority')
  })

  it('round-trips without data loss for compatible fields', () => {
    const original = { title: 'Test' }
    const roundTripped = lens.down(lens.up(original))
    expect(roundTripped.title).toBe(original.title)
  })
})
```

### 4. Version Bumps Are Cheap

Don't be afraid to bump versions. Minor bumps for additive changes are low-risk:

```
1.0.0 → 1.1.0 → 1.2.0 → 1.3.0 → 2.0.0
        ↑        ↑        ↑        ↑
     add field  add field  add field  breaking
```

### 5. Keep Lenses Simple

Each lens should do one logical change. Chain multiple lenses for complex migrations:

```typescript
// Good: One concern per lens
registry.register('Task', addPriorityLens) // 1.0 → 1.1
registry.register('Task', addTagsLens) // 1.1 → 1.2
registry.register('Task', renameStatusLens) // 1.2 → 2.0

// Bad: Everything in one lens
registry.register('Task', megaMigrationLens) // 1.0 → 2.0
```

## Troubleshooting

### Migration Fails

```bash
# Check for data that doesn't match expected shape
xnet doctor --schema Task

# Repair invalid data
xnet repair --schema Task --dry-run
xnet repair --schema Task
```

### Performance Issues

```typescript
// Use streaming for large datasets
const stream = store.streamWithMigration({
  type: 'Task',
  targetVersion: '3.0.0',
  batchSize: 100
})

for await (const batch of stream) {
  await processBatch(batch)
}
```

### Debugging Lenses

```typescript
import { LensRegistry } from '@xnetjs/data'

const registry = new LensRegistry({
  debug: true // Logs all transformations
})
```

## Next Steps

- [Version Compatibility Matrix](./02-version-compatibility.md) - What versions work together
- [Lens Cookbook](./03-lens-cookbook.md) - Common migration patterns
- [Recovery Procedures](./05-recovery-procedures.md) - When things go wrong
