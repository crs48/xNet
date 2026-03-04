# CI Integration Guide

How to integrate xNet version compatibility checks into your CI/CD pipeline.

## Overview

Catch schema and version issues before they reach production:

1. **Schema Change Detection** - Alert on breaking changes
2. **Migration Validation** - Ensure lenses exist for all version pairs
3. **Deprecation Checks** - Fail on deprecated features
4. **Compatibility Testing** - Test with older client versions

## GitHub Actions

### Schema Check Workflow

This workflow runs on every PR to detect schema changes:

```yaml
# .github/workflows/schema-check.yml
name: Schema Check

on:
  pull_request:
    paths:
      - 'packages/data/src/schemas/**'
      - 'packages/*/src/**/*.ts'

jobs:
  schema-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0 # Need history for comparison

      - uses: pnpm/action-setup@v2
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      - run: pnpm install --frozen-lockfile

      - name: Extract schemas from base
        run: |
          git checkout ${{ github.base_ref }}
          pnpm xnet schema extract --output schemas-base/
          git checkout ${{ github.head_ref }}

      - name: Extract schemas from head
        run: pnpm xnet schema extract --output schemas-head/

      - name: Compare schemas
        id: diff
        run: |
          pnpm xnet schema diff schemas-base/ schemas-head/ --json > schema-diff.json
          cat schema-diff.json

      - name: Check for breaking changes
        run: |
          BREAKING=$(jq '.breaking | length' schema-diff.json)
          if [ "$BREAKING" -gt 0 ]; then
            echo "::error::Breaking schema changes detected!"
            jq '.breaking[]' schema-diff.json
            exit 1
          fi

      - name: Comment on PR
        if: always()
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const diff = JSON.parse(fs.readFileSync('schema-diff.json', 'utf-8'));

            if (diff.changes.length === 0) {
              return; // No changes, no comment needed
            }

            let body = '## Schema Changes\n\n';

            if (diff.breaking.length > 0) {
              body += '### Breaking Changes\n\n';
              diff.breaking.forEach(c => {
                body += `- **${c.schema}**: ${c.description}\n`;
              });
              body += '\n';
            }

            if (diff.compatible.length > 0) {
              body += '### Compatible Changes\n\n';
              diff.compatible.forEach(c => {
                body += `- **${c.schema}**: ${c.description}\n`;
              });
            }

            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: body
            });
```

### Migration Validation

Ensure all schema versions have migration lenses:

```yaml
# .github/workflows/migration-check.yml
name: Migration Check

on:
  push:
    branches: [main]
  pull_request:
    paths:
      - 'packages/data/src/schemas/**'
      - 'packages/data/src/schema/lens*.ts'

jobs:
  validate-migrations:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      - run: pnpm install --frozen-lockfile

      - name: Validate migration paths
        run: pnpm xnet migrate validate --fail-on-missing

      - name: Test migrations
        run: pnpm --filter @xnetjs/data test -- --grep "lens"
```

### Deprecation Check

Fail builds that use deprecated features:

```yaml
# .github/workflows/deprecation-check.yml
name: Deprecation Check

on:
  push:
    branches: [main]
  pull_request:

jobs:
  check-deprecations:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      - run: pnpm install --frozen-lockfile

      - name: Check for deprecations
        run: pnpm xnet doctor --fail-on-deprecation

      - name: Check deprecation deadlines
        run: |
          URGENT=$(pnpm xnet doctor --json | jq '[.deprecations[] | select(.daysUntilDeadline < 30)] | length')
          if [ "$URGENT" -gt 0 ]; then
            echo "::warning::Deprecation deadline approaching within 30 days!"
          fi
```

### Full CI Workflow

Combined workflow for comprehensive checks:

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm test
      - run: pnpm lint

  version-compatibility:
    runs-on: ubuntu-latest
    needs: test
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      - run: pnpm install --frozen-lockfile

      # Schema checks
      - name: Extract and compare schemas
        run: |
          pnpm xnet schema extract --output schemas/
          git stash
          git checkout main
          pnpm xnet schema extract --output schemas-main/
          git checkout -
          git stash pop || true
          pnpm xnet schema diff schemas-main/ schemas/ --fail-on-breaking || true

      # Migration checks
      - name: Validate migrations
        run: pnpm xnet migrate validate

      # Deprecation checks
      - name: Check deprecations
        run: pnpm xnet doctor --fail-on-deprecation

      # Integrity checks
      - name: Run integrity tests
        run: pnpm --filter @xnetjs/sync test -- --grep "integrity"
```

## Pre-commit Hooks

### Using Husky

```bash
# Install husky
pnpm add -D husky
pnpm husky install
```

```bash
# .husky/pre-commit
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

# Quick schema check
pnpm xnet schema extract --output .schema-cache/ --quiet

# Check for breaking changes against cached schemas
if [ -d ".schema-baseline" ]; then
  pnpm xnet schema diff .schema-baseline/ .schema-cache/ --fail-on-breaking
fi

