# @xnetjs/cli

CLI tools for schema migration workflows, schema diffing, and data integrity diagnostics.

## Installation

```bash
pnpm add -D @xnetjs/cli
```

## Usage

```bash
# Show commands
pnpm --filter @xnetjs/cli dev -- --help

# Analyze schema changes
pnpm --filter @xnetjs/cli dev -- migrate analyze --from Task@1.0.0 --to Task@2.0.0 --schema-file ./schemas.json

# Generate migration lens code
pnpm --filter @xnetjs/cli dev -- migrate generate --from Task@1.0.0 --to Task@2.0.0 -o ./migrations/task-v1-v2.ts

# Extract and diff schemas (CI-friendly)
pnpm --filter @xnetjs/cli dev -- schema extract --output schemas.json
pnpm --filter @xnetjs/cli dev -- schema diff schemas-main.json schemas-pr.json --fail-on-breaking

# Run integrity checks
pnpm --filter @xnetjs/cli dev -- doctor --quick
```

## Commands

- `migrate` -- Analyze schema deltas, generate lens code, and run migration flows
- `schema` -- Extract schemas and diff schema snapshots for CI gates
- `doctor` -- Run integrity checks, repair helpers, and import/export diagnostics

## Programmatic API

You can also use utilities directly:

```ts
import { diffSchemas, generateLensCode } from '@xnetjs/cli'
```

## Testing

```bash
pnpm --filter @xnetjs/cli test
```
