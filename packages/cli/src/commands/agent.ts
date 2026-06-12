/**
 * Agent commands - the files-first xNet agent interface (exploration 0161).
 *
 * Thin wrappers over the shared plan/apply core:
 * - checkout: lazily materialize a scoped slice of the workspace into a vault
 * - status:   report pending plans and conflicts for a checkout
 * - commit:   lift file edits into mutation plans (and optionally apply them)
 * - search:   ranked workspace search (TSV output)
 * - query:    bounded database reads (TSV by default)
 * - db:       get/set single nodes and rows through the plan pipeline
 * - run:      sandboxed agent scripts with the @xnet/agent-api surface
 * - daemon:   watch a checkout and convert saves into plans continuously
 * - skill:    print the cross-harness SKILL.md
 */

import type {
  AiMutationPlan,
  AiSurfaceService,
  AiWorkspaceExportKind,
  AiWorkspaceWatcherScanResult,
  FlatNode,
  NodeData,
  NodeStoreAPI,
  SchemaRegistryAPI
} from '@xnetjs/plugins/node'
import { readFile, rename, mkdir } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import {
  AiWorkspaceExporter,
  AiWorkspaceWatcher,
  ScriptSandbox,
  XNET_AGENT_SKILL_MD,
  createAgentScriptContext,
  createAiSurfaceService,
  createAiWorkspaceExporter,
  createAiWorkspaceWatcher,
  flattenRowForTsv,
  toTsv
} from '@xnetjs/plugins/node'
import { Command } from 'commander'
import { createRemoteAgentBackend, type AgentBackend } from '../utils/agent-remote.js'

// ─── Services ────────────────────────────────────────────────────────────────

export type AgentCliServices = {
  store: NodeStoreAPI
  schemas: SchemaRegistryAPI
  aiSurface: AiSurfaceService
  exporter: AiWorkspaceExporter
  watcher: AiWorkspaceWatcher
}

export type AgentServicesFactory = (options: { apiUrl?: string }) => Promise<AgentCliServices>

export function createAgentServices(backend: AgentBackend): AgentCliServices {
  const aiSurface = createAiSurfaceService({ store: backend.store, schemas: backend.schemas })
  return {
    store: backend.store,
    schemas: backend.schemas,
    aiSurface,
    exporter: createAiWorkspaceExporter({ ...backend, aiSurface }),
    watcher: createAiWorkspaceWatcher({ ...backend, aiSurface })
  }
}

const defaultServicesFactory: AgentServicesFactory = async ({ apiUrl }) =>
  createAgentServices(await createRemoteAgentBackend({ apiUrl }))

export type AgentOutputFormat = 'tsv' | 'jsonl' | 'json' | 'md'

// ─── checkout ────────────────────────────────────────────────────────────────

export type CheckoutOptions = {
  dir: string
  query?: string
  schema?: string[]
  node?: string[]
  kind?: string[]
  limit?: number
  name?: string
}

export async function runCheckout(
  services: AgentCliServices,
  options: CheckoutOptions
): Promise<string> {
  const result = await services.exporter.checkout({
    rootDir: resolve(options.dir),
    ...(options.name ? { workspaceName: options.name } : {}),
    scope: {
      ...(options.query ? { query: options.query } : {}),
      ...(options.schema?.length ? { schemaIds: options.schema } : {}),
      ...(options.node?.length ? { nodeIds: options.node } : {}),
      ...(options.kind?.length ? { kinds: options.kind as AiWorkspaceExportKind[] } : {}),
      ...(options.limit !== undefined ? { limit: options.limit } : {})
    }
  })
  const lines = result.manifestEntries.map((entry) => `${entry.path}\t${entry.id}`)
  return [
    `checked out ${result.manifestEntries.length} file(s) into ${options.dir}`,
    ...lines
  ].join('\n')
}

// ─── status ──────────────────────────────────────────────────────────────────

export type StatusOptions = { dir: string; format?: AgentOutputFormat }

export async function runStatus(
  services: AgentCliServices,
  options: StatusOptions
): Promise<string> {
  const scan = await services.watcher.scanChangedFiles({
    rootDir: resolve(options.dir),
    writePendingPlans: false,
    writeConflicts: false,
    writeReviewIndex: false
  })
  if (options.format === 'json') {
    return JSON.stringify({
      pendingPlans: scan.pendingPlans.map((pending) => ({
        path: pending.path,
        planId: pending.plan.id,
        intent: pending.plan.intent
      })),
      conflicts: scan.conflicts
    })
  }
  const lines = [
    ...scan.pendingPlans.map(
      (pending) => `pending\t${pending.path}\t${pending.plan.id}\t${pending.plan.intent}`
    ),
    ...scan.conflicts.map(
      (conflict) => `conflict\t${conflict.path}\t${conflict.kind}\t${conflict.message}`
    )
  ]
  return lines.length > 0 ? lines.join('\n') : 'clean'
}

