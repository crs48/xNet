# Version Compatibility Matrix

Reference for understanding which xNet versions work together.

## Protocol Version Compatibility

| Your Version | Peer Version | Behavior                                           |
| ------------ | ------------ | -------------------------------------------------- |
| v1           | v1           | Full compatibility                                 |
| v1           | v0 (legacy)  | Full backward compatibility                        |
| v1           | v2+          | Partial - unknown fields preserved, warning logged |
| v2           | v1           | Full - negotiates down to v1 features              |
| v2           | v2           | Full compatibility                                 |

## Schema Version Compatibility

### Automatic Compatibility

These schema changes are **automatically compatible** (no migration needed):

| Change                 | Old Client Reading New Data           | New Client Reading Old Data |
| ---------------------- | ------------------------------------- | --------------------------- |
| Add optional field     | Field ignored                         | Field missing (use default) |
| Add field with default | Field ignored                         | Field missing (use default) |
| Widen enum options     | Works (unknown option passed through) | Works                       |
| Add new property type  | Works (unknown type preserved)        | Works                       |

### Migration Required

These changes require a **lens migration**:

| Change                       | Why Migration Needed             |
| ---------------------------- | -------------------------------- |
| Remove field                 | Old clients expect field         |
| Rename field                 | Old clients look for old name    |
| Change field type            | Type mismatch                    |
| Narrow enum options          | Old data may have removed option |
| Make optional field required | Old data may not have field      |

## Feature Negotiation

When two peers connect, they negotiate a common feature set:

```
Client A (v1.2.0)          Client B (v1.0.0)
─────────────────          ─────────────────
Supports:                  Supports:
- yjs_sync                 - yjs_sync
- change_v2                - change_v1
- compression
- signatures

         ────── Negotiation ──────>

Common Features:
- yjs_sync
- change_v1  (downgraded)
```

### Feature Dependencies

Some features require others:

```
change_v2 ──requires──> signatures
compression ──requires──> (none)
yjs_sync ──requires──> (none)
signatures ──requires──> (none)
```

### Feature Flags

| Feature       | Description                                  | Since  |
| ------------- | -------------------------------------------- | ------ |
| `yjs_sync`    | Yjs CRDT synchronization                     | v1.0.0 |
| `change_v1`   | Basic change format                          | v1.0.0 |
| `change_v2`   | Extended change format with protocol version | v1.1.0 |
| `signatures`  | Ed25519 signed changes                       | v1.1.0 |
| `compression` | Compressed payloads                          | v1.2.0 |
| `integrity`   | Integrity verification                       | v1.3.0 |

## Package Version Matrix

Recommended package version combinations:

| @xnet/sync | @xnet/data | @xnet/react | @xnet/sdk | Notes            |
| ---------- | ---------- | ----------- | --------- | ---------------- |
| 1.0.x      | 1.0.x      | 1.0.x       | 1.0.x     | Initial release  |
| 1.1.x      | 1.1.x      | 1.0.x       | 1.1.x     | Added versioning |
| 1.2.x      | 1.2.x      | 1.1.x       | 1.2.x     | Added lenses     |
| 1.3.x      | 1.3.x      | 1.2.x       | 1.3.x     | Added integrity  |

### Compatibility Rules

1. **Minor version upgrades** are always backward compatible
2. **Patch versions** within a minor are interchangeable
3. **Major version upgrades** may require migration

## Hub Compatibility

### Hub Version vs Client Version

| Hub Version | Min Client Version | Max Client Version |
| ----------- | ------------------ | ------------------ |
| 1.0.x       | 1.0.0              | 1.x.x              |
| 2.0.x       | 1.0.0              | 2.x.x              |

The Hub maintains backward compatibility for at least one major version.

### Handshake Protocol

```typescript
// Client sends capabilities
{
  clientVersion: '1.2.0',
  protocolVersion: 1,
  features: ['yjs_sync', 'change_v2', 'signatures']
}

// Hub responds with negotiated features
{
  hubVersion: '1.3.0',
  protocolVersion: 1,
  features: ['yjs_sync', 'change_v2', 'signatures'],
  deprecated: ['change_v1']  // Will be removed in v2
}
```

## Graceful Degradation

When encountering unknown data:

### Unknown Schema Type

```typescript
// Node with unknown schema type
const node = {
  '@type': 'xnet://example.com/FutureType',
  title: 'Something new',
  unknownField: { complex: 'data' }
}

// Old client behavior:
// - Stores node as-is
// - Can display raw data
// - Preserves unknown fields on save
```

### Unknown Property Type

```typescript
// Property with future type
const property = {
  name: 'location',
  type: 'geo-polygon',  // Unknown type
  value: { points: [...] }
}

// Old client behavior:
// - Preserves value
// - Displays as JSON in UI
// - Round-trips correctly
```

### Unknown Change Type

```typescript
// Change with unknown type
const change = {
  type: 'future-operation',
  payload: { ... }
}

// Old client behavior:
// - Logs warning
// - Stores in change log
// - Does not apply (no handler)
// - Syncs to other peers
```

## Deprecation Timeline

| Feature            | Deprecated | Removed | Migration Path  |
| ------------------ | ---------- | ------- | --------------- |
| `change_v1`        | v1.1.0     | v2.0.0  | Use `change_v2` |
| `unsigned_changes` | v1.1.0     | v2.0.0  | Add signatures  |

### Deprecation Warnings

```typescript
import { checkDeprecations } from '@xnet/sync'

const warnings = checkDeprecations({
  protocolVersion: 0,
  features: ['change_v1']
})

// warnings = [
//   { feature: 'change_v1', deadline: '2025-06-01', replacement: 'change_v2' }
// ]
```

## Testing Compatibility

### Multi-Version Testing

```bash
# Test with older client version
npm install @xnet/sync@1.0.0 --save-dev

# Run compatibility tests
pnpm test:compat
```

### Compatibility Test Pattern

```typescript
import { describe, it } from 'vitest'

describe('v1.0 compatibility', () => {
  it('reads v1.0 data correctly', async () => {
    const oldData = loadFixture('v1.0/task.json')
    const node = await store.getWithMigration(oldData.id, {
      targetVersion: CURRENT_VERSION
    })
    expect(node.title).toBe(oldData.title)
  })

  it('writes data readable by v1.0', async () => {
    await store.set(newTask)
    const raw = await storage.get(newTask.id)
    // Verify no v1.1+ only features in raw data
    expect(raw.protocolVersion).toBeUndefined()
  })
})
```

## Monitoring Compatibility

### DevTools Version Panel

The Version DevTools panel shows:

- Current protocol version
- Connected peer versions
- Feature negotiation results
- Deprecation warnings

### Metrics

```typescript
// Track version distribution
syncProvider.on('peer:connected', (peer) => {
  analytics.track('peer_version', {
    version: peer.protocolVersion,
    features: peer.features
  })
})
```

## See Also

- [Migration Guide](./01-migration-guide.md) - How to evolve schemas
- [Deprecation Policy](./04-deprecation-policy.md) - Support timelines
- [Recovery Procedures](./05-recovery-procedures.md) - When things go wrong
