# Recovery Procedures

What to do when things go wrong with data sync, migrations, or integrity.

## Quick Reference

| Problem            | Command       | Description       |
| ------------------ | ------------- | ----------------- |
| Check data health  | `xnet doctor` | Diagnose issues   |
| Fix corrupted data | `xnet repair` | Automatic repair  |
| Export data        | `xnet export` | Backup to JSON    |
| Import data        | `xnet import` | Restore from JSON |
| Rollback migration | See below     | Manual recovery   |

## Diagnosing Issues

### xnet doctor

Run diagnostics on your data:

```bash
# Full diagnostic
xnet doctor

# Check specific schema
xnet doctor --schema Task

# Output JSON for scripting
xnet doctor --json

# Fail CI if issues found
xnet doctor --fail-on-warning
```

#### Sample Output

```
xnet doctor - Data Integrity Check
==================================

Checking nodes...
  ✓ 1,234 nodes checked
  ✓ All hashes valid
  ⚠ 3 nodes have unknown schema types

Checking change log...
  ✓ 5,678 changes checked
  ✓ Hash chain valid
  ⚠ 12 changes have future protocol versions

Checking migrations...
  ✓ All required lenses registered
  ⚠ 45 nodes need migration to current version

Summary:
  Errors: 0
  Warnings: 60
  Status: HEALTHY (with warnings)

Run 'xnet repair --dry-run' to see fixable issues.
```

### Programmatic Diagnosis

```typescript
import { verifyIntegrity } from '@xnet/sync'

const result = await verifyIntegrity(storage, {
  checkHashes: true,
  checkSignatures: true,
  checkChain: true,
  checkSchemas: true
})

if (!result.valid) {
  console.error('Integrity issues found:')
  result.errors.forEach((err) => {
    console.error(`  ${err.type}: ${err.message}`)
    console.error(`    Node: ${err.nodeId}`)
  })
}
```

## Automatic Repair

### xnet repair

Attempt automatic fixes:

```bash
# Preview what would be fixed
xnet repair --dry-run

# Apply fixes
xnet repair

# Fix specific issues
xnet repair --fix hash-mismatch
xnet repair --fix orphaned-nodes
xnet repair --fix broken-refs
```

#### Fixable Issues

| Issue             | Fix Applied               |
| ----------------- | ------------------------- |
| `hash-mismatch`   | Recompute and update hash |
| `orphaned-nodes`  | Link to root or delete    |
| `broken-refs`     | Remove invalid references |
| `missing-version` | Add default version       |
| `duplicate-ids`   | Merge or rename           |

#### Non-Fixable Issues

These require manual intervention:

- Signature verification failures
- Missing required fields
- Corrupt binary data
- Chain gaps in change log

### Programmatic Repair

```typescript
import { attemptRepair } from '@xnet/sync'

const result = await attemptRepair(storage, {
  dryRun: false,
  fixes: ['hash-mismatch', 'missing-version']
})

console.log(`Fixed ${result.fixed} issues`)
console.log(`Skipped ${result.skipped} issues`)
result.failures.forEach((f) => {
  console.error(`Failed to fix: ${f.message}`)
})
```

## Data Export

### Full Export

```bash
# Export all data to JSON
xnet export --output backup.json

# Export specific schemas
xnet export --schema Task --schema Project --output tasks.json

# Export with change history
xnet export --include-changes --output full-backup.json

# Compress output
xnet export --output backup.json.gz
```

### Export Format

```json
{
  "version": "1.0.0",
  "exportedAt": "2024-12-01T10:00:00Z",
  "schemas": [
    { "@id": "xnet://example.com/Task", "version": "2.0.0", ... }
  ],
  "nodes": [
    { "@id": "node-123", "@type": "xnet://example.com/Task", ... }
  ],
  "changes": [
    { "id": "change-1", "type": "create", ... }
  ]
}
```

### Programmatic Export

```typescript
import { exportData } from '@xnet/sync'

const data = await exportData(storage, {
  schemas: ['Task', 'Project'],
  includeChanges: true,
  format: 'json'
})

await fs.writeFile('backup.json', JSON.stringify(data, null, 2))
```

## Data Import

### Full Import

```bash
# Import from backup
xnet import backup.json

# Preview what would be imported
xnet import backup.json --dry-run

# Merge with existing data (don't overwrite)
xnet import backup.json --merge

# Migrate during import
xnet import backup.json --migrate-to-current
```

### Conflict Resolution

```bash
# Keep existing data on conflict
xnet import backup.json --on-conflict keep

# Overwrite with imported data
xnet import backup.json --on-conflict overwrite

# Keep newer timestamp
xnet import backup.json --on-conflict newer

# Fail on any conflict
xnet import backup.json --on-conflict fail
```

### Programmatic Import

```typescript
import { importData } from '@xnet/sync'

const backup = JSON.parse(await fs.readFile('backup.json', 'utf-8'))

const result = await importData(storage, backup, {
  merge: true,
  migrateToCurrentVersion: true,
  onConflict: 'newer'
})

console.log(`Imported ${result.imported} nodes`)
console.log(`Skipped ${result.skipped} conflicts`)
```

## Migration Recovery

### Failed Migration

If a migration fails mid-way:

```bash
# 1. Check what happened
xnet doctor --schema Task

# 2. Export current state
xnet export --schema Task --output task-partial.json

# 3. Identify failed nodes
xnet doctor --schema Task --json | jq '.errors[] | select(.type == "migration_failed")'

# 4. Fix migration lens and retry
xnet repair --fix migration-errors
```

### Rollback Migration

xNet doesn't modify original data, so "rollback" means reading at old version:

```typescript
// Read at specific version
const task = await store.getWithMigration(taskId, {
  targetVersion: '1.0.0' // Previous version
})
```

### Force Re-migration

```bash
# Clear migration cache and re-run
xnet migrate --schema Task --force --to 2.0.0
```

## Sync Issues

### Stuck Sync

```bash
# Check sync status
xnet sync status

# Force full resync
xnet sync reset --peer hub.example.com

# Clear local pending queue
xnet sync clear-pending
```

### Conflict Resolution

```typescript
import { useConflicts } from '@xnet/react'

function ConflictResolver() {
  const { conflicts, resolve } = useConflicts()

  return conflicts.map(conflict => (
    <div key={conflict.nodeId}>
      <h3>Conflict on {conflict.nodeId}</h3>
      <button onClick={() => resolve(conflict, 'local')}>
        Keep Local
      </button>
      <button onClick={() => resolve(conflict, 'remote')}>
        Keep Remote
      </button>
      <button onClick={() => resolve(conflict, 'merge')}>
        Merge Both
      </button>
    </div>
  ))
}
```

### Network Partitions

When devices have been offline and have diverged:

```bash
# See divergence
xnet sync diff --peer other-device

# Merge changes
xnet sync merge --peer other-device --strategy last-write-wins

# Manual review
xnet sync merge --peer other-device --interactive
```

## Change Log Recovery

### Corrupted Change Log

```bash
# Verify chain integrity
xnet changes verify

# Rebuild from nodes (loses history)
xnet changes rebuild --from-nodes

# Import from peer
xnet changes sync --from-peer hub.example.com
```

### Missing Changes

```typescript
import { findMissingChanges, fetchMissingChanges } from '@xnet/sync'

// Find gaps
const missing = await findMissingChanges(storage)
console.log(`Missing ${missing.length} changes`)

// Fetch from hub
await fetchMissingChanges(syncProvider, missing)
```

## Emergency Procedures

### Complete Data Loss

1. **Don't panic** - Data exists on the Hub and other peers

2. **Clear local storage**:

   ```bash
   xnet storage clear --confirm
   ```

3. **Re-sync from Hub**:

   ```bash
   xnet sync full --from hub.example.com
   ```

4. **Verify integrity**:
   ```bash
   xnet doctor
   ```

### Corrupted Storage

1. **Export what you can**:

   ```bash
   xnet export --skip-errors --output partial-backup.json
   ```

2. **Clear and restore**:

   ```bash
   xnet storage clear --confirm
   xnet import partial-backup.json
   ```

3. **Sync missing data**:
   ```bash
   xnet sync full --from hub.example.com
   ```

### Security Incident

If you suspect unauthorized access:

1. **Rotate keys**:

   ```bash
   xnet identity rotate --confirm
   ```

2. **Revoke old sessions**:

   ```bash
   xnet sessions revoke --all-except-current
   ```

3. **Audit changes**:

   ```bash
   xnet changes audit --since "2024-01-01"
   ```

4. **Report to Hub admin** if using hosted Hub

## Monitoring

### Integrity Monitor

Enable continuous monitoring:

```typescript
import { createIntegrityMonitor } from '@xnet/sync'

const monitor = createIntegrityMonitor(storage, {
  interval: 60 * 60 * 1000, // Check hourly
  onIssue: (issue) => {
    alertOps(`Integrity issue: ${issue.type}`)
  }
})

monitor.start()
```

### Health Metrics

```typescript
import { getHealthMetrics } from '@xnet/sync'

const metrics = await getHealthMetrics(storage)

// Export to monitoring system
prometheus.gauge('xnet_nodes_total', metrics.nodeCount)
prometheus.gauge('xnet_changes_total', metrics.changeCount)
prometheus.gauge('xnet_integrity_errors', metrics.errorCount)
prometheus.gauge('xnet_pending_sync', metrics.pendingSyncCount)
```

## Getting Help

### Debug Logging

```bash
# Enable verbose logging
export XNET_DEBUG=sync,storage,integrity

# Or in browser
localStorage.setItem('xnet:debug', 'sync,storage,integrity')
```

### Support Resources

- **GitHub Issues**: [github.com/xnet/xnet/issues](https://github.com/xnet/xnet/issues)
- **Discord**: #support channel
- **Documentation**: [xnet.fyi/docs](https://xnet.fyi/docs)

### Collecting Diagnostics

```bash
# Generate diagnostic report
xnet support-bundle --output diagnostics.zip

# Includes:
# - Doctor output (no private data)
# - Configuration (redacted)
# - Error logs (last 24h)
# - Version info
```

## See Also

- [Migration Guide](./01-migration-guide.md) - Prevent issues with proper migrations
- [Version Compatibility](./02-version-compatibility.md) - Understand compatibility
- [CI Integration](./06-ci-integration.md) - Catch issues before production