// ─── commit ──────────────────────────────────────────────────────────────────

export type CommitOptions = { dir: string; apply?: boolean; actor?: string }

export async function runCommit(
  services: AgentCliServices,
  options: CommitOptions
): Promise<string> {
  const rootDir = resolve(options.dir)
  const scan = await services.watcher.scanChangedFiles({
    rootDir,
    actor: options.actor ?? 'xnet-cli'
  })

  const lines: string[] = []
  for (const conflict of scan.conflicts) {
    lines.push(`conflict\t${conflict.path}\t${conflict.kind}\tsee ${conflict.notePath ?? ''}`)
  }

  if (!options.apply) {
    for (const pending of scan.pendingPlans) {
      lines.push(`planned\t${pending.path}\t${pending.plan.id}`)
    }
    if (scan.pendingPlans.length === 0 && scan.conflicts.length === 0) return 'clean'
    lines.push(`${scan.pendingPlans.length} plan(s) pending; re-run with --apply to apply`)
    return lines.join('\n')
  }

  const appliedNodeIds: string[] = []
  for (const pending of scan.pendingPlans) {
    const outcome = await applyPendingPlan(services, pending.plan)
    lines.push(`${outcome.status}\t${pending.path}\t${pending.plan.id}\t${outcome.detail}`)
    if (outcome.status === 'applied') {
      appliedNodeIds.push(...pending.plan.changes.map((change) => change.targetId))
      await archivePendingPlan(rootDir, pending.planPath)
    }
  }

  if (appliedNodeIds.length > 0) {
    // Refresh the projection so files carry the new revisions.
    await services.exporter.checkout({ rootDir, scope: { nodeIds: appliedNodeIds } })
  }

  return lines.length > 0 ? lines.join('\n') : 'clean'
}

async function applyPendingPlan(
  services: AgentCliServices,
  plan: AiMutationPlan
): Promise<{ status: 'applied' | 'skipped' | 'failed'; detail: string }> {
  const targetKind = plan.changes[0]?.targetKind
  try {
    if (targetKind === 'page') {
      const result = (await services.aiSurface.callTool('xnet_apply_page_markdown', {
        plan,
        confirmApply: true
      })) as { applied?: boolean; validation?: { errors?: string[] } }
      return result.applied
        ? { status: 'applied', detail: 'page markdown applied' }
        : { status: 'failed', detail: result.validation?.errors?.join('; ') ?? 'not applied' }
    }
    if (targetKind === 'database' || targetKind === 'databaseRows') {
      const result = (await services.aiSurface.callTool('xnet_apply_database_mutation', {
        plan,
        confirmApply: true
      })) as { applied?: boolean; validation?: { errors?: string[] } }
      return result.applied
        ? { status: 'applied', detail: 'database mutation applied' }
        : { status: 'failed', detail: result.validation?.errors?.join('; ') ?? 'not applied' }
    }
    return {
      status: 'skipped',
      detail: `${targetKind ?? 'unknown'} plans need review in the xNet app`
    }
  } catch (err) {
    return { status: 'failed', detail: err instanceof Error ? err.message : String(err) }
  }
}

async function archivePendingPlan(rootDir: string, planPath: string): Promise<void> {
  const appliedPath = planPath.replace('.xnet/pending/', '.xnet/applied/')
  try {
    await mkdir(dirname(join(rootDir, appliedPath)), { recursive: true })
    await rename(join(rootDir, planPath), join(rootDir, appliedPath))
  } catch {
    // Archival is best-effort; the plan was already applied.
  }
}

// ─── search ──────────────────────────────────────────────────────────────────

export type SearchOptions = {
  text: string
  schema?: string
  limit?: number
  format?: AgentOutputFormat
}

export async function runSearch(
  services: AgentCliServices,
  options: SearchOptions
): Promise<string> {
  const result = await services.aiSurface.search({
    query: options.text,
    schemaId: options.schema,
    limit: options.limit
  })
  const results = Array.isArray(result.results) ? (result.results as Record<string, unknown>[]) : []
  if (options.format === 'json') return JSON.stringify(result)
  if (options.format === 'jsonl') return results.map((row) => JSON.stringify(row)).join('\n')
  const compact = results.map((row) => ({
    id: row.id,
    schemaId: row.schemaId,
    title: row.title,
    snippet: row.snippet
  }))
  if (results.length === 0) return 'no results'
  if (options.format === 'md') return toMarkdownTable(compact)
  return toTsv(compact).trimEnd()
}

