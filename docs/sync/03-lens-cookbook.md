# Lens Cookbook

Common migration patterns for schema evolution in xNet.

## Basic Patterns

### Add Optional Field

The most common migration - adding a new optional field with a default value.

```typescript
import { createLens } from '@xnetjs/data'

// Task v1 → v2: Add priority field
const addPriority = createLens({
  from: '1.0.0',
  to: '1.1.0',
  up: (node) => ({
    ...node,
    priority: node.priority ?? 'medium'
  }),
  down: (node) => {
    const { priority, ...rest } = node
    return rest
  }
})
```

### Add Required Field (with default)

Adding a "required" field is the same as optional - just ensure the default is always valid.

```typescript
// Contact v1 → v2: Add required email field
const addEmail = createLens({
  from: '1.0.0',
  to: '2.0.0',
  up: (node) => ({
    ...node,
    // Generate placeholder email from name
    email: node.email ?? `${slugify(node.name)}@unknown.local`
  }),
  down: (node) => {
    const { email, ...rest } = node
    return rest
  }
})

function slugify(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '.')
}
```

### Remove Field

Removing a field is safe - old clients will just see undefined.

```typescript
// User v2 → v3: Remove deprecated 'avatar_url' (use 'avatar' object instead)
const removeAvatarUrl = createLens({
  from: '2.0.0',
  to: '3.0.0',
  up: (node) => {
    const { avatar_url, ...rest } = node
    return rest
  },
  down: (node) => ({
    ...node,
    // Reconstruct from new format
    avatar_url: node.avatar?.url ?? null
  })
})
```

### Rename Field

```typescript
// Task v1 → v2: Rename 'due_date' to 'dueDate' (camelCase)
const renameDueDate = createLens({
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

## Type Changes

### String to Enum

```typescript
// Task v1 → v2: status from freeform string to enum
const statusToEnum = createLens({
  from: '1.0.0',
  to: '2.0.0',
  up: (node) => ({
    ...node,
    status: normalizeStatus(node.status)
  }),
  down: (node) => ({
    ...node,
    status: node.status // Enum value is already a string
  })
})

function normalizeStatus(status: string): 'todo' | 'doing' | 'done' {
  const normalized = status?.toLowerCase().trim()
  if (normalized === 'done' || normalized === 'complete' || normalized === 'finished') {
    return 'done'
  }
  if (normalized === 'doing' || normalized === 'in progress' || normalized === 'wip') {
    return 'doing'
  }
  return 'todo'
}
```

### Number to String

```typescript
// Product v1 → v2: price from number to formatted string
const priceToString = createLens({
  from: '1.0.0',
  to: '2.0.0',
  up: (node) => ({
    ...node,
    price: typeof node.price === 'number' ? `$${node.price.toFixed(2)}` : node.price
  }),
  down: (node) => ({
    ...node,
    price: parsePrice(node.price)
  })
})

function parsePrice(price: string | number): number {
  if (typeof price === 'number') return price
  return parseFloat(price.replace(/[^0-9.-]/g, '')) || 0
}
```

### String to Object

```typescript
// Contact v1 → v2: address from string to structured object
const addressToObject = createLens({
  from: '1.0.0',
  to: '2.0.0',
  up: (node) => ({
    ...node,
    address: typeof node.address === 'string' ? parseAddress(node.address) : node.address
  }),
  down: (node) => ({
    ...node,
    address: formatAddress(node.address)
  })
})

function parseAddress(address: string) {
  // Simple parsing - real implementation would be more sophisticated
  const lines = address.split('\n')
  return {
    street: lines[0] || '',
    city: lines[1]?.split(',')[0]?.trim() || '',
    state: lines[1]?.split(',')[1]?.trim() || '',
    zip: lines[2] || ''
  }
}

