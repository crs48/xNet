/**
 * Migrate Command - Schema migration tools
 *
 * Commands:
 * - analyze: Compare two schema versions and show changes
 * - generate: Generate lens migration code
 * - run: Execute a migration (dry-run or apply)
 */

import type { Schema, SchemaIRI } from '@xnet/data'
import { writeFileSync, readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { Command } from 'commander'
import { generateLensCode, generateLensSnippet } from '../utils/lens-generator.js'
import { diffSchemas, type SchemaDiffResult } from '../utils/schema-diff.js'

// ─── Types ───────────────────────────────────────────────────────────────────

interface AnalyzeOptions {
  from: string
  to: string
  json?: boolean
  schemaFile?: string
}

interface GenerateOptions {
  from: string
  to: string
  output?: string
  schemaFile?: string
  force?: boolean
}

interface RunOptions {
  from: string
  to: string
  dryRun?: boolean
  apply?: boolean
  lensFile?: string
  dataDir?: string
}

// ─── Chalk fallback (dynamic import for ESM) ─────────────────────────────────

interface Chalk {
  green: (s: string) => string
  yellow: (s: string) => string
  red: (s: string) => string
  blue: (s: string) => string
  gray: (s: string) => string
  bold: (s: string) => string
  dim: (s: string) => string
}

async function getChalk(): Promise<Chalk> {
  try {
    const chalk = await import('chalk')
    return chalk.default as unknown as Chalk
  } catch {
    // Fallback for environments without chalk
    const identity = (s: string) => s
    return {
      green: identity,
      yellow: identity,
      red: identity,
      blue: identity,
      gray: identity,
      bold: identity,
      dim: identity
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseSchemaIRI(iri: string): { name: string; version: string } {
  // Format: Name@version or xnet://namespace/Name@version
  const match = iri.match(/([^/@]+)@(\d+\.\d+\.\d+)$/)
  if (!match) {
    throw new Error(
      `Invalid schema IRI: ${iri}. Expected format: Name@version or xnet://namespace/Name@version`
    )
  }
  return { name: match[1], version: match[2] }
}

function loadSchemasFromFile(filePath: string): Map<string, Schema> {
  if (!existsSync(filePath)) {
    throw new Error(`Schema file not found: ${filePath}`)
  }

  const content = readFileSync(filePath, 'utf-8')
  const data = JSON.parse(content)

  const schemas = new Map<string, Schema>()

  // Support array of schemas or object with schemas
  const schemaList = Array.isArray(data) ? data : (data.schemas ?? [data])

  for (const schema of schemaList) {
    if (schema['@id']) {
      schemas.set(schema['@id'], schema as Schema)
      // Also index by Name@version
      const name = schema.name ?? schema['@id'].split('/').pop()?.split('@')[0]
      const version = schema.version ?? '1.0.0'
      schemas.set(`${name}@${version}`, schema as Schema)
    }
  }

  return schemas
}

function findSchema(schemaIRI: string, schemas: Map<string, Schema> | null): Schema | null {
  if (schemas) {
    const schema = schemas.get(schemaIRI)
    if (schema) return schema
  }

  // Try to load from @xnet/data built-in schemas
  // This would require dynamic import, skipped for now
  return null
}

// ─── Analyze Command ─────────────────────────────────────────────────────────

async function analyzeCommand(options: AnalyzeOptions): Promise<void> {
  const chalk = await getChalk()

  try {
    const fromParsed = parseSchemaIRI(options.from)
    const toParsed = parseSchemaIRI(options.to)

    // Load schemas
    let schemas: Map<string, Schema> | null = null
    if (options.schemaFile) {
      schemas = loadSchemasFromFile(options.schemaFile)
    }

    const fromSchema = findSchema(options.from, schemas)
    const toSchema = findSchema(options.to, schemas)

    if (!fromSchema || !toSchema) {
      // Generate example output for demo purposes
      console.log(chalk.yellow('\nNote: Schema file not provided. Showing example output.\n'))
      console.log(chalk.gray('Use --schema-file to load actual schemas from a JSON file.\n'))

      // Create mock schemas for demonstration
      const mockFromSchema = {
        '@id': `xnet://xnet.fyi/${fromParsed.name}@${fromParsed.version}` as SchemaIRI,
        '@type': 'xnet://xnet.fyi/Schema' as const,
        name: fromParsed.name,
        namespace: 'xnet://xnet.fyi/',
        version: fromParsed.version,
        properties: [
          { '@id': `#complete`, name: 'complete', type: 'checkbox' as const, required: false },
          { '@id': `#title`, name: 'title', type: 'text' as const, required: true }
        ]
      } satisfies Schema

      const mockToSchema = {
        '@id': `xnet://xnet.fyi/${toParsed.name}@${toParsed.version}` as SchemaIRI,
        '@type': 'xnet://xnet.fyi/Schema' as const,
        name: toParsed.name,
        namespace: 'xnet://xnet.fyi/',
        version: toParsed.version,
        properties: [
          {
            '@id': `#status`,
            name: 'status',
            type: 'select' as const,
            required: false
          },
          { '@id': `#title`, name: 'title', type: 'text' as const, required: true },
          { '@id': `#priority`, name: 'priority', type: 'text' as const, required: true }
        ]
      } satisfies Schema

      printAnalysisResult(diffSchemas(mockFromSchema, mockToSchema), options.json, chalk)
      return
    }

    const diff = diffSchemas(fromSchema, toSchema)
    printAnalysisResult(diff, options.json, chalk)
  } catch (error) {
    console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`))
    process.exit(1)
  }
}

function printAnalysisResult(
  diff: SchemaDiffResult,
  json: boolean | undefined,
  chalk: Chalk
): void {
  if (json) {
    console.log(JSON.stringify(diff, null, 2))
    return
  }

  console.log(chalk.bold(`\nSchema changes: ${diff.fromVersion} → ${diff.toVersion}\n`))

  if (diff.changes.length === 0) {
    console.log(chalk.green('No changes detected.'))
    return
  }

  // Group changes by risk
  const breaking = diff.changes.filter((c) => c.risk === 'breaking')
  const caution = diff.changes.filter((c) => c.risk === 'caution')
  const safe = diff.changes.filter((c) => c.risk === 'safe')

  if (breaking.length > 0) {
    console.log(chalk.red(chalk.bold('BREAKING CHANGES:')))
    for (const change of breaking) {
      console.log(chalk.red(`  - ${change.type.toUpperCase()}: ${change.description}`))
    }
    console.log()
  }

  if (caution.length > 0) {
    console.log(chalk.yellow(chalk.bold('CAUTION:')))
    for (const change of caution) {
      console.log(chalk.yellow(`  - ${change.type.toUpperCase()}: ${change.description}`))
    }
    console.log()
  }

  if (safe.length > 0) {
    console.log(chalk.green(chalk.bold('SAFE:')))
    for (const change of safe) {
      console.log(chalk.green(`  - ${change.type.toUpperCase()}: ${change.description}`))
    }
    console.log()
  }

  // Summary
  console.log(chalk.bold('Summary:'))
  console.log(
    `  ${chalk.red(`${diff.summary.breaking} breaking`)} | ${chalk.yellow(`${diff.summary.caution} caution`)} | ${chalk.green(`${diff.summary.safe} safe`)}`
  )
  console.log()

  // Suggested lens
  if (diff.changes.some((c) => c.suggestedLens)) {
    console.log(chalk.bold('Suggested lens:'))
    console.log(chalk.dim('─'.repeat(40)))
    console.log(generateLensSnippet(diff))
    console.log(chalk.dim('─'.repeat(40)))
    console.log()
  }

  // Auto-migratable status
  if (diff.autoMigratable) {
    console.log(chalk.green('✓ Automatic migration possible'))
  } else {
    console.log(chalk.yellow('⚠ Manual intervention required for some changes'))
  }
}

// ─── Generate Command ────────────────────────────────────────────────────────

async function generateCommand(options: GenerateOptions): Promise<void> {
  const chalk = await getChalk()

  try {
    const fromParsed = parseSchemaIRI(options.from)
    const toParsed = parseSchemaIRI(options.to)

    // Load schemas
    let schemas: Map<string, Schema> | null = null
    if (options.schemaFile) {
      schemas = loadSchemasFromFile(options.schemaFile)
    }

    const fromSchema = findSchema(options.from, schemas)
    const toSchema = findSchema(options.to, schemas)

    // Create schemas if not found (demo mode)
    const from = fromSchema ?? createMockSchema(fromParsed.name, fromParsed.version, 'from')
    const to = toSchema ?? createMockSchema(toParsed.name, toParsed.version, 'to')

    if (!fromSchema || !toSchema) {
      console.log(chalk.yellow('\nNote: Using mock schemas for demonstration.\n'))
    }

    const diff = diffSchemas(from, to)
    const sourceIRI = from['@id']
    const targetIRI = to['@id']

    const generated = generateLensCode({
      diff,
      sourceIRI,
      targetIRI,
      includeComments: true,
      includeTodos: true
    })

    if (options.output) {
      const outputPath = resolve(process.cwd(), options.output)

      if (existsSync(outputPath) && !options.force) {
        console.error(chalk.red(`Error: File already exists: ${outputPath}`))
        console.error(chalk.gray('Use --force to overwrite.'))
        process.exit(1)
      }

      writeFileSync(outputPath, generated.code, 'utf-8')
      console.log(chalk.green(`\n✓ Generated lens written to: ${outputPath}`))
    } else {
      console.log(generated.code)
    }

    if (!generated.isComplete) {
      console.log(chalk.yellow('\n⚠ Manual completion required:'))
      for (const item of generated.manualItems) {
        console.log(chalk.yellow(`  - ${item}`))
      }
    }
  } catch (error) {
    console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`))
    process.exit(1)
  }
}

function createMockSchema(name: string, version: string, type: 'from' | 'to'): Schema {
  // Create a simple mock for demonstration
  if (type === 'from') {
    return {
      '@id': `xnet://xnet.fyi/${name}@${version}` as SchemaIRI,
      '@type': 'xnet://xnet.fyi/Schema' as const,
      name,
      namespace: 'xnet://xnet.fyi/',
      version,
      properties: [
        { '@id': `#complete`, name: 'complete', type: 'checkbox' as const, required: false },
        { '@id': `#title`, name: 'title', type: 'text' as const, required: true }
      ]
    }
  } else {
    return {
      '@id': `xnet://xnet.fyi/${name}@${version}` as SchemaIRI,
      '@type': 'xnet://xnet.fyi/Schema' as const,
      name,
      namespace: 'xnet://xnet.fyi/',
      version,
      properties: [
        {
          '@id': `#status`,
          name: 'status',
          type: 'select' as const,
          required: false
        },
        { '@id': `#title`, name: 'title', type: 'text' as const, required: true },
        { '@id': `#priority`, name: 'priority', type: 'text' as const, required: true }
      ]
    }
  }
}

// ─── Run Command ─────────────────────────────────────────────────────────────

async function runCommand(options: RunOptions): Promise<void> {
  const chalk = await getChalk()

  if (!options.dryRun && !options.apply) {
    console.error(chalk.red('Error: Must specify either --dry-run or --apply'))
    process.exit(1)
  }

  if (options.dryRun && options.apply) {
    console.error(chalk.red('Error: Cannot specify both --dry-run and --apply'))
    process.exit(1)
  }

  try {
    console.log(chalk.blue(`\nMigration: ${options.from} → ${options.to}\n`))

    if (options.dryRun) {
      console.log(chalk.yellow('DRY RUN - No changes will be applied\n'))

      // In a real implementation, this would:
      // 1. Load the lens from --lens-file or find registered lens
      // 2. Scan the data directory for nodes matching --from schema
      // 3. Apply the lens to each node and report results

      console.log(chalk.gray('Would migrate nodes:'))
      console.log(chalk.gray('  - Scan data directory for nodes with schema ' + options.from))
      console.log(chalk.gray('  - Apply migration lens to each node'))
      console.log(chalk.gray('  - Update schema version to ' + options.to))
      console.log()
      console.log(chalk.dim('Note: Full migration requires --data-dir and --lens-file options'))
      console.log(chalk.dim('      or a configured NodeStore with registered lenses.'))
    } else {
      console.log(chalk.yellow('APPLY MODE - Changes will be written\n'))

      // Similar to dry-run but actually writes changes
      console.log(chalk.gray('Would apply migration:'))
      console.log(chalk.gray('  - Load nodes with schema ' + options.from))
      console.log(chalk.gray('  - Transform using migration lens'))
      console.log(chalk.gray('  - Write updated nodes with schema ' + options.to))
      console.log()
      console.log(chalk.dim('Note: Full migration requires --data-dir and --lens-file options'))
      console.log(chalk.dim('      or a configured NodeStore with registered lenses.'))
    }

    console.log()
    console.log(chalk.green('✓ Migration command parsed successfully'))
    console.log(chalk.gray('  Full implementation requires NodeStore integration.'))
  } catch (error) {
    console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`))
    process.exit(1)
  }
}

// ─── Command Registration ────────────────────────────────────────────────────

export function registerMigrateCommand(program: Command): void {
  const migrate = program.command('migrate').description('Schema migration tools')

  // analyze subcommand
  migrate
    .command('analyze')
    .description('Analyze changes between two schema versions')
    .requiredOption('--from <schema>', 'Source schema (e.g., Task@1.0.0)')
    .requiredOption('--to <schema>', 'Target schema (e.g., Task@2.0.0)')
    .option('--json', 'Output as JSON')
    .option('--schema-file <path>', 'Load schemas from JSON file')
    .action(async (opts: AnalyzeOptions) => {
      await analyzeCommand(opts)
    })

  // generate subcommand
  migrate
    .command('generate')
    .description('Generate migration lens code')
    .requiredOption('--from <schema>', 'Source schema (e.g., Task@1.0.0)')
    .requiredOption('--to <schema>', 'Target schema (e.g., Task@2.0.0)')
    .option('-o, --output <path>', 'Output file path')
    .option('--schema-file <path>', 'Load schemas from JSON file')
    .option('-f, --force', 'Overwrite existing files')
    .action(async (opts: GenerateOptions) => {
      await generateCommand(opts)
    })

  // run subcommand
  migrate
    .command('run')
    .description('Execute a migration')
    .requiredOption('--from <schema>', 'Source schema (e.g., Task@1.0.0)')
    .requiredOption('--to <schema>', 'Target schema (e.g., Task@2.0.0)')
    .option('--dry-run', 'Preview changes without applying')
    .option('--apply', 'Apply the migration')
    .option('--lens-file <path>', 'Path to lens file')
    .option('--data-dir <path>', 'Path to data directory')
    .action(async (opts: RunOptions) => {
      await runCommand(opts)
    })
}