// ─── query ───────────────────────────────────────────────────────────────────

export type QueryOptions = {
  databaseId: string
  where?: string[]
  limit?: number
  offset?: number
  format?: AgentOutputFormat
  detailed?: boolean
}

export async function runQuery(services: AgentCliServices, options: QueryOptions): Promise<string> {
  const where = parseAssignments(options.where ?? [])
  const result = (await services.aiSurface.callTool('xnet_database_query', {
    databaseId: options.databaseId,
    ...(Object.keys(where).length > 0 ? { where } : {}),
    ...(options.limit !== undefined ? { limit: options.limit } : {}),
    ...(options.offset !== undefined ? { offset: options.offset } : {})
  })) as Record<string, unknown>
  const rows = Array.isArray(result.rows) ? (result.rows as Record<string, unknown>[]) : []

  if (options.format === 'json') {
    return JSON.stringify(
      options.detailed
        ? result
        : {
            databaseId: result.databaseId,
            count: result.count,
            totalCount: result.totalCount,
            rows
          }
    )
  }
  if (options.format === 'jsonl') return rows.map((row) => JSON.stringify(row)).join('\n')
  if (rows.length === 0) return 'no rows'
  if (options.format === 'md') {
    return toMarkdownTable(rows.map((row) => flattenRowForTsv(row)))
  }
  return toTsv(rows).trimEnd()
}

/** Markdown table output; prefer TSV for anything beyond a handful of rows. */
function toMarkdownTable(rows: Record<string, unknown>[]): string {
  const columns: string[] = []
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!columns.includes(key)) columns.push(key)
    }
  }
  const cell = (value: unknown): string => {
    if (value === null || value === undefined) return ''
    const text = typeof value === 'object' ? JSON.stringify(value) : String(value)
    return text.replace(/[|\n\r\t]+/g, ' ')
  }
  return [
    `| ${columns.join(' | ')} |`,
    `| ${columns.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${columns.map((column) => cell(row[column])).join(' | ')} |`)
  ].join('\n')
}

// ─── db get / db set ─────────────────────────────────────────────────────────

export type DbGetOptions = { nodeId: string; detailed?: boolean }

export async function runDbGet(services: AgentCliServices, options: DbGetOptions): Promise<string> {
  const node = await services.store.get(options.nodeId)
  if (!node) throw new Error(`Node not found: ${options.nodeId}`)
  if (options.detailed) return JSON.stringify(node)
  return JSON.stringify({
    id: node.id,
    schemaId: node.schemaId,
    properties: node.properties,
    revision: `updatedAt:${node.updatedAt}`
  })
}

export type DbSetOptions = {
  databaseId: string
  rowId: string
  assignments: string[]
  actor?: string
  planOnly?: boolean
}

export async function runDbSet(services: AgentCliServices, options: DbSetOptions): Promise<string> {
  const properties = parseAssignments(options.assignments)
  if (Object.keys(properties).length === 0) {
    throw new Error('db set requires at least one field=value assignment')
  }
  const plan = (await services.aiSurface.callTool('xnet_plan_database_mutation', {
    databaseId: options.databaseId,
    actor: options.actor ?? 'xnet-cli',
    intent: `Update row ${options.rowId} via xnet db set`,
    operations: [{ op: 'updateRow', args: { rowId: options.rowId, properties } }]
  })) as AiMutationPlan
  if (!plan.validation.valid) {
    throw new Error(`plan invalid: ${plan.validation.errors.join('; ')}`)
  }
  if (options.planOnly) return JSON.stringify(plan)

  const result = (await services.aiSurface.callTool('xnet_apply_database_mutation', {
    plan,
    confirmApply: true
  })) as { applied?: boolean; validation?: { errors?: string[] } }
  if (!result.applied) {
    throw new Error(`apply failed: ${result.validation?.errors?.join('; ') ?? 'unknown error'}`)
  }
  return `applied\t${options.rowId}\t${plan.id}`
}

// ─── run (sandboxed agent script) ───────────────────────────────────────────

export type RunScriptOptions = {
  file: string
  schema?: string
  limit?: number
  node?: string
  dir?: string
  actor?: string
  timeoutMs?: number
}