function formatAddress(address: { street: string; city: string; state: string; zip: string }) {
  return `${address.street}\n${address.city}, ${address.state}\n${address.zip}`
}
```

## Structural Changes

### Split Field

```typescript
// User v1 → v2: Split 'name' into 'firstName' and 'lastName'
const splitName = createLens({
  from: '1.0.0',
  to: '2.0.0',
  up: (node) => {
    const { name, ...rest } = node
    const parts = (name || '').trim().split(/\s+/)
    return {
      ...rest,
      firstName: parts[0] || '',
      lastName: parts.slice(1).join(' ') || ''
    }
  },
  down: (node) => {
    const { firstName, lastName, ...rest } = node
    return {
      ...rest,
      name: `${firstName || ''} ${lastName || ''}`.trim()
    }
  }
})
```

### Merge Fields

```typescript
// Contact v1 → v2: Merge separate address fields into object
const mergeAddress = createLens({
  from: '1.0.0',
  to: '2.0.0',
  up: (node) => {
    const { street, city, state, zip, country, ...rest } = node
    return {
      ...rest,
      address: { street, city, state, zip, country }
    }
  },
  down: (node) => {
    const { address, ...rest } = node
    return {
      ...rest,
      street: address?.street,
      city: address?.city,
      state: address?.state,
      zip: address?.zip,
      country: address?.country
    }
  }
})
```

### Nest Fields

```typescript
// Settings v1 → v2: Group notification settings under 'notifications' key
const nestNotifications = createLens({
  from: '1.0.0',
  to: '2.0.0',
  up: (node) => {
    const { email_notifications, push_notifications, notification_frequency, ...rest } = node
    return {
      ...rest,
      notifications: {
        email: email_notifications,
        push: push_notifications,
        frequency: notification_frequency
      }
    }
  },
  down: (node) => {
    const { notifications, ...rest } = node
    return {
      ...rest,
      email_notifications: notifications?.email,
      push_notifications: notifications?.push,
      notification_frequency: notifications?.frequency
    }
  }
})
```

### Flatten Object

```typescript
// User v2 → v3: Flatten 'preferences' object to top-level fields
const flattenPreferences = createLens({
  from: '2.0.0',
  to: '3.0.0',
  up: (node) => {
    const { preferences, ...rest } = node
    return {
      ...rest,
      theme: preferences?.theme ?? 'system',
      language: preferences?.language ?? 'en',
      timezone: preferences?.timezone ?? 'UTC'
    }
  },
  down: (node) => {
    const { theme, language, timezone, ...rest } = node
    return {
      ...rest,
      preferences: { theme, language, timezone }
    }
  }
})
```

## Array Operations

### Add Item to Array

```typescript
// Task v1 → v2: Ensure 'tags' array exists
const addTagsArray = createLens({
  from: '1.0.0',
  to: '1.1.0',
  up: (node) => ({
    ...node,
    tags: node.tags ?? []
  }),
  down: (node) => {
    // Only remove if empty (preserve user data)
    if (!node.tags?.length) {
      const { tags, ...rest } = node
      return rest
    }
    return node
  }
})
```

### Transform Array Items

```typescript
// Project v1 → v2: Transform member IDs to member objects
const memberIdsToObjects = createLens({
  from: '1.0.0',
  to: '2.0.0',
  up: (node) => ({
    ...node,
    members: (node.members || []).map((member: string | object) =>
      typeof member === 'string' ? { id: member, role: 'member', joinedAt: null } : member
    )
  }),
  down: (node) => ({
    ...node,
    members: (node.members || []).map((member: { id: string }) => member.id)
  })
})
```

### Change Array to Single Value

```typescript
// Document v1 → v2: Change 'authors' array to single 'author'
const authorsToAuthor = createLens({
  from: '1.0.0',
  to: '2.0.0',
  up: (node) => {
    const { authors, ...rest } = node
    return {
      ...rest,
      author: authors?.[0] ?? null, // Take first author
      contributors: authors?.slice(1) ?? [] // Rest become contributors
    }
  },
  down: (node) => {
    const { author, contributors, ...rest } = node
    return {
      ...rest,
      authors: [author, ...(contributors || [])].filter(Boolean)
    }
  }
})
```

## Computed Values

### Derive Field from Others

```typescript
// Task v1 → v2: Add computed 'slug' from title
const addSlug = createLens({
  from: '1.0.0',
  to: '1.1.0',
  up: (node) => ({
    ...node,
    slug: node.slug ?? generateSlug(node.title)
  }),
  down: (node) => {
    const { slug, ...rest } = node
    return rest
  }
})

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}
```

### Add Timestamp

```typescript
// Node v1 → v2: Add 'migratedAt' timestamp
const addMigratedAt = createLens({
  from: '1.0.0',
  to: '1.1.0',
  up: (node) => ({
    ...node,
    migratedAt: node.migratedAt ?? new Date().toISOString()
  }),
  down: (node) => {
    const { migratedAt, ...rest } = node
    return rest
  }
})
```

## Conditional Migrations

### Based on Field Value

```typescript
// Task v1 → v2: Different handling based on type
const conditionalMigration = createLens({
  from: '1.0.0',
  to: '2.0.0',
  up: (node) => {
    if (node.type === 'recurring') {
      return {
        ...node,
        schedule: node.schedule ?? { frequency: 'weekly', day: 1 }
      }
    }
    return {
      ...node,
      schedule: null
    }
  },
  down: (node) => {
    const { schedule, ...rest } = node
    return rest
  }
})
```

### Based on Field Existence

```typescript
// User v1 → v2: Handle legacy 'isAdmin' flag
const migrateAdminFlag = createLens({
  from: '1.0.0',
  to: '2.0.0',
  up: (node) => {
    const { isAdmin, ...rest } = node
    return {
      ...rest,
      role: node.role ?? (isAdmin ? 'admin' : 'user')
    }
  },
  down: (node) => ({
    ...node,
    isAdmin: node.role === 'admin'
  })
})
```

## Multi-Step Migrations

### Chain of Small Changes

Instead of one complex migration, chain simple ones:

```typescript
// Task v1 → v4 via multiple steps
const v1ToV2 = createLens({
  from: '1.0.0',
  to: '2.0.0',
  up: (node) => ({ ...node, priority: 'medium' }),
  down: (node) => {
    const { priority, ...rest } = node
    return rest
  }
})

