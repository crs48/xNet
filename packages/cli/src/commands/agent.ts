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

import type { EntrySearch } from '@xnetjs/brain'
import type { AgentBackend } from '../utils/agent-remote.js'
import type {
  AiMutationPlan,
  AiSurfaceService,
  AiWorkspaceExportKind,
  AiWorkspaceWatcherScanResult,
  AgentGraphEdge,
  AgentRecallHit,
  AgentRequestedContext,
  AgentResolvedContext,
  FlatNode,
  NodeData,
  NodeStoreAPI,
  SchemaRegistryAPI,
  WorkspaceRetrieval
} from '@xnetjs/plugins/node'
import { readFile, rename, mkdir } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import {
  AiWorkspaceExporter,
  AiWorkspaceWatcher,
  ScriptSandbox,
  XNET_AGENT_SKILL_MD,
  createAgentRetrieval,
  createAgentScriptContext,
  createAiSurfaceService,
  createAiWorkspaceExporter,
  createAiWorkspaceWatcher,
  flattenRowForTsv,
  graphRequestKey,
  toTsv
} from '@xnetjs/plugins/node'
import { Command } from 'commander'
import { resolveAgentBackend, type BackendLadderOptions } from '../utils/agent-backend.js'
import {
  connectSession,
  sessionTargetFor,
  type SessionClient
} from '../utils/session-daemon.js'
import { registerMemoryCommands, renderMemoryPreamble } from './memory.js'
import { SESSION_CLI_VERSION } from './serve.js'

// ─── Services ────────────────────────────────────────────────────────────────

export type AgentCliServices = {
  store: NodeStoreAPI
  schemas: SchemaRegistryAPI
  aiSurface: AiSurfaceService
  /** Workspace retrieval — backs `xnet recall` and reports the tier (0415). */
  retrieval: WorkspaceRetrieval
  exporter: AiWorkspaceExporter
  watcher: AiWorkspaceWatcher
  /** Release backend resources (closes the SQLite client in local mode). */
  dispose?: () => Promise<void>
}

/** Options the CLI threads to the backend ladder, plus a per-command write hint. */
export type AgentCommandOptions = BackendLadderOptions & { forWrites?: boolean }

export type AgentServicesFactory = (options: AgentCommandOptions) => Promise<AgentCliServices>

export type AgentServicesOptions = {
  /**
   * Semantic entry search, when the caller has a warm vector tier. Only
   * `xnet serve --vectors` does; a cold verb must never load an embedding model
   * (exploration 0415).
   */
  semanticEntrySearch?: EntrySearch
}

export function createAgentServices(
  backend: AgentBackend,
  options: AgentServicesOptions = {}
): AgentCliServices {
  // Exploration 0415: the CLI is the cheapest lane and used to be the least
  // equipped one. Retrieval is built first so the AI surface's context packs
  // walk the graph instead of scanning, and so every command can report the
  // tier it actually ran at.
  const retrieval = createAgentRetrieval({
    store: backend.store,
    schemas: backend.schemas,
    ...(options.semanticEntrySearch
      ? { semanticEntrySearch: options.semanticEntrySearch }
      : {})
  })
  const aiSurface = createAiSurfaceService({
    store: backend.store,
    schemas: backend.schemas,
    retrieveContext: retrieval.retrieveContext
  })
  return {
    store: backend.store,
    schemas: backend.schemas,
    aiSurface,
    retrieval,
    exporter: createAiWorkspaceExporter({ ...backend, aiSurface }),
    watcher: createAiWorkspaceWatcher({ ...backend, aiSurface })
  }
}

const defaultServicesFactory: AgentServicesFactory = async (options) => {
  const backend = await resolveAgentBackend(options)
  const services = createAgentServices(backend)
  services.dispose = () => backend.dispose()
  return services
}

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

const APPLY_TOOL_BY_TARGET_KIND: Record<string, string> = {
  page: 'xnet_apply_page_markdown',
  database: 'xnet_apply_database_mutation',
  databaseRows: 'xnet_apply_database_mutation'
}