export async function runScript(
  services: AgentCliServices,
  options: RunScriptOptions
): Promise<string> {
  const code = await readFile(resolve(options.file), 'utf8')
  const nodes = await services.store.list({
    ...(options.schema ? { schemaId: options.schema } : {}),
    limit: options.limit ?? 200,
    offset: 0
  })
  const flatNodes = nodes.filter((node) => !node.deleted).map(toFlatNode)
  const currentNode = options.node ? flatNodes.find((node) => node.id === options.node) : undefined

  const session = createAgentScriptContext({
    nodes: flatNodes,
    ...(currentNode ? { node: currentNode } : {})
  })
  const sandbox = new ScriptSandbox({ timeoutMs: options.timeoutMs ?? 5000 })
  const result = await sandbox.execute(code, session.context)

  const plan = session.toMutationPlan({ actor: options.actor ?? 'xnet-cli-script' })
  const output: Record<string, unknown> = { result }
  if (plan) {
    output.plan = { id: plan.id, changes: plan.changes.length, valid: plan.validation.valid }
    if (options.dir) {
      const planPath = `.xnet/pending/${plan.id}.plan.json`
      const fullPath = join(resolve(options.dir), planPath)
      await mkdir(dirname(fullPath), { recursive: true })
      await (
        await import('node:fs/promises')
      ).writeFile(fullPath, `${JSON.stringify(plan, null, 2)}\n`, 'utf8')
      output.planPath = planPath
    } else {
      output.planDetail = plan
    }
  }
  return JSON.stringify(output)
}

function toFlatNode(node: NodeData): FlatNode {
  return {
    id: node.id,
    schemaIRI: node.schemaId,
    ...node.properties,
    updatedAt: node.updatedAt
  }
}

// ─── daemon ──────────────────────────────────────────────────────────────────

export type DaemonOptions = {
  dir: string
  poll?: boolean
  pollIntervalMs?: number
  apply?: boolean
  actor?: string
  onScan?: (summary: string) => void
}

export function startDaemon(services: AgentCliServices, options: DaemonOptions): { close(): void } {
  const rootDir = resolve(options.dir)
  const report = options.onScan ?? ((summary: string) => console.log(summary))

  const handleScan = async (scan: AiWorkspaceWatcherScanResult): Promise<void> => {
    if (scan.pendingPlans.length === 0 && scan.conflicts.length === 0) return
    if (options.apply && scan.pendingPlans.length > 0) {
      const summary = await runCommit(services, {
        dir: rootDir,
        apply: true,
        actor: options.actor
      })
      report(summary)
      return
    }
    report(
      [
        ...scan.pendingPlans.map((pending) => `planned\t${pending.path}\t${pending.plan.id}`),
        ...scan.conflicts.map((conflict) => `conflict\t${conflict.path}\t${conflict.kind}`)
      ].join('\n')
    )
  }

  const handle = services.watcher.watchWorkspace(
    {
      rootDir,
      actor: options.actor ?? 'xnet-daemon',
      usePolling: options.poll,
      ...(options.pollIntervalMs !== undefined ? { pollIntervalMs: options.pollIntervalMs } : {})
    },
    (scan) => void handleScan(scan)
  )
  return handle
}

// ─── Shared parsing ──────────────────────────────────────────────────────────

/** Parse `field=value` pairs; values try JSON first (numbers, booleans), then string. */
export function parseAssignments(pairs: string[]): Record<string, unknown> {
  const record: Record<string, unknown> = {}
  for (const pair of pairs) {
    const separator = pair.indexOf('=')
    if (separator <= 0) {
      throw new Error(`Invalid assignment "${pair}"; expected field=value`)
    }
    const field = pair.slice(0, separator).trim()
    const raw = pair.slice(separator + 1)
    try {
      record[field] = JSON.parse(raw)
    } catch {
      record[field] = raw
    }
  }
  return record
}

// ─── Command Registration ───────────────────────────────────────────────────

