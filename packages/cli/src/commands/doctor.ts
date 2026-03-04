/**
 * Doctor Command - Diagnose data integrity and sync issues
 *
 * Commands:
 * - doctor: Run all health checks
 * - repair: Attempt automatic repair of issues
 * - export: Export all data to JSON format
 * - import: Import data from JSON with migrations
 */

import type { Change, IntegrityReport } from '@xnetjs/sync'
import { writeFileSync, readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { resolve, join } from 'node:path'
import {
  verifyIntegrity,
  quickIntegrityCheck,
  attemptRepair,
  findOrphans,
  findRoots,
  findHeads,
  getChainDepth
} from '@xnetjs/sync'
import { Command } from 'commander'

// ─── Types ───────────────────────────────────────────────────────────────────

interface DoctorOptions {
  dataDir?: string
  quick?: boolean
  json?: boolean
  verbose?: boolean
}

interface RepairOptions {
  dataDir?: string
  dryRun?: boolean
  json?: boolean
}

interface ExportOptions {
  output: string
  dataDir?: string
  format?: 'json' | 'jsonl'
  pretty?: boolean
}

interface ImportOptions {
  input: string
  dataDir?: string
  dryRun?: boolean
  applyMigrations?: boolean
}

// ─── Chalk fallback ──────────────────────────────────────────────────────────

interface Chalk {
  green: (s: string) => string
  yellow: (s: string) => string
  red: (s: string) => string
  blue: (s: string) => string
  gray: (s: string) => string
  cyan: (s: string) => string
  bold: (s: string) => string
  dim: (s: string) => string
}

async function getChalk(): Promise<Chalk> {
  try {
    const chalk = await import('chalk')
    return chalk.default as unknown as Chalk
  } catch {
    const identity = (s: string) => s
    return {
      green: identity,
      yellow: identity,
      red: identity,
      blue: identity,
      gray: identity,
      cyan: identity,
      bold: identity,
      dim: identity
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function findDataDir(providedDir?: string): string {
  if (providedDir) {
    const resolved = resolve(process.cwd(), providedDir)
    if (existsSync(resolved)) {
      return resolved
    }
    throw new Error(`Data directory not found: ${resolved}`)
  }

  // Try common locations
  const commonPaths = ['.xnet/data', 'data', '.data', resolve(process.env.HOME ?? '', '.xnet/data')]

  for (const path of commonPaths) {
    const resolved = resolve(process.cwd(), path)
    if (existsSync(resolved)) {
      return resolved
    }
  }

  throw new Error('Could not find data directory. Use --data-dir to specify location.')
}

function loadChangesFromDir(dataDir: string): Change<unknown>[] {
  const changes: Change<unknown>[] = []

  // Try to load from common file patterns
  const patterns = ['changes.json', 'changes/*.json', '*.changes.json']

  for (const pattern of patterns) {
    const changesFile = join(dataDir, pattern.split('/')[0])
    if (existsSync(changesFile) && statSync(changesFile).isFile()) {
      try {
        const content = readFileSync(changesFile, 'utf-8')
        const data = JSON.parse(content)
        if (Array.isArray(data)) {
          changes.push(...(data as Change<unknown>[]))
        } else if (data.changes && Array.isArray(data.changes)) {
          changes.push(...(data.changes as Change<unknown>[]))
        }
      } catch {
        // Skip files that can't be parsed
      }
    }
  }

  // Also check for individual change files in a 'changes' subdirectory
  const changesDir = join(dataDir, 'changes')
  if (existsSync(changesDir) && statSync(changesDir).isDirectory()) {
    const files = readdirSync(changesDir).filter((f) => f.endsWith('.json'))
    for (const file of files) {
      try {
        const content = readFileSync(join(changesDir, file), 'utf-8')
        const change = JSON.parse(content) as Change<unknown>
        changes.push(change)
      } catch {
        // Skip files that can't be parsed
      }
    }
  }

  return changes
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

// ─── Doctor Command ──────────────────────────────────────────────────────────

async function doctorCommand(options: DoctorOptions): Promise<void> {
  const chalk = await getChalk()

  console.log(chalk.bold('\nxNet Health Check\n'))
  console.log(chalk.dim('─'.repeat(50)))

  try {
    // Find data directory
    let dataDir: string
    let changes: Change<unknown>[] = []

    try {
      dataDir = findDataDir(options.dataDir)
      console.log(chalk.gray(`Data directory: ${dataDir}`))
      changes = loadChangesFromDir(dataDir)
      console.log(chalk.gray(`Found ${changes.length} changes`))
    } catch {
      console.log(chalk.yellow('\nNote: No data directory found.'))
      console.log(chalk.gray('Use --data-dir to specify a data directory.'))
      console.log(chalk.gray('Running with demo data...\n'))

      // Generate demo changes for testing
      changes = generateDemoChanges()
    }

    console.log()

    // Run integrity check
    console.log(chalk.bold('Checking data integrity...'))

    const report = options.quick
      ? await quickIntegrityCheck(changes)
      : await verifyIntegrity(changes)

    if (options.json) {
      console.log(JSON.stringify(report, null, 2))
      return
    }

    // Print results
    printIntegrityResults(report, chalk, options.verbose)

    // Chain analysis
    console.log()
    console.log(chalk.bold('Analyzing change chains...'))

    const orphans = findOrphans(changes)
    const roots = findRoots(changes)
    const heads = findHeads(changes)
    const depth = getChainDepth(changes)

    console.log(`  ${chalk.green('✓')} Roots: ${roots.length}`)
    console.log(`  ${chalk.green('✓')} Heads: ${heads.length}`)
    console.log(`  ${chalk.green('✓')} Depth: ${depth}`)

    if (orphans.length > 0) {
      console.log(`  ${chalk.yellow('⚠')} Orphans: ${orphans.length}`)
    } else {
      console.log(`  ${chalk.green('✓')} Orphans: 0`)
    }

    // Schema check (placeholder)
    console.log()
    console.log(chalk.bold('Checking schema compatibility...'))
    console.log(chalk.gray('  (Schema analysis requires @xnetjs/data integration)'))

    // Sync state (placeholder)
    console.log()
    console.log(chalk.bold('Checking sync state...'))
    console.log(chalk.gray('  (Sync analysis requires active SyncProvider)'))

    // Overall status
    console.log()
    console.log(chalk.dim('─'.repeat(50)))

    const hasErrors = report.summary.errors > 0
    const hasWarnings = report.summary.warnings > 0 || orphans.length > 0

    if (hasErrors) {
      console.log(chalk.red(chalk.bold('Status: UNHEALTHY')))
      console.log(chalk.red('  Data integrity issues detected. Run `xnet repair` to fix.'))
    } else if (hasWarnings) {
      console.log(chalk.yellow(chalk.bold('Status: HEALTHY with warnings')))
      console.log(chalk.gray('  Some issues detected but data is intact.'))
    } else {
      console.log(chalk.green(chalk.bold('Status: HEALTHY')))
      console.log(chalk.green('  All checks passed.'))
    }

    console.log()
  } catch (error) {
    console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`))
    process.exit(1)
  }
}

function printIntegrityResults(report: IntegrityReport, chalk: Chalk, verbose?: boolean): void {
  const { checked, valid, issues, summary, durationMs } = report

  const percentage = checked > 0 ? Math.round((valid / checked) * 100) : 100

  if (issues.length === 0) {
    console.log(`  ${chalk.green('✓')} ${checked} changes verified (${percentage}% valid)`)
    console.log(`  ${chalk.green('✓')} Hash chains intact`)
    console.log(`  ${chalk.green('✓')} No issues detected`)
    console.log(chalk.gray(`  Completed in ${formatDuration(durationMs)}`))
  } else {
    console.log(
      `  ${chalk.yellow('!')} ${checked} changes checked (${valid} valid, ${checked - valid} issues)`
    )

    if (summary.errors > 0) {
      console.log(`  ${chalk.red('✗')} ${summary.errors} errors`)
    }
    if (summary.warnings > 0) {
      console.log(`  ${chalk.yellow('⚠')} ${summary.warnings} warnings`)
    }

    console.log(chalk.gray(`  Completed in ${formatDuration(durationMs)}`))

    if (verbose) {
      console.log()
      console.log(chalk.bold('Issues by type:'))
      for (const [type, count] of Object.entries(summary.byType)) {
        if ((count as number) > 0) {
          console.log(`  - ${type}: ${count}`)
        }
      }

      console.log()
      console.log(chalk.bold('Details:'))
      for (const issue of issues.slice(0, 10)) {
        const icon = issue.severity === 'error' ? chalk.red('✗') : chalk.yellow('⚠')
        console.log(`  ${icon} [${issue.type}] ${issue.details}`)
        if (issue.repairAction) {
          console.log(chalk.gray(`      → ${issue.repairAction.description}`))
        }
      }

      if (issues.length > 10) {
        console.log(chalk.gray(`  ... and ${issues.length - 10} more`))
      }
    }

    if (report.repairable) {
      console.log()
      console.log(chalk.cyan(`  Run \`xnet repair\` to fix these issues.`))
    }
  }
}

function generateDemoChanges(): Change<unknown>[] {
  // Generate some demo changes for testing when no data directory is available
  const now = Date.now()
  const demoAuthor = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK' as const
  const demoHash1 =
    'cid:blake3:0000000000000000000000000000000000000000000000000000000000000001' as const
  const demoHash2 =
    'cid:blake3:0000000000000000000000000000000000000000000000000000000000000002' as const

  return [
    {
      id: 'change-1',
      protocolVersion: 1,
      type: 'create-node',
      payload: { schemaIRI: 'xnet://xnet.fyi/Task@1.0.0' },
      hash: demoHash1,
      parentHash: null,
      authorDID: demoAuthor,
      signature: new Uint8Array([1, 2, 3, 4]),
      wallTime: now - 10000,
      lamport: { time: 1, author: demoAuthor }
    },
    {
      id: 'change-2',
      protocolVersion: 1,
      type: 'update-node',
      payload: { nodeId: 'node-1', properties: { title: 'Demo Task' } },
      hash: demoHash2,
      parentHash: demoHash1,
      authorDID: demoAuthor,
      signature: new Uint8Array([5, 6, 7, 8]),
      wallTime: now - 5000,
      lamport: { time: 2, author: demoAuthor }
    }
  ]
}

// ─── Repair Command ──────────────────────────────────────────────────────────

async function repairCommand(options: RepairOptions): Promise<void> {
  const chalk = await getChalk()

  console.log(chalk.bold('\nxNet Data Repair\n'))

  try {
    // Find data directory
    let dataDir: string
    let changes: Change<unknown>[] = []

    try {
      dataDir = findDataDir(options.dataDir)
      changes = loadChangesFromDir(dataDir)
    } catch {
      console.log(chalk.yellow('Note: No data directory found.'))
      console.log(chalk.gray('Using demo data for illustration.\n'))
      dataDir = ''
      changes = generateDemoChanges()
    }

    // First, run integrity check
    console.log(chalk.gray('Running integrity check...'))
    const report = await verifyIntegrity(changes)

    if (report.issues.length === 0) {
      console.log(chalk.green('\n✓ No issues found. Nothing to repair.'))
      return
    }

    console.log(`\nFound ${report.issues.length} issues:`)
    console.log(`  - ${report.summary.errors} errors`)
    console.log(`  - ${report.summary.warnings} warnings`)
    console.log()

    if (options.dryRun) {
      console.log(chalk.yellow('DRY RUN - No changes will be made\n'))
    }

    // Attempt repair
    const { remainingIssues, repairCount } = await attemptRepair(changes, report.issues)

    if (options.json) {
      console.log(
        JSON.stringify(
          {
            original: changes.length,
            repaired: repairCount,
            remaining: remainingIssues.length,
            remainingIssues
          },
          null,
          2
        )
      )
      return
    }

    console.log(chalk.bold('Repair results:'))
    console.log(`  ${chalk.green('✓')} Repaired: ${repairCount} issues`)
    console.log(`  ${chalk.yellow('!')} Remaining: ${remainingIssues.length} issues`)

    if (remainingIssues.length > 0) {
      console.log()
      console.log(chalk.yellow('Issues that require manual intervention:'))
      for (const issue of remainingIssues.slice(0, 5)) {
        console.log(`  - [${issue.type}] ${issue.details}`)
      }
      if (remainingIssues.length > 5) {
        console.log(chalk.gray(`  ... and ${remainingIssues.length - 5} more`))
      }
    }

    if (!options.dryRun && dataDir && repairCount > 0) {
      // In a real implementation, we would write the repaired changes back
      console.log()
      console.log(chalk.gray('Note: Writing repaired changes requires NodeStore integration.'))
      console.log(chalk.gray('Changes are prepared but not written to disk.'))
    }

    console.log()
  } catch (error) {
    console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`))
    process.exit(1)
  }
}

// ─── Export Command ──────────────────────────────────────────────────────────

async function exportCommand(options: ExportOptions): Promise<void> {
  const chalk = await getChalk()

  console.log(chalk.bold('\nxNet Data Export\n'))

  try {
    // Find data directory
    let dataDir: string
    let changes: Change<unknown>[] = []

    try {
      dataDir = findDataDir(options.dataDir)
      changes = loadChangesFromDir(dataDir)
    } catch {
      console.log(chalk.yellow('Note: No data directory found.'))
      console.log(chalk.gray('Using demo data for illustration.\n'))
      dataDir = ''
      changes = generateDemoChanges()
    }

    const outputPath = resolve(process.cwd(), options.output)

    console.log(chalk.gray(`Source: ${dataDir || 'demo data'}`))
    console.log(chalk.gray(`Output: ${outputPath}`))
    console.log()

    // Build export data
    const exportData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      source: dataDir || 'demo',
      stats: {
        changes: changes.length,
        roots: findRoots(changes).length,
        heads: findHeads(changes).length,
        depth: getChainDepth(changes)
      },
      changes: changes.map((c) => ({
        ...c,
        // Convert Uint8Array to base64 for JSON serialization
        signature: Buffer.from(c.signature).toString('base64')
      }))
    }

    const content = options.pretty
      ? JSON.stringify(exportData, null, 2)
      : JSON.stringify(exportData)

    if (options.format === 'jsonl') {
      // Write each change on its own line
      const lines = exportData.changes.map((c) => JSON.stringify(c)).join('\n')
      writeFileSync(outputPath, lines, 'utf-8')
    } else {
      writeFileSync(outputPath, content, 'utf-8')
    }

    console.log(chalk.green(`✓ Exported ${changes.length} changes`))
    console.log(chalk.gray(`  File size: ${Math.round(content.length / 1024)}KB`))
    console.log()
  } catch (error) {
    console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`))
    process.exit(1)
  }
}