# Deprecation check
pnpm xnet doctor --fail-on-deprecation --quiet
```

### Using lint-staged

```json
{
  "lint-staged": {
    "packages/data/src/schemas/**/*.ts": [
      "pnpm xnet schema extract --output .schema-cache/",
      "pnpm xnet schema diff .schema-baseline/ .schema-cache/ --fail-on-breaking"
    ],
    "**/*.ts": ["pnpm xnet doctor --fail-on-deprecation --quiet"]
  }
}
```

## Schema Baseline Management

### Creating a Baseline

After a release, save the current schemas as baseline:

```bash
# Save current schemas as baseline
pnpm xnet schema extract --output .schema-baseline/

# Commit the baseline
git add .schema-baseline/
git commit -m "chore: update schema baseline for v1.2.0"
```

### Automated Baseline Updates

```yaml
# .github/workflows/update-baseline.yml
name: Update Schema Baseline

on:
  release:
    types: [published]

jobs:
  update-baseline:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      - run: pnpm install --frozen-lockfile

      - name: Extract schemas
        run: pnpm xnet schema extract --output .schema-baseline/

      - name: Commit baseline
        run: |
          git config user.name github-actions
          git config user.email github-actions@github.com
          git add .schema-baseline/
          git commit -m "chore: update schema baseline for ${{ github.event.release.tag_name }}"
          git push
```

## Compatibility Matrix Testing

Test your app against multiple xNet versions:

```yaml
# .github/workflows/compat-matrix.yml
name: Compatibility Matrix

on:
  schedule:
    - cron: '0 0 * * 0' # Weekly
  workflow_dispatch:

jobs:
  test-compat:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        xnet-version: ['1.0.0', '1.1.0', '1.2.0', 'latest']

    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      - name: Install with specific xNet version
        run: |
          pnpm add @xnetjs/sync@${{ matrix.xnet-version }} \
                   @xnetjs/data@${{ matrix.xnet-version }} \
                   @xnetjs/react@${{ matrix.xnet-version }}

      - name: Run compatibility tests
        run: pnpm test:compat

      - name: Report results
        if: failure()
        uses: actions/github-script@v7
        with:
          script: |
            github.rest.issues.create({
              owner: context.repo.owner,
              repo: context.repo.repo,
              title: `Compatibility issue with xNet ${{ matrix.xnet-version }}`,
              body: `Compatibility tests failed for xNet version ${{ matrix.xnet-version }}.`,
              labels: ['bug', 'compatibility']
            });
```

## CLI Commands Reference

### xnet schema extract

```bash
# Extract all schemas to directory
xnet schema extract --output schemas/

# Extract specific schema
xnet schema extract --schema Task --output schemas/

# Output as single JSON file
xnet schema extract --format json --output schemas.json

# Quiet mode (no output on success)
xnet schema extract --quiet
```

### xnet schema diff

```bash
# Compare two directories
xnet schema diff schemas-v1/ schemas-v2/

# Compare specific schema
xnet schema diff schemas-v1/ schemas-v2/ --schema Task

# Output as JSON
xnet schema diff schemas-v1/ schemas-v2/ --json

# Fail on breaking changes
xnet schema diff schemas-v1/ schemas-v2/ --fail-on-breaking

# Exit codes:
# 0 - No changes or compatible changes only
# 1 - Breaking changes detected
# 2 - Error during comparison
```

### xnet migrate validate

```bash
# Validate all migrations
xnet migrate validate

# Validate specific schema
xnet migrate validate --schema Task

# Fail if missing migrations
xnet migrate validate --fail-on-missing

# Output as JSON
xnet migrate validate --json
```

### xnet doctor

```bash
# Run all checks
xnet doctor

# Check specific areas
xnet doctor --check schemas
xnet doctor --check migrations
xnet doctor --check deprecations

# Fail on issues
xnet doctor --fail-on-warning
xnet doctor --fail-on-deprecation

# Output as JSON
xnet doctor --json

# Quiet mode
xnet doctor --quiet
```

## Best Practices

### 1. Schema Changes in PRs

Always include schema changes in PRs, not as separate commits:

```
feat(data): add priority field to Task schema

- Add priority: select property
- Add v1.0.0 → v1.1.0 lens
- Update tests
```

### 2. Version Bumps

Bump schema versions explicitly:

```typescript
// Before
const TaskSchema = defineSchema({
  name: 'Task',
  version: '1.0.0' // Don't forget to bump!
  // ...
})

// After
const TaskSchema = defineSchema({
  name: 'Task',
  version: '1.1.0' // Bumped for new field
  // ...
})
```

### 3. Lens Coverage

Ensure 100% lens coverage:

```bash
# In CI
pnpm xnet migrate validate --fail-on-missing
```

### 4. Test Both Directions

Test upgrade and downgrade paths:

```typescript
describe('Task lens v1→v2', () => {
  it('upgrades correctly', () => {
    /* ... */
  })
  it('downgrades correctly', () => {
    /* ... */
  })
  it('round-trips without loss', () => {
    /* ... */
  })
})
```

### 5. Monitor in Production

Track version distribution:

```typescript
// Report metrics
analytics.track('schema_version', {
  schema: 'Task',
  version: task._version
})
```

## See Also

- [Migration Guide](./01-migration-guide.md) - How to create migrations
- [Deprecation Policy](./04-deprecation-policy.md) - Deprecation timelines
- [Recovery Procedures](./05-recovery-procedures.md) - When CI catches issues
