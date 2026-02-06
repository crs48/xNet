# Sync Documentation

Documentation for xNet's sync system, versioning, and data migration.

## Guides

| Document                                               | Description                          |
| ------------------------------------------------------ | ------------------------------------ |
| [Migration Guide](./01-migration-guide.md)             | How to safely evolve schemas         |
| [Version Compatibility](./02-version-compatibility.md) | What versions work together          |
| [Lens Cookbook](./03-lens-cookbook.md)                 | Common migration patterns            |
| [Deprecation Policy](./04-deprecation-policy.md)       | Support timelines and sunset process |
| [Recovery Procedures](./05-recovery-procedures.md)     | When things go wrong                 |
| [CI Integration](./06-ci-integration.md)               | Catch issues before production       |

## Quick Start

### Schema Versioning

Every schema should have a version:

```typescript
import { defineSchema } from '@xnet/data'

const TaskSchema = defineSchema({
  name: 'Task',
  version: '1.0.0',
  properties: {
    title: { type: 'text' }
  }
})
```

### Creating a Migration

When changing a schema, create a lens:

```typescript
import { createLens, LensRegistry } from '@xnet/data'

const v1ToV2 = createLens({
  from: '1.0.0',
  to: '2.0.0',
  up: (node) => ({ ...node, priority: 'medium' }),
  down: (node) => {
    const { priority, ...rest } = node
    return rest
  }
})

const registry = new LensRegistry()
registry.register('Task', v1ToV2)
```

### Checking Health

```bash
# Diagnose issues
xnet doctor

# Fix what can be fixed
xnet repair

# Export backup
xnet export --output backup.json
```

## Key Concepts

### Protocol Versioning

The sync protocol is versioned separately from schemas:

- **Protocol version**: How peers communicate (wire format)
- **Schema version**: Data structure (application-level)

### Translate on Read

xNet uses "translate on read" migration:

- Data is stored in original format
- Migrations applied when reading
- No batch migrations needed
- Old clients can still read data

### Graceful Degradation

Unknown data is preserved:

- Unknown schemas pass through
- Unknown fields are kept
- Unknown property types stored as-is

## CLI Commands

| Command                 | Description             |
| ----------------------- | ----------------------- |
| `xnet schema extract`   | Export schemas to JSON  |
| `xnet schema diff`      | Compare schema versions |
| `xnet migrate validate` | Check all lenses exist  |
| `xnet doctor`           | Diagnose data issues    |
| `xnet repair`           | Fix data issues         |
| `xnet export`           | Export data to JSON     |
| `xnet import`           | Import data from JSON   |

## DevTools

The Version DevTools panel shows:

- Current protocol version
- Connected peer versions
- Feature negotiation results
- Deprecation warnings

## Related Packages

- `@xnet/sync` - Sync protocol, versioning, integrity
- `@xnet/data` - Schema system, migrations, lenses
- `@xnet/cli` - Command line tools
- `@xnet/devtools` - Version DevTools panel