export function registerAgentCommands(
  program: Command,
  createServices: AgentServicesFactory = defaultServicesFactory
): void {
  const services = (options: { apiUrl?: string }): Promise<AgentCliServices> =>
    createServices(options)

  const print = (text: string): void => {
    console.log(text)
  }

  program
    .command('checkout')
    .description('Materialize a scoped slice of the workspace into a vault folder')
    .option('-q, --query <text>', 'Search query scope')
    .option('-s, --schema <iri...>', 'Schema IRI scope')
    .option('-n, --node <id...>', 'Node id scope')
    .option('-k, --kind <kind...>', 'Kind folder scope: page|database|canvas')
    .option('-l, --limit <n>', 'Max nodes to materialize', parseIntOption)
    .option('-d, --dir <path>', 'Checkout directory', '.')
    .option('--name <name>', 'Workspace display name')
    .option('--api-url <url>', 'xNet local API URL')
    .action(async (options) => {
      print(await runCheckout(await services(options), options))
    })

  program
    .command('status')
    .description('List pending plans and conflicts for a checkout')
    .option('-d, --dir <path>', 'Checkout directory', '.')
    .option('--format <format>', 'Output format: tsv|json', 'tsv')
    .option('--api-url <url>', 'xNet local API URL')
    .action(async (options) => {
      print(await runStatus(await services(options), options))
    })

  program
    .command('commit')
    .description('Lift file edits into mutation plans; --apply applies them')
    .option('-d, --dir <path>', 'Checkout directory', '.')
    .option('--apply', 'Apply valid plans through the plan pipeline')
    .option('--actor <actor>', 'Actor recorded on plans', 'xnet-cli')
    .option('--api-url <url>', 'xNet local API URL')
    .action(async (options) => {
      print(await runCommit(await services(options), options))
    })

  program
    .command('search <text>')
    .description('Ranked workspace search (TSV: id, schema, title, snippet)')
    .option('-s, --schema <iri>', 'Schema IRI filter')
    .option('-l, --limit <n>', 'Max results', parseIntOption)
    .option('--format <format>', 'Output format: tsv|jsonl|json', 'tsv')
    .option('--api-url <url>', 'xNet local API URL')
    .action(async (text, options) => {
      print(await runSearch(await services(options), { ...options, text }))
    })

  program
    .command('query <databaseId>')
    .description('Query database rows (TSV by default)')
    .option('-w, --where <expr...>', 'Filters as field=value')
    .option('-l, --limit <n>', 'Max rows', parseIntOption)
    .option('-o, --offset <n>', 'Row offset', parseIntOption)
    .option('--format <format>', 'Output format: tsv|jsonl|json', 'tsv')
    .option('--detailed', 'Include descriptor and query plan in json output')
    .option('--api-url <url>', 'xNet local API URL')
    .action(async (databaseId, options) => {
      print(await runQuery(await services(options), { ...options, databaseId }))
    })

  const db = program.command('db').description('Direct node and row access')

  db.command('get <nodeId>')
    .description('Read a node as compact JSON')
    .option('--detailed', 'Include full node record')
    .option('--api-url <url>', 'xNet local API URL')
    .action(async (nodeId, options) => {
      print(await runDbGet(await services(options), { ...options, nodeId }))
    })

  db.command('set <databaseId> <rowId> <assignments...>')
    .description('Update row properties through the plan/apply pipeline')
    .option('--plan-only', 'Print the mutation plan without applying')
    .option('--actor <actor>', 'Actor recorded on the plan', 'xnet-cli')
    .option('--api-url <url>', 'xNet local API URL')
    .action(async (databaseId, rowId, assignments, options) => {
      print(
        await runDbSet(await services(options), {
          databaseId,
          rowId,
          assignments,
          actor: options.actor,
          planOnly: options.planOnly
        })
      )
    })

  program
    .command('run <file>')
    .description('Run a sandboxed agent script with the @xnet/agent-api surface')
    .option('-s, --schema <iri>', 'Preload nodes of this schema')
    .option('-l, --limit <n>', 'Max nodes to preload', parseIntOption)
    .option('-n, --node <id>', 'Current node id')
    .option('-d, --dir <path>', 'Checkout directory for proposal plans')
    .option('--actor <actor>', 'Actor recorded on proposal plans', 'xnet-cli-script')
    .option('--api-url <url>', 'xNet local API URL')
    .action(async (file, options) => {
      print(await runScript(await services(options), { ...options, file }))
    })

  program
    .command('daemon')
    .description('Watch a checkout and lift saves into mutation plans')
    .option('-d, --dir <path>', 'Checkout directory', '.')
    .option('--poll', 'Use interval polling instead of fs.watch')
    .option('--apply', 'Auto-apply valid plans (watcher autocommit)')
    .option('--actor <actor>', 'Actor recorded on plans', 'xnet-daemon')
    .option('--api-url <url>', 'xNet local API URL')
    .action(async (options) => {
      const handle = startDaemon(await services(options), options)
      console.log(`watching ${resolve(options.dir)} (ctrl-c to stop)`)
      process.on('SIGINT', () => {
        handle.close()
        process.exit(0)
      })
    })

  program
    .command('skill')
    .description('Print the cross-harness xNet SKILL.md')
    .action(() => {
      print(XNET_AGENT_SKILL_MD)
    })
}

function parseIntOption(value: string): number {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed)) throw new Error(`Invalid number: ${value}`)
  return parsed
}
