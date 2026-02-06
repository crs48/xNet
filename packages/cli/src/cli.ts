#!/usr/bin/env node
/**
 * xNet CLI - Schema migrations, diagnostics, and development tools.
 *
 * @example
 * ```bash
 * # Analyze schema changes
 * xnet migrate analyze --from Task@1.0.0 --to Task@2.0.0
 *
 * # Generate lens code
 * xnet migrate generate --from Task@1.0.0 --to Task@2.0.0 -o migrations/task-v1-v2.ts
 *
 * # Dry-run migration
 * xnet migrate run --from Task@1.0.0 --to Task@2.0.0 --dry-run
 *
 * # Apply migration
 * xnet migrate run --from Task@1.0.0 --to Task@2.0.0 --apply
 * ```
 */

import { program } from 'commander'
import { registerMigrateCommand } from './commands/migrate.js'
import { registerSchemaCommand } from './commands/schema.js'

program
  .name('xnet')
  .description('xNet CLI - Schema migrations, diagnostics, and development tools')
  .version('0.0.1')

// Register commands
registerMigrateCommand(program)
registerSchemaCommand(program)

// Parse and run
program.parse()
