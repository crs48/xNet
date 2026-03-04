/**
 * Schema CLI commands - Extract and diff schemas for CI integration.
 *
 * @example
 * ```bash
 * # Extract schemas from the current codebase
 * xnet schema extract --output schemas.json
 *
 * # Diff two schema JSON files
 * xnet schema diff schemas-main.json schemas-pr.json --output diff.json
 * ```
 */

import type { Schema } from '@xnetjs/data'
import type { Command } from 'commander'
import { writeFileSync, readFileSync, existsSync } from 'fs'
import { diffSchemas, type SchemaDiffResult, type SchemaChange } from '../utils/schema-diff.js'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ExtractedSchemas {
  timestamp: string
  schemas: Schema[]
}

interface DiffOutput {
  timestamp: string
  diffs: Array<{
    schemaName: string
    result: SchemaDiffResult
  }>
  summary: {
    schemasChanged: number
    totalChanges: number
    breakingChanges: number
    cautionChanges: number
    safeChanges: number
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Extract schemas from the codebase by scanning for defineSchema calls.
 * In practice, this would import and evaluate the schema files.
 * For now, we provide a simpler approach that works with JSON exports.
 */
function extractSchemas(): Schema[] {
  // In a full implementation, this would:
  // 1. Scan for files matching patterns like **/schema*.ts, **/defineSchema*
  // 2. Import each file and extract the exported schemas
  // 3. Return the schema definitions
  //
  // For CI purposes, we expect schemas to be exported from a known location
  // or provided via a configuration file.

  const schemaExportPath = process.env.XNET_SCHEMA_EXPORT || './schemas-export.json'

  if (existsSync(schemaExportPath)) {
    const content = readFileSync(schemaExportPath, 'utf-8')
    const data = JSON.parse(content)
    return data.schemas || data
  }

  // Fallback: return empty array if no schemas found
  console.warn('No schemas found. Set XNET_SCHEMA_EXPORT or create schemas-export.json')
  return []
}

function formatChange(change: SchemaChange): string {
  const icon = change.risk === 'breaking' ? '!' : change.risk === 'caution' ? '*' : '+'
  return `  ${icon} ${change.description}`
}

// ─── Commands ─────────────────────────────────────────────────────────────────

export function registerSchemaCommand(program: Command): void {
  const schema = program.command('schema').description('Schema extraction and diffing utilities')

  // ─── Extract Command ────────────────────────────────────────────────────────

  schema
    .command('extract')
    .description('Extract schemas from the codebase to a JSON file')
    .option('-o, --output <file>', 'Output file path', 'schemas.json')
    .option('--pretty', 'Pretty-print the JSON output', false)
    .action(async (options: { output: string; pretty: boolean }) => {
      console.log('Extracting schemas...')

      const schemas = extractSchemas()
      const output: ExtractedSchemas = {
        timestamp: new Date().toISOString(),
        schemas
      }

      const json = options.pretty ? JSON.stringify(output, null, 2) : JSON.stringify(output)

      writeFileSync(options.output, json, 'utf-8')
      console.log(`Extracted ${schemas.length} schemas to ${options.output}`)
    })

  // ─── Diff Command ───────────────────────────────────────────────────────────

  schema
    .command('diff')
    .description('Compare two schema files and report changes')
    .argument('<old-file>', 'Path to the old schemas JSON file')
    .argument('<new-file>', 'Path to the new schemas JSON file')
    .option('-o, --output <file>', 'Output diff to JSON file')
    .option('--fail-on-breaking', 'Exit with code 1 if breaking changes found', false)
    .option('--quiet', 'Only output JSON, no console messages', false)
    .action(
      async (
        oldFile: string,
        newFile: string,
        options: { output?: string; failOnBreaking: boolean; quiet: boolean }
      ) => {
        if (!existsSync(oldFile)) {
          console.error(`Error: Old file not found: ${oldFile}`)
          process.exit(1)
        }
        if (!existsSync(newFile)) {
          console.error(`Error: New file not found: ${newFile}`)
          process.exit(1)
        }

        const oldData: ExtractedSchemas = JSON.parse(readFileSync(oldFile, 'utf-8'))
        const newData: ExtractedSchemas = JSON.parse(readFileSync(newFile, 'utf-8'))

        const oldSchemas = new Map(oldData.schemas.map((s) => [s['@id'], s]))
        const newSchemas = new Map(newData.schemas.map((s) => [s['@id'], s]))

        const diffs: Array<{ schemaName: string; result: SchemaDiffResult }> = []
        let totalChanges = 0
        let breakingChanges = 0
        let cautionChanges = 0
        let safeChanges = 0

        // Compare schemas that exist in both
        for (const [iri, oldSchema] of oldSchemas) {
          const newSchema = newSchemas.get(iri)
          if (newSchema) {
            const result = diffSchemas(oldSchema, newSchema)
            if (result.changes.length > 0) {
              diffs.push({ schemaName: oldSchema.name, result })
              totalChanges += result.changes.length
              breakingChanges += result.summary.breaking
              cautionChanges += result.summary.caution
              safeChanges += result.summary.safe
            }
          } else {
            // Schema was removed
            diffs.push({
              schemaName: oldSchema.name,
              result: {
                fromVersion: oldSchema.version,
                toVersion: 'removed',
                changes: [
                  {
                    type: 'remove',
                    property: oldSchema['@id'],
                    risk: 'breaking',
                    description: `Schema "${oldSchema.name}" was removed`
                  }
                ],
                overallRisk: 'breaking',
                autoMigratable: false,
                summary: { safe: 0, caution: 0, breaking: 1 }
              }
            })
            totalChanges += 1
            breakingChanges += 1
          }
        }

        // Check for new schemas
        for (const [iri, newSchema] of newSchemas) {
          if (!oldSchemas.has(iri)) {
            diffs.push({
              schemaName: newSchema.name,
              result: {
                fromVersion: 'new',
                toVersion: newSchema.version,
                changes: [
                  {
                    type: 'add',
                    property: newSchema['@id'],
                    risk: 'safe',
                    description: `New schema "${newSchema.name}" added`
                  }
                ],
                overallRisk: 'safe',
                autoMigratable: true,
                summary: { safe: 1, caution: 0, breaking: 0 }
              }
            })
            totalChanges += 1
            safeChanges += 1
          }
        }

        const output: DiffOutput = {
          timestamp: new Date().toISOString(),
          diffs,
          summary: {
            schemasChanged: diffs.length,
            totalChanges,
            breakingChanges,
            cautionChanges,
            safeChanges
          }
        }

        // Output to file if specified
        if (options.output) {
          writeFileSync(options.output, JSON.stringify(output, null, 2), 'utf-8')
        }

        // Console output
        if (!options.quiet) {
          if (diffs.length === 0) {
            console.log('No schema changes detected.')
          } else {
            console.log(`\nSchema changes detected: ${diffs.length} schema(s) changed\n`)

            for (const { schemaName, result } of diffs) {
              const riskIcon =
                result.overallRisk === 'breaking'
                  ? '!'
                  : result.overallRisk === 'caution'
                    ? '*'
                    : '+'
              console.log(
                `${riskIcon} ${schemaName} (${result.fromVersion} -> ${result.toVersion})`
              )
              for (const change of result.changes) {
                console.log(formatChange(change))
              }
              console.log()
            }

            console.log('Summary:')
            console.log(`  Breaking: ${breakingChanges}`)
            console.log(`  Caution:  ${cautionChanges}`)
            console.log(`  Safe:     ${safeChanges}`)
          }
        }

        // Exit with error if breaking changes and flag is set
        if (options.failOnBreaking && breakingChanges > 0) {
          process.exit(1)
        }
      }
    )
}