const v2ToV3 = createLens({
  from: '2.0.0',
  to: '3.0.0',
  up: (node) => {
    const { due_date, ...rest } = node
    return { ...rest, dueDate: due_date }
  },
  down: (node) => {
    const { dueDate, ...rest } = node
    return { ...rest, due_date: dueDate }
  }
})

const v3ToV4 = createLens({
  from: '3.0.0',
  to: '4.0.0',
  up: (node) => ({ ...node, tags: node.tags ?? [] }),
  down: (node) => {
    const { tags, ...rest } = node
    return rest
  }
})

// Register all
registry.register('Task', v1ToV2)
registry.register('Task', v2ToV3)
registry.register('Task', v3ToV4)

// Automatic chaining: v1 → v4 works automatically
```

## Error Handling

### Safe Transforms

Always handle edge cases:

```typescript
const safeMigration = createLens({
  from: '1.0.0',
  to: '2.0.0',
  up: (node) => {
    try {
      return {
        ...node,
        parsedData: JSON.parse(node.jsonString || '{}')
      }
    } catch {
      // Invalid JSON - provide default
      return {
        ...node,
        parsedData: {},
        _migrationError: 'Failed to parse jsonString'
      }
    }
  },
  down: (node) => {
    const { parsedData, _migrationError, ...rest } = node
    return {
      ...rest,
      jsonString: JSON.stringify(parsedData || {})
    }
  }
})
```

### Validation

```typescript
const validatingMigration = createLens({
  from: '1.0.0',
  to: '2.0.0',
  up: (node) => {
    const email = node.email?.trim().toLowerCase()
    const isValid = email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

    return {
      ...node,
      email: isValid ? email : null,
      emailValid: isValid
    }
  },
  down: (node) => {
    const { emailValid, ...rest } = node
    return rest
  }
})
```

## Testing Patterns

### Round-Trip Test

```typescript
import { describe, it, expect } from 'vitest'

describe('lens round-trip', () => {
  it('preserves data through up/down cycle', () => {
    const original = {
      title: 'Test Task',
      description: 'A test'
    }

    const upgraded = lens.up(original)
    const downgraded = lens.down(upgraded)

    // Original fields should be unchanged
    expect(downgraded.title).toBe(original.title)
    expect(downgraded.description).toBe(original.description)
  })
})
```

### Edge Case Tests

```typescript
describe('lens edge cases', () => {
  it('handles null values', () => {
    const result = lens.up({ title: null })
    expect(result.title).toBeNull()
  })

  it('handles undefined values', () => {
    const result = lens.up({ title: undefined })
    expect(result.title).toBeUndefined()
  })

  it('handles empty objects', () => {
    const result = lens.up({})
    expect(result).toBeDefined()
  })

  it('handles malformed data', () => {
    const result = lens.up({ title: { nested: 'wrong type' } })
    // Should not throw
    expect(result).toBeDefined()
  })
})
```

## See Also

- [Migration Guide](./01-migration-guide.md) - Getting started with migrations
- [Version Compatibility](./02-version-compatibility.md) - Compatibility rules
- [Recovery Procedures](./05-recovery-procedures.md) - When migrations fail