// ─── Import Command ──────────────────────────────────────────────────────────

async function importCommand(options: ImportOptions): Promise<void> {
  const chalk = await getChalk()

  console.log(chalk.bold('\nxNet Data Import\n'))

  try {
    const inputPath = resolve(process.cwd(), options.input)

    if (!existsSync(inputPath)) {
      console.error(chalk.red(`Error: Input file not found: ${inputPath}`))
      process.exit(1)
    }

    console.log(chalk.gray(`Input: ${inputPath}`))

    if (options.dryRun) {
      console.log(chalk.yellow('\nDRY RUN - No changes will be applied\n'))
    }

    // Read and parse input
    const content = readFileSync(inputPath, 'utf-8')
    let importData: {
      version?: number
      changes: Array<{
        id: string
        type: string
        payload: unknown
        hash: string
        parentHash: string | null
        authorDID: string
        signature: string
        wallTime: number
        lamport: { time: number; peerId: string }
        protocolVersion?: number
      }>
      stats?: { changes: number }
    }

    // Support both full export format and plain array
    try {
      const parsed = JSON.parse(content)
      if (Array.isArray(parsed)) {
        importData = { changes: parsed }
      } else {
        importData = parsed
      }
    } catch {
      // Try JSONL format
      const lines = content.split('\n').filter((l) => l.trim())
      importData = { changes: lines.map((l) => JSON.parse(l)) }
    }

    console.log(chalk.gray(`Found ${importData.changes.length} changes to import`))
    console.log()

    // Convert signatures back from base64 and cast to proper types
    // Note: We trust the import format matches our schema
    const changes = importData.changes.map((c) => ({
      ...c,
      signature:
        typeof c.signature === 'string'
          ? new Uint8Array(Buffer.from(c.signature, 'base64'))
          : c.signature
    })) as unknown as Change<unknown>[]

    // Verify integrity before importing
    console.log(chalk.bold('Verifying import data...'))
    const report = await quickIntegrityCheck(changes)

    if (report.issues.length > 0) {
      console.log(chalk.yellow(`  ⚠ ${report.issues.length} integrity issues found`))

      if (report.summary.errors > 0) {
        console.log(chalk.red(`  ${report.summary.errors} errors may prevent import`))
      }
    } else {
      console.log(chalk.green('  ✓ All changes verified'))
    }

    // Check for migrations
    if (options.applyMigrations) {
      console.log()
      console.log(chalk.bold('Checking for required migrations...'))
      console.log(chalk.gray('  (Migration detection requires schema registry)'))
    }

    // Import stats
    console.log()
    console.log(chalk.bold('Import summary:'))
    console.log(`  Changes: ${changes.length}`)
    console.log(`  Roots: ${findRoots(changes).length}`)
    console.log(`  Heads: ${findHeads(changes).length}`)
    console.log(`  Chain depth: ${getChainDepth(changes)}`)

    if (!options.dryRun) {
      console.log()
      console.log(chalk.gray('Note: Writing imported changes requires NodeStore integration.'))
      console.log(chalk.gray('Changes are validated but not written to storage.'))
    }

    console.log()
    console.log(chalk.green('✓ Import validation complete'))
    console.log()
  } catch (error) {
    console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`))
    process.exit(1)
  }
}

// ─── Command Registration ────────────────────────────────────────────────────

export function registerDoctorCommand(program: Command): void {
  // doctor command
  program
    .command('doctor')
    .description('Diagnose data integrity and sync issues')
    .option('--data-dir <path>', 'Path to data directory')
    .option('-q, --quick', 'Quick check (skip signature verification)')
    .option('--json', 'Output as JSON')
    .option('-v, --verbose', 'Show detailed issue information')
    .action(async (opts: DoctorOptions) => {
      await doctorCommand(opts)
    })

  // repair command
  program
    .command('repair')
    .description('Attempt automatic repair of data issues')
    .option('--data-dir <path>', 'Path to data directory')
    .option('--dry-run', 'Preview repairs without applying')
    .option('--json', 'Output as JSON')
    .action(async (opts: RepairOptions) => {
      await repairCommand(opts)
    })

  // export command
  program
    .command('export')
    .description('Export all data to JSON format')
    .requiredOption('-o, --output <path>', 'Output file path')
    .option('--data-dir <path>', 'Path to data directory')
    .option('--format <type>', 'Output format (json or jsonl)', 'json')
    .option('--pretty', 'Pretty-print JSON output')
    .action(async (opts: ExportOptions) => {
      await exportCommand(opts)
    })

  // import command
  program
    .command('import')
    .description('Import data from JSON format')
    .requiredOption('-i, --input <path>', 'Input file path')
    .option('--data-dir <path>', 'Path to data directory')
    .option('--dry-run', 'Validate import without applying')
    .option('--apply-migrations', 'Apply schema migrations during import')
    .action(async (opts: ImportOptions) => {
      await importCommand(opts)
    })
}