async function applyPendingPlan(
  services: AgentCliServices,
  plan: AiMutationPlan
): Promise<{ status: 'applied' | 'skipped' | 'failed'; detail: string }> {
  const targetKind = plan.changes[0]?.targetKind ?? 'unknown'
  const tool = APPLY_TOOL_BY_TARGET_KIND[targetKind]
  if (!tool) {
    return { status: 'skipped', detail: `${targetKind} plans need review in the xNet app` }
  }
  try {
    const result = (await services.aiSurface.callTool(tool, { plan, confirmApply: true })) as {
      applied?: boolean
      validation?: { errors?: string[] }
    }
    return result.applied
      ? { status: 'applied', detail: `${targetKind} plan applied` }
      : { status: 'failed', detail: result.validation?.errors?.join('; ') ?? 'not applied' }
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
  /** Diagnostics sink; injectable so tests can read what the user would see. */
  warn?: (message: string) => void
}

/**
 * How the search was answered, as a line the agent reads before the results.
 *
 * `index` comes from the AI surface (`fts5` vs `scan`); `tier` from the
 * retrieval factory. They can disagree — a `bm25-graph` lane whose FTS probe
 * failed answers `scan` — and when they do, the weaker one is the truth.
 */
function provenanceLine(
  tier: string,
  result: Record<string, unknown>
): { line: string; degraded: boolean } {
  const degraded = result.degraded === true
  const effective = degraded ? 'scan' : tier
  const parts = [`tier\t${effective}`]
  if (typeof result.index === 'string') parts.push(`index\t${result.index}`)
  if (degraded && typeof result.degradedReason === 'string') {
    parts.push(`degraded\t${result.degradedReason}`)
  }
  return { line: parts.join('\n'), degraded }
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
  const { line, degraded } = provenanceLine(services.retrieval.tier, result)

  // stderr, always, and before anything else: a degradation notice on stdout
  // is one `| head` away from vanishing, and an agent that loses it will state
  // "no such node" with total confidence (exploration 0415).
  if (degraded) {
    const warn = options.warn ?? ((message: string) => process.stderr.write(`${message}\n`))
    warn(
      typeof result.notice === 'string'
        ? result.notice
        : 'Search ran degraded; results may be incomplete.'
    )
  }

  if (options.format === 'json') {
    return JSON.stringify({ ...result, tier: degraded ? 'scan' : services.retrieval.tier })
  }
  // jsonl stays one-object-per-line so `jq` keeps working; its provenance rides
  // stderr alone.
  if (options.format === 'jsonl') return results.map((row) => JSON.stringify(row)).join('\n')

  const compact = results.map((row) => ({
    id: row.id,
    schemaId: row.schemaId,
    title: row.title,
    snippet: row.snippet
  }))
  if (results.length === 0) return `${line}\nno results`
  if (options.format === 'md') return `${line}\n\n${toMarkdownTable(compact)}`
  return `${line}\n${toTsv(compact).trimEnd()}`
}

// ─── recall ──────────────────────────────────────────────────────────────────

export type RecallOptions = {
  text: string
  budget?: number
  hops?: number
  limit?: number
  format?: AgentOutputFormat
  warn?: (message: string) => void
}

/**
 * `xnet recall` — one call that replaces "search, then read eight nodes".
 *
 * The difference from `search` is not the ranking, it is the shape: this
 * returns a *budgeted pack* whose hits each carry the graph path they were
 * reached by, plus the ids it dropped for budget so the agent can pull them
 * just-in-time instead of the CLI guessing (exploration 0415).
 */
export async function runRecall(
  services: AgentCliServices,
  options: RecallOptions
): Promise<string> {
  const result = await services.retrieval.recall(options.text, {
    ...(options.budget !== undefined ? { maxTokens: options.budget } : {}),
    ...(options.hops !== undefined ? { maxHops: options.hops } : {}),
    ...(options.limit !== undefined ? { maxEntries: options.limit } : {})
  })

  if (result.degraded) {
    const warn = options.warn ?? ((message: string) => process.stderr.write(`${message}\n`))
    warn(result.notice ?? 'Recall ran degraded; results may be incomplete.')
  }

  if (options.format === 'json') return JSON.stringify(result)
  if (options.format === 'jsonl') return result.items.map((item) => JSON.stringify(item)).join('\n')

  const stats = result.stats
  const header =
    `tier\t${result.tier}\t` +
    `entries=${stats.entries} expanded=${stats.expanded} denied=${stats.denied} ` +
    `dropped=${stats.dropped} tokens=${stats.tokens}`

  const rows = result.items.map((item) => ({
    id: item.nodeId,
    title: item.title,
    // The path is the provenance the agent quotes back to the user; without it
    // a graph-reached hit looks like a keyword hit that simply matched oddly.
    path: item.pathLabel,
    snippet: item.snippet.replace(/\s+/g, ' ').slice(0, 200)
  }))

  const body =
    rows.length === 0
      ? 'no results'
      : options.format === 'md'
        ? toMarkdownTable(rows)
        : toTsv(rows).trimEnd()

  const expandable =
    result.expandable.length > 0
      ? `\nexpandable\t${result.expandable.map((ref) => ref.nodeId).join(', ')}`
      : ''

  return `${header}\n${body}${expandable}`
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

/**
 * Answer the queries a priming pass recorded.
 *
 * `recall` goes through the retrieval factory, so a script gets the same graph
 * walk and the same provenance paths the `recall` verb does — the point of the
 * code-execution lane is that it should not be a weaker view of the workspace
 * than the tool lane, only a cheaper one.
 */
export async function resolveScriptContext(
  services: AgentCliServices,
  requested: AgentRequestedContext
): Promise<AgentResolvedContext> {
  const recall = new Map<string, AgentRecallHit[]>()
  for (const query of requested.recall) {
    const pack = await services.retrieval.recall(query)
    recall.set(
      query,
      pack.items.map((item) => ({
        id: item.nodeId,
        title: item.title,
        path: item.pathLabel,
        hops: item.hops,
        snippet: item.snippet
      }))
    )
  }

  const graph = new Map<string, AgentGraphEdge[]>()
  for (const request of requested.graph) {
    graph.set(
      graphRequestKey(request.nodeId, request.hops),
      await expandFrom(services, request.nodeId, request.hops)
    )
  }

  return { recall, graph }
}

/** Walk typed relations out of one node, breadth-first, up to `hops`. */
async function expandFrom(
  services: AgentCliServices,
  nodeId: string,
  hops: number
): Promise<AgentGraphEdge[]> {
  const edges: AgentGraphEdge[] = []
  const seen = new Set<string>([nodeId])
  let frontier = [nodeId]
  for (let depth = 1; depth <= Math.max(0, hops); depth++) {
    const next: string[] = []
    for (const id of frontier) {
      const node = await services.store.get(id)
      if (!node || node.deleted) continue
      const schema = await services.schemas.get(node.schemaId).catch(() => null)
      const relationFields = schema
        ? Object.entries(schema.properties)
            .filter(
              ([, value]) =>
                typeof value === 'object' &&
                value !== null &&
                (value as { type?: unknown }).type === 'relation'
            )
            .map(([name]) => name)
        : []
      for (const field of relationFields) {
        const value = node.properties[field]
        for (const target of Array.isArray(value) ? value : [value]) {
          if (typeof target !== 'string' || target.length === 0 || seen.has(target)) continue
          seen.add(target)
          next.push(target)
          edges.push({ id: target, relation: field, direction: 'outbound', hops: depth })
        }
      }
    }
    frontier = next
    if (frontier.length === 0) break
  }
  return edges
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

  const sandbox = new ScriptSandbox({ timeoutMs: options.timeoutMs ?? 5000 })

  // Two passes (exploration 0415). The sandbox bans `await` on purpose, so
  // `api.recall`/`api.graph` cannot be async — instead a priming run records
  // what the script asks for, the host resolves it out here where awaiting is
  // allowed, and the real run gets the answers. The priming run's proposals are
  // discarded: only the second session's plan is kept.
  const priming = createAgentScriptContext({
    nodes: flatNodes,
    ...(currentNode ? { node: currentNode } : {})
  })
  await sandbox.execute(code, priming.context).catch(() => undefined)
  const resolved = await resolveScriptContext(services, priming.getRequestedContext())

  const session = createAgentScriptContext({
    nodes: flatNodes,
    ...(currentNode ? { node: currentNode } : {}),
    resolved
  })
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
  const print = (text: string): void => {
    console.log(text)
  }

  /**
   * Resolve services via the backend ladder, run `fn`, and always dispose the
   * backend afterwards (closing the SQLite client in local mode).
   */
  /**
   * Connect to a warm `xnet serve`, or return `null` when there is none.
   *
   * `$XNET_SESSION=0` opts out entirely. A *stale* daemon is not opted out of:
   * `connectSession` throws on a version mismatch, and that throw propagates —
   * quietly falling back to the cold path would discard the one signal that
   * says the answer you were about to get was wrong.
   */
  const tryConnectSession = async (
    options: AgentCommandOptions
  ): Promise<SessionClient | null> => {
    if (process.env.XNET_SESSION === '0') return null
    return connectSession({
      target: sessionTargetFor(options),
      version: SESSION_CLI_VERSION
    })
  }

  const withServices = async (
    options: AgentCommandOptions,
    fn: (services: AgentCliServices) => Promise<string>
  ): Promise<void> => {
    const services = await createServices(options)
    try {
      print(await fn(services))
    } finally {
      await services.dispose?.()
    }
  }

  /**
   * Read verbs: ask a warm `xnet serve` first, fall back to a cold process.
   *
   * No daemon is the ordinary case and stays silent. A daemon that is present
   * but stale, or that dies mid-request, throws — the cold path is *not* a
   * fallback for those, because retrying quietly would hide exactly the
   * failure we bothered to detect (exploration 0415).
   */
  const withWarmServices = async (
    options: AgentCommandOptions,
    op: 'search' | 'recall' | 'query' | 'get',
    params: Record<string, unknown>,
    fn: (services: AgentCliServices) => Promise<string>
  ): Promise<void> => {
    const client = await tryConnectSession(options)
    if (client) {
      try {
        const result = (await client.call(op, params)) as {
          output: string
          warnings?: string[]
        }
        for (const warning of result.warnings ?? []) process.stderr.write(`${warning}\n`)
        print(result.output)
        return
      } finally {
        client.close()
      }
    }
    await withServices(options, fn)
  }

  /** Flags shared by every agent verb: which backend to talk to. */
  const withBackendFlags = (command: Command): Command =>
    command
      .option('--api-url <url>', 'xNet local API URL (default http://127.0.0.1:31415)')
      .option('--db <path>', 'Standalone SQLite store (skips the app; also $XNET_DB)')
      .option('--agent <name>', 'Sign local-store writes as an enrolled agent passport')
      .option('--key <hex>', 'Ed25519 signing key for the local store ($XNET_SIGNING_KEY)')

  withBackendFlags(
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
  ).action(async (options) => {
    await withServices(options, (services) => runCheckout(services, options))
  })

  withBackendFlags(
    program
      .command('status')
      .description('List pending plans and conflicts for a checkout')
      .option('-d, --dir <path>', 'Checkout directory', '.')
      .option('--format <format>', 'Output format: tsv|json', 'tsv')
  ).action(async (options) => {
    await withServices(options, (services) => runStatus(services, options))
  })

  withBackendFlags(
    program
      .command('commit')
      .description('Lift file edits into mutation plans; --apply applies them')
      .option('-d, --dir <path>', 'Checkout directory', '.')
      .option('--apply', 'Apply valid plans through the plan pipeline')
      .option('--actor <actor>', 'Actor recorded on plans', 'xnet-cli')
  ).action(async (options) => {
    await withServices({ ...options, forWrites: Boolean(options.apply) }, (services) =>
      runCommit(services, options)
    )
  })

  withBackendFlags(
    program
      .command('search <text>')
      .description('Ranked workspace search (TSV: id, schema, title, snippet)')
      .option('-s, --schema <iri>', 'Schema IRI filter')
      .option('-l, --limit <n>', 'Max results', parseIntOption)
      .option('--format <format>', 'Output format: tsv|jsonl|json', 'tsv')
  ).action(async (text, options) => {
    await withWarmServices(options, 'search', { ...options, text }, (services) =>
      runSearch(services, { ...options, text })
    )
  })

  registerMemoryCommands(program, { withServices, withBackendFlags, parseIntOption })

  withBackendFlags(
    program
      .command('recall <text>')
      .description('Budgeted context pack with provenance paths (TSV: id, title, path, snippet)')
      .option('-b, --budget <tokens>', 'Token budget for the pack', parseIntOption)
      .option('--hops <n>', 'Graph expansion depth (0 disables the graph stage)', parseIntOption)
      .option('-l, --limit <n>', 'Max entry nodes before expansion', parseIntOption)
      .option('--format <format>', 'Output format: tsv|md|jsonl|json', 'tsv')
  ).action(async (text, options) => {
    await withWarmServices(options, 'recall', { ...options, text }, (services) =>
      runRecall(services, { ...options, text })
    )
  })

  withBackendFlags(
    program
      .command('query <databaseId>')
      .description('Query database rows (TSV by default)')
      .option('-w, --where <expr...>', 'Filters as field=value')
      .option('-l, --limit <n>', 'Max rows', parseIntOption)
      .option('-o, --offset <n>', 'Row offset', parseIntOption)
      .option('--format <format>', 'Output format: tsv|jsonl|json', 'tsv')
      .option('--detailed', 'Include descriptor and query plan in json output')
  ).action(async (databaseId, options) => {
    await withServices(options, (services) => runQuery(services, { ...options, databaseId }))
  })

  const db = program.command('db').description('Direct node and row access')

  withBackendFlags(
    db
      .command('get <nodeId>')
      .description('Read a node as compact JSON')
      .option('--detailed', 'Include full node record')
  ).action(async (nodeId, options) => {
    await withServices(options, (services) => runDbGet(services, { ...options, nodeId }))
  })

  withBackendFlags(
    db
      .command('set <databaseId> <rowId> <assignments...>')
      .description('Update row properties through the plan/apply pipeline')
      .option('--plan-only', 'Print the mutation plan without applying')
      .option('--actor <actor>', 'Actor recorded on the plan', 'xnet-cli')
  ).action(async (databaseId, rowId, assignments, options) => {
    await withServices({ ...options, forWrites: !options.planOnly }, (services) =>
      runDbSet(services, {
        databaseId,
        rowId,
        assignments,
        actor: options.actor,
        planOnly: options.planOnly
      })
    )
  })

  withBackendFlags(
    program
      .command('run <file>')
      .description('Run a sandboxed agent script with the @xnet/agent-api surface')
      .option('-s, --schema <iri>', 'Preload nodes of this schema')
      .option('-l, --limit <n>', 'Max nodes to preload', parseIntOption)
      .option('-n, --node <id>', 'Current node id')
      .option('-d, --dir <path>', 'Checkout directory for proposal plans')
      .option('--actor <actor>', 'Actor recorded on proposal plans', 'xnet-cli-script')
  ).action(async (file, options) => {
    await withServices(options, (services) => runScript(services, { ...options, file }))
  })

  withBackendFlags(
    program
      .command('daemon')
      .description('Watch a checkout and lift saves into mutation plans')
      .option('-d, --dir <path>', 'Checkout directory', '.')
      .option('--poll', 'Use interval polling instead of fs.watch')
      .option('--apply', 'Auto-apply valid plans (watcher autocommit)')
      .option('--actor <actor>', 'Actor recorded on plans', 'xnet-daemon')
  ).action(async (options) => {
    const services = await createServices({ ...options, forWrites: Boolean(options.apply) })
    const handle = startDaemon(services, options)
    console.log(`watching ${resolve(options.dir)} (ctrl-c to stop)`)
    process.on('SIGINT', () => {
      handle.close()
      void services.dispose?.().finally(() => process.exit(0))
    })
  })

  withBackendFlags(
    program
      .command('skill')
      .description('Print the cross-harness xNet SKILL.md')
      // The skill is static; what the agent remembers is not. `--memories`
      // appends the top-k memory preamble so a fresh session starts knowing
      // what the last one learned (exploration 0415).
      .option('--memories', "Append what xNet remembers about this workspace")
      .option('--no-memories', 'Print the skill alone')
  ).action(async (options) => {
    if (!options.memories) {
      print(XNET_AGENT_SKILL_MD)
      return
    }
    await withServices(options, async (services) => {
      const preamble = await renderMemoryPreamble(services)
      return preamble ? `${XNET_AGENT_SKILL_MD}\n${preamble}\n` : XNET_AGENT_SKILL_MD
    })
  })
}

function parseIntOption(value: string): number {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed)) throw new Error(`Invalid number: ${value}`)
  return parsed
}
