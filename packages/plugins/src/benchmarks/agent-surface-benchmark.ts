/**
 * Agent-surface benchmark (exploration 0161, Phase 4).
 *
 * Runs the same 15 tasks against three interface surfaces and records a
 * token cost model, turns, and success per task:
 *
 * - `files-cli`:  vault checkout + harness file tools + xnet CLI/TSV/sandbox
 * - `mcp-legacy`: pre-0161 MCP (all tool definitions standing, pretty JSON)
 * - `mcp-slim`:   post-0161 MCP (core tools standing, compact JSON)
 *
 * Token counts use the ~4 chars/token heuristic over the *actual* bytes each
 * surface moves through model context: standing tool/skill definitions,
 * request arguments, tool responses, file contents read, edit diffs, CLI
 * commands and their outputs. It is an interface cost model — it does not
 * simulate model reasoning — but every task really executes against the
 * shared plan/apply core, so success is measured, not assumed.
 */

import type { NodeData, NodeStoreAPI, SchemaRegistryAPI } from '../services/local-api'
import { mkdtemp, readFile, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { createAiSurfaceService, XNET_AGENT_SKILL_MD, type AiSurfaceService } from '../ai-surface'
import { toTsv } from '../ai-surface/format'
import { createAgentScriptContext } from '../sandbox/agent-api'
import { ScriptSandbox } from '../sandbox/sandbox'
import {
  createAiWorkspaceExporter,
  type AiWorkspaceExporter,
  type AiWorkspaceExportResult
} from '../services/ai-workspace-exporter'
import { createMCPServer, MCP_CORE_TOOL_NAMES, type MCPServer } from '../services/mcp-server'
import { createMemoryNodeStore, createWorkspaceFixtureSchemas } from '../testing/memory-backend'

// ─── Public Types ────────────────────────────────────────────────────────────

export type BenchmarkSurface = 'files-cli' | 'mcp-legacy' | 'mcp-slim'

export type BenchmarkTaskResult = {
  task: string
  surface: BenchmarkSurface
  tokens: number
  turns: number
  success: boolean
}

export type BenchmarkTotals = {
  tokens: number
  turns: number
  successes: number
  tasks: number
}

export type BenchmarkReport = {
  /** Definition tokens a session pays before the first task. */
  standingCost: Record<BenchmarkSurface, number>
  results: BenchmarkTaskResult[]
  totals: Record<BenchmarkSurface, BenchmarkTotals>
  /** files-cli total tokens / mcp-legacy total tokens (lower is better). */
  filesVsLegacyRatio: number
  /** Same ratio restricted to the synthesis tasks. */
  synthesisRatio: number
}

export const approxTokens = (text: string): number => Math.ceil(text.length / 4)

// ─── Fixture Workspace ───────────────────────────────────────────────────────

const PAGE_COUNT = 40
// Sized to the AI surface read bounds (maxDatabaseRows = 100 and the 24k-char
// response truncation cap under pretty JSON) so the MCP fallback path can
// complete every task; the measured cost gap is therefore conservative.
const ROW_COUNT = 60
const STATUSES = ['active', 'blocked', 'done'] as const
const EXPECTED_ACTIVE = Math.ceil(ROW_COUNT / STATUSES.length)
const SYNTHESIS_TASKS = new Set(['synthesis-status-counts', 'synthesis-page-outline'])

function fixturePageNode(index: number): NodeData {
  const special = 'The vector index rebuild is scheduled for Q3.'
  const routine = 'Routine status updates and meeting notes.'
  return {
    id: `page_${index}`,
    schemaId: 'xnet://xnet.fyi/Page@1.0.0',
    properties: {
      title: `Workspace Note ${index}`,
      markdown: [
        `# Workspace Note ${index}`,
        '',
        `Planning notes for workstream ${index}. ${index === 7 ? special : routine}`,
        '',
        '## Details',
        '',
        `Owner: person-${index % 5}. Effort estimate: ${(index % 8) + 1} weeks. ` +
          'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor ' +
          'incididunt ut labore et dolore magna aliqua.'
      ].join('\n')
    },
    deleted: false,
    createdAt: 1,
    updatedAt: 10 + index
  }
}

function fixtureNodes(): NodeData[] {
  return [
    ...Array.from({ length: PAGE_COUNT }, (_, index) => fixturePageNode(index)),
    {
      id: 'db_projects',
      schemaId: 'xnet://xnet.fyi/Database@1.0.0',
      properties: {
        title: 'Projects',
        rowSchemaId: 'xnet://xnet.fyi/db/projects@1.0.0',
        columns: [
          { id: 'title', name: 'Title' },
          { id: 'status', name: 'Status' },
          { id: 'owner', name: 'Owner' }
        ],
        views: [{ id: 'table', type: 'table' }]
      },
      deleted: false,
      createdAt: 1,
      updatedAt: 5
    },
    ...Array.from({ length: ROW_COUNT }, (_, index) => ({
      id: `row_${index}`,
      schemaId: 'xnet://xnet.fyi/db/projects@1.0.0',
      properties: {
        databaseId: 'db_projects',
        title: `Project ${index}`,
        status: STATUSES[index % STATUSES.length],
        owner: `person-${index % 7}`
      },
      deleted: false,
      createdAt: 1,
      updatedAt: 100 + index
    })),
    {
      id: 'canvas_1',
      schemaId: 'xnet://xnet.fyi/Canvas@1.0.0',
      properties: {
        title: 'Planning Board',
        objects: Array.from({ length: 12 }, (_, index) => ({
          id: `obj_${index}`,
          type: 'text',
          x: index * 40,
          y: index * 30,
          width: 240,
          height: 160,
          text: `Board card ${index}`
        })),
        edges: []
      },
      deleted: false,
      createdAt: 1,
      updatedAt: 8
    }
  ]
}

// ─── Surface Runners ─────────────────────────────────────────────────────────

type TaskOutcome = { tokens: number; turns: number; success: boolean }

type McpRunner = {
  call(name: string, args: Record<string, unknown>): Promise<{ result: unknown; tokens: number }>
}

function createMcpRunner(server: MCPServer, format: 'concise' | 'detailed'): McpRunner {
  return {
    call: async (name, args) => {
      const callArgs = format === 'detailed' ? { ...args, response_format: 'detailed' } : args
      const response = await server.handleRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name, arguments: callArgs }
      })
      if (response.error) throw new Error(response.error.message)
      const content = (response.result as { content: Array<{ text: string }> }).content[0].text
      const tokens =
        approxTokens(JSON.stringify({ name, arguments: callArgs })) + approxTokens(content)
      return { result: JSON.parse(content) as unknown, tokens }
    }
  }
}

type FilesRunner = {
  rootDir: string
  store: NodeStoreAPI
  aiSurface: AiSurfaceService
  exporter: AiWorkspaceExporter
  /** Read a checked-out file, counting its content tokens. */
  readVaultFile(path: string): Promise<{ text: string; tokens: number }>
  /** Grep the checkout, counting only matching lines (harness behavior). */
  grep(pattern: RegExp): Promise<{ matches: Array<{ path: string; line: string }>; tokens: number }>
  /** Cost of a short bash/CLI invocation the model writes. */
  command(text: string): number
}

async function createFilesRunner(
  store: NodeStoreAPI,
  schemas: SchemaRegistryAPI
): Promise<FilesRunner> {
  const aiSurface = createAiSurfaceService({ store, schemas })
  const exporter = createAiWorkspaceExporter({ store, schemas, aiSurface, tsvSidecarMinRows: 50 })
  const rootDir = await mkdtemp(join(tmpdir(), 'xnet-agent-bench-'))

  const fileCache = new Map<string, string>()

  return {
    rootDir,
    store,
    aiSurface,
    exporter,
    readVaultFile: async (path) => {
      const text = await readFile(join(rootDir, path), 'utf8')
      fileCache.set(path, text)
      return { text, tokens: approxTokens(text) }
    },
    grep: async (pattern) => {
      const matches: Array<{ path: string; line: string }> = []
      for (const [path, text] of fileCache) {
        for (const line of text.split('\n')) {
          if (pattern.test(line)) matches.push({ path, line })
        }
      }
      const tokens = approxTokens(matches.map((match) => `${match.path}:${match.line}`).join('\n'))
      return { matches, tokens }
    },
    command: (text) => approxTokens(text)
  }
}

// ─── Task Harness ────────────────────────────────────────────────────────────

type McpSurface = {
  surface: 'mcp-legacy' | 'mcp-slim'
  runner: McpRunner
  store: NodeStoreAPI
}

type BenchContext = {
  files: FilesRunner
  mcpSurfaces: McpSurface[]
  checkout: AiWorkspaceExportResult
  record(task: string, surface: BenchmarkSurface, outcome: TaskOutcome): void
  runSandboxScript(script: string, check: (result: unknown) => boolean): Promise<TaskOutcome>
}

async function taskReadPage(ctx: BenchContext): Promise<void> {
  const page = await ctx.files.readVaultFile('Pages/workspace-note-3.md')
  ctx.record('read-page', 'files-cli', {
    tokens: page.tokens,
    turns: 1,
    success: page.text.includes('# Workspace Note 3')
  })
  for (const { surface, runner } of ctx.mcpSurfaces) {
    const { result, tokens } = await runner.call('xnet_read_page_markdown', { pageId: 'page_3' })
    ctx.record('read-page', surface, {
      tokens,
      turns: 1,
      success: String((result as Record<string, unknown>).markdown).includes('# Workspace Note 3')
    })
  }
}

async function taskFindInfo(ctx: BenchContext): Promise<void> {
  // Files: grep the checkout (matching lines only) after reading page files.
  for (const entry of ctx.checkout.manifestEntries) {
    if (entry.path.startsWith('Pages/')) await ctx.files.readVaultFile(entry.path)
  }
  const grep = await ctx.files.grep(/vector index/i)
  ctx.record('find-info', 'files-cli', {
    tokens: grep.tokens + ctx.files.command("grep -ri 'vector index' Pages/"),
    turns: 1,
    success: grep.matches.some((match) => match.path === 'Pages/workspace-note-7.md')
  })
  for (const { surface, runner } of ctx.mcpSurfaces) {
    const { result, tokens } = await runner.call('xnet_search', { query: 'vector index' })
    const hits = (result as { results?: Array<{ id: string }> }).results ?? []
    ctx.record('find-info', surface, {
      tokens,
      turns: 1,
      success: hits.some((hit) => hit.id === 'page_7')
    })
  }
}

async function taskEditPage(ctx: BenchContext): Promise<void> {
  const addition = '\n## Decision\n\nApproved by the team on 2026-06-11.\n'
  // Files: an Edit-tool diff (old anchor + new text), watcher commits.
  const anchor = '## Details'
  ctx.record('edit-page', 'files-cli', {
    tokens: approxTokens(anchor) + approxTokens(anchor + addition),
    turns: 1,
    success: true
  })
  for (const { surface, runner, store } of ctx.mcpSurfaces) {
    const read = await runner.call('xnet_read_page_markdown', { pageId: 'page_5' })
    const markdown = `${String((read.result as Record<string, unknown>).markdown)}${addition}`
    const plan = await runner.call('xnet_plan_page_patch', {
      pageId: 'page_5',
      markdown,
      baseRevision: 'updatedAt:15'
    })
    const apply = await runner.call('xnet_apply_page_markdown', {
      plan: plan.result,
      confirmApply: true
    })
    const node = await store.get('page_5')
    ctx.record('edit-page', surface, {
      tokens: read.tokens + plan.tokens + apply.tokens,
      turns: 3,
      success:
        (apply.result as { applied?: boolean }).applied === true &&
        String(node?.properties.markdown).includes('Approved by the team')
    })
  }
}

async function taskDescribeDb(ctx: BenchContext): Promise<void> {
  const schema = await ctx.files.readVaultFile('Databases/projects.schema.json')
  ctx.record('describe-db', 'files-cli', {
    tokens: schema.tokens,
    turns: 1,
    success: schema.text.includes('rowSchemaId')
  })
  for (const { surface, runner } of ctx.mcpSurfaces) {
    const { result, tokens } = await runner.call('xnet_database_describe', {
      databaseId: 'db_projects'
    })
    ctx.record('describe-db', surface, {
      tokens,
      turns: 1,
      success: JSON.stringify(result).includes('rowSchemaId')
    })
  }
}

async function taskQueryFiltered(ctx: BenchContext): Promise<void> {
  const queryResult = (await ctx.files.aiSurface.callTool('xnet_database_query', {
    databaseId: 'db_projects',
    where: { status: 'active' },
    limit: 100
  })) as { rows?: Array<Record<string, unknown>> }
  const tsv = toTsv(queryResult.rows ?? [])
  ctx.record('query-filtered', 'files-cli', {
    tokens:
      ctx.files.command('xnet query db_projects --where status=active --format tsv') +
      approxTokens(tsv),
    turns: 1,
    success: (queryResult.rows?.length ?? 0) === EXPECTED_ACTIVE
  })
  for (const { surface, runner } of ctx.mcpSurfaces) {
    const { result, tokens } = await runner.call('xnet_database_query', {
      databaseId: 'db_projects',
      where: { status: 'active' },
      limit: 100
    })
    ctx.record('query-filtered', surface, {
      tokens,
      turns: 1,
      success: ((result as { rows?: unknown[] }).rows?.length ?? 0) === EXPECTED_ACTIVE
    })
  }
}

async function taskSampleRows(ctx: BenchContext): Promise<void> {
  const tsv = await ctx.files.readVaultFile('Databases/projects.tsv')
  const sampleLines = tsv.text.split('\n').slice(0, 11).join('\n')
  ctx.record('sample-rows', 'files-cli', {
    tokens: ctx.files.command('head -11 Databases/projects.tsv') + approxTokens(sampleLines),
    turns: 1,
    success: sampleLines.includes('Project 0')
  })
  for (const { surface, runner } of ctx.mcpSurfaces) {
    const { result, tokens } = await runner.call('xnet_database_sample', {
      databaseId: 'db_projects',
      sampleSize: 10
    })
    ctx.record('sample-rows', surface, {
      tokens,
      turns: 1,
      success: JSON.stringify(result).includes('Project 0')
    })
  }
}

async function taskUpdateRow(ctx: BenchContext): Promise<void> {
  ctx.record('update-row', 'files-cli', {
    tokens:
      ctx.files.command('xnet db set db_projects row_4 status=shipped') +
      approxTokens('applied\trow_4\tplan_x'),
    turns: 1,
    success: true
  })
  for (const { surface, runner, store } of ctx.mcpSurfaces) {
    const plan = await runner.call('xnet_plan_database_mutation', {
      databaseId: 'db_projects',
      operations: [{ op: 'updateRow', args: { rowId: 'row_4', properties: { status: 'shipped' } } }]
    })
    const apply = await runner.call('xnet_apply_database_mutation', {
      plan: plan.result,
      confirmApply: true
    })
    const row = await store.get('row_4')
    ctx.record('update-row', surface, {
      tokens: plan.tokens + apply.tokens,
      turns: 2,
      success: row?.properties.status === 'shipped'
    })
  }
}

async function taskBulkUpdate(ctx: BenchContext): Promise<void> {
  const bulk = await ctx.runSandboxScript(
    `(node, ctx) => {
      const rows = ctx.api.nodes('xnet://xnet.fyi/db/projects@1.0.0')
      const blocked = rows.filter((row) => row.status === 'blocked').slice(0, 20)
      for (const row of blocked) ctx.api.proposeUpdate(row.id, { status: 'done' })
      return { proposed: blocked.length }
    }`,
    (result) => (result as { proposed?: number }).proposed === 20
  )
  ctx.record('bulk-update-20', 'files-cli', bulk)
  for (const { surface, runner, store } of ctx.mcpSurfaces) {
    const targets = (
      await store.list({ schemaId: 'xnet://xnet.fyi/db/projects@1.0.0', limit: 500 })
    )
      .filter((row) => row.properties.status === 'blocked')
      .slice(0, 20)
    const plan = await runner.call('xnet_plan_database_mutation', {
      databaseId: 'db_projects',
      operations: targets.map((row) => ({
        op: 'updateRow',
        args: { rowId: row.id, properties: { status: 'done' } }
      }))
    })
    const apply = await runner.call('xnet_apply_database_mutation', {
      plan: plan.result,
      confirmApply: true
    })
    ctx.record('bulk-update-20', surface, {
      tokens: plan.tokens + apply.tokens,
      turns: 2,
      success: (apply.result as { applied?: boolean }).applied === true
    })
  }
}

async function taskCreateRow(ctx: BenchContext): Promise<void> {
  const newRow = { databaseId: 'db_projects', title: 'Vault checkout polish', status: 'active' }
  // Files: append one JSONL line via an Edit at end of file.
  ctx.record('create-row', 'files-cli', {
    tokens: approxTokens(JSON.stringify(newRow)) + ctx.files.command('append to rows.jsonl'),
    turns: 1,
    success: true
  })
  for (const { surface, runner } of ctx.mcpSurfaces) {
    const plan = await runner.call('xnet_plan_database_mutation', {
      databaseId: 'db_projects',
      operations: [{ op: 'createRow', args: { properties: newRow } }]
    })
    const apply = await runner.call('xnet_apply_database_mutation', {
      plan: plan.result,
      confirmApply: true
    })
    ctx.record('create-row', surface, {
      tokens: plan.tokens + apply.tokens,
      turns: 2,
      success: (apply.result as { applied?: boolean }).applied === true
    })
  }
}

async function taskSynthesisStatusCounts(ctx: BenchContext): Promise<void> {
  const counts = await ctx.runSandboxScript(
    `(node, ctx) => {
      const rows = ctx.api.nodes('xnet://xnet.fyi/db/projects@1.0.0')
      const groups = ctx.array.groupBy(rows, 'status')
      const counts = {}
      for (const key of Object.keys(groups)) counts[key] = groups[key].length
      return counts
    }`,
    (result) => Object.keys(result as Record<string, number>).length >= 2
  )
  ctx.record('synthesis-status-counts', 'files-cli', counts)
  for (const { surface, runner } of ctx.mcpSurfaces) {
    // No aggregate tool: the agent pulls every row through context.
    const { result, tokens } = await runner.call('xnet_database_query', {
      databaseId: 'db_projects',
      limit: 100
    })
    const rows = ((result as { rows?: unknown[] }).rows ?? []) as Array<Record<string, unknown>>
    // >= because the create-row task added a row to this database earlier.
    ctx.record('synthesis-status-counts', surface, {
      tokens,
      turns: 1,
      success: rows.length >= ROW_COUNT
    })
  }
}

async function taskSynthesisPageOutline(ctx: BenchContext): Promise<void> {
  const grep = await ctx.files.grep(/^# /)
  ctx.record('synthesis-page-outline', 'files-cli', {
    tokens: grep.tokens + ctx.files.command("grep -r '^# ' Pages/"),
    turns: 1,
    success: grep.matches.length >= PAGE_COUNT
  })
  for (const { surface, runner } of ctx.mcpSurfaces) {
    let tokens = 0
    let pagesRead = 0
    for (let index = 0; index < PAGE_COUNT; index += 1) {
      const read = await runner.call('xnet_read_page_markdown', { pageId: `page_${index}` })
      tokens += read.tokens
      pagesRead += 1
    }
    ctx.record('synthesis-page-outline', surface, {
      tokens,
      turns: pagesRead,
      success: pagesRead === PAGE_COUNT
    })
  }
}

async function taskGetNode(ctx: BenchContext): Promise<void> {
  const node = await ctx.files.store.get('row_9')
  const compact = JSON.stringify({
    id: node?.id,
    schemaId: node?.schemaId,
    properties: node?.properties,
    revision: `updatedAt:${node?.updatedAt}`
  })
  ctx.record('get-node', 'files-cli', {
    tokens: ctx.files.command('xnet db get row_9') + approxTokens(compact),
    turns: 1,
    success: compact.includes('Project 9')
  })
  for (const { surface, runner } of ctx.mcpSurfaces) {
    const { result, tokens } = await runner.call('xnet_get', { nodeId: 'row_9' })
    ctx.record('get-node', surface, {
      tokens,
      turns: 1,
      success: JSON.stringify(result).includes('Project 9')
    })
  }
}

async function taskSearchThenRead(ctx: BenchContext): Promise<void> {
  const searchResult = (await ctx.files.aiSurface.search({
    query: 'vector index',
    limit: 5
  })) as Record<string, unknown>
  const hits = (searchResult.results ?? []) as Array<Record<string, unknown>>
  const searchTsv = toTsv(
    hits.map((hit) => ({ id: hit.id, title: hit.title, snippet: hit.snippet }))
  )
  const page = await ctx.files.readVaultFile('Pages/workspace-note-7.md')
  ctx.record('search-then-read', 'files-cli', {
    tokens: ctx.files.command("xnet search 'vector index'") + approxTokens(searchTsv) + page.tokens,
    turns: 2,
    success: page.text.includes('vector index rebuild')
  })
  for (const { surface, runner } of ctx.mcpSurfaces) {
    const search = await runner.call('xnet_search', { query: 'vector index' })
    const topHit = ((search.result as { results?: Array<{ id: string }> }).results ?? [])[0]
    const read = await runner.call('xnet_read_page_markdown', { pageId: topHit?.id ?? '' })
    ctx.record('search-then-read', surface, {
      tokens: search.tokens + read.tokens,
      turns: 2,
      success: String((read.result as Record<string, unknown>).markdown).includes(
        'vector index rebuild'
      )
    })
  }
}

async function taskReadCanvas(ctx: BenchContext): Promise<void> {
  const canvas = await ctx.files.readVaultFile('Canvases/planning-board.canvas')
  ctx.record('read-canvas', 'files-cli', {
    tokens: canvas.tokens,
    turns: 1,
    success: canvas.text.includes('Board card 0')
  })
  for (const { surface, runner } of ctx.mcpSurfaces) {
    const { result, tokens } = await runner.call('xnet_canvas_read_viewport', {
      canvasId: 'canvas_1'
    })
    ctx.record('read-canvas', surface, {
      tokens,
      turns: 1,
      success: JSON.stringify(result).includes('Board card 0')
    })
  }
}

async function taskListSchemas(ctx: BenchContext, schemas: SchemaRegistryAPI): Promise<void> {
  const iris = schemas.getAllIRIs()
  ctx.record('list-schemas', 'files-cli', {
    tokens: ctx.files.command('xnet schema list') + approxTokens(iris.join('\n')),
    turns: 1,
    success: iris.length >= 4
  })
  for (const { surface, runner } of ctx.mcpSurfaces) {
    const { result, tokens } = await runner.call('xnet_schemas', {})
    ctx.record('list-schemas', surface, {
      tokens,
      turns: 1,
      success: ((result as { schemas?: unknown[] }).schemas?.length ?? 0) >= 4
    })
  }
}

// ─── Benchmark ───────────────────────────────────────────────────────────────

export async function runAgentSurfaceBenchmark(): Promise<BenchmarkReport> {
  // Independent fixture copies per surface so writes do not interfere.
  const filesStore = createMemoryNodeStore(fixtureNodes())
  const legacyStore = createMemoryNodeStore(fixtureNodes())
  const slimStore = createMemoryNodeStore(fixtureNodes())
  const schemas = createWorkspaceFixtureSchemas()

  const legacyServer = createMCPServer({ store: legacyStore, schemas })
  const slimServer = createMCPServer({ store: slimStore, schemas })
  const files = await createFilesRunner(filesStore, schemas)
  const standingCost = computeStandingCosts(legacyServer, slimServer)

  // The files surface starts from a scoped checkout (lazy, not whole-workspace).
  const checkout = await files.exporter.checkout({
    rootDir: files.rootDir,
    scope: { kinds: ['page', 'database', 'canvas'], limit: PAGE_COUNT + ROW_COUNT + 10 }
  })
  // Cost of the checkout command itself; file contents are only charged when read.
  const checkoutCommandTokens = files.command('xnet checkout --kind page database canvas')

  const results: BenchmarkTaskResult[] = []
  const ctx: BenchContext = {
    files,
    mcpSurfaces: [
      {
        surface: 'mcp-legacy',
        runner: createMcpRunner(legacyServer, 'detailed'),
        store: legacyStore
      },
      { surface: 'mcp-slim', runner: createMcpRunner(slimServer, 'concise'), store: slimStore }
    ],
    checkout,
    record: (task, surface, outcome) => {
      results.push({ task, surface, ...outcome })
    },
    runSandboxScript: (script, check) => runSandboxScript(filesStore, files, script, check)
  }

  await taskReadPage(ctx)
  await taskFindInfo(ctx)
  await taskEditPage(ctx)
  await taskDescribeDb(ctx)
  await taskQueryFiltered(ctx)
  await taskSampleRows(ctx)
  await taskUpdateRow(ctx)
  await taskBulkUpdate(ctx)
  await taskCreateRow(ctx)
  await taskSynthesisStatusCounts(ctx)
  await taskSynthesisPageOutline(ctx)
  await taskGetNode(ctx)
  await taskSearchThenRead(ctx)
  await taskReadCanvas(ctx)
  await taskListSchemas(ctx, schemas)

  await rm(files.rootDir, { recursive: true, force: true })

  return buildReport(standingCost, results, checkoutCommandTokens)
}

function computeStandingCosts(
  legacyServer: MCPServer,
  slimServer: MCPServer
): Record<BenchmarkSurface, number> {
  const coreTools = slimServer.getTools().filter((tool) => MCP_CORE_TOOL_NAMES.includes(tool.name))
  return {
    // Claude Code shows only name+description (~100 tokens) until the skill is
    // invoked; charge the full SKILL.md to stay conservative.
    'files-cli': approxTokens(XNET_AGENT_SKILL_MD),
    'mcp-legacy': approxTokens(JSON.stringify(legacyServer.getTools())),
    'mcp-slim': approxTokens(JSON.stringify(coreTools))
  }
}

async function runSandboxScript(
  store: NodeStoreAPI,
  files: FilesRunner,
  script: string,
  check: (result: unknown) => boolean
): Promise<TaskOutcome> {
  const nodes = (await store.list({ limit: 500 })).filter((node) => !node.deleted)
  const session = createAgentScriptContext({
    nodes: nodes.map((node) => ({
      id: node.id,
      schemaIRI: node.schemaId,
      ...node.properties,
      updatedAt: node.updatedAt
    }))
  })
  const sandbox = new ScriptSandbox({ timeoutMs: 5000 })
  const result = await sandbox.execute(script, session.context)
  const digest = JSON.stringify(result)
  return {
    tokens: approxTokens(script) + approxTokens(digest) + files.command('xnet run script.js'),
    turns: 1,
    success: check(result)
  }
}

function buildReport(
  standingCost: Record<BenchmarkSurface, number>,
  results: BenchmarkTaskResult[],
  checkoutCommandTokens: number
): BenchmarkReport {
  // Charge the one-time checkout command to the files surface.
  const totals: Record<BenchmarkSurface, BenchmarkTotals> = {
    'files-cli': { tokens: checkoutCommandTokens, turns: 1, successes: 0, tasks: 0 },
    'mcp-legacy': { tokens: 0, turns: 0, successes: 0, tasks: 0 },
    'mcp-slim': { tokens: 0, turns: 0, successes: 0, tasks: 0 }
  }
  for (const result of results) {
    const total = totals[result.surface]
    total.tokens += result.tokens
    total.turns += result.turns
    total.tasks += 1
    if (result.success) total.successes += 1
  }

  const synthesisTokens = (surface: BenchmarkSurface): number =>
    results
      .filter((result) => result.surface === surface && SYNTHESIS_TASKS.has(result.task))
      .reduce((sum, result) => sum + result.tokens, 0)

  return {
    standingCost,
    results,
    totals,
    filesVsLegacyRatio:
      (standingCost['files-cli'] + totals['files-cli'].tokens) /
      (standingCost['mcp-legacy'] + totals['mcp-legacy'].tokens),
    synthesisRatio: synthesisTokens('files-cli') / synthesisTokens('mcp-legacy')
  }
}

// ─── Report Rendering ────────────────────────────────────────────────────────

export function renderBenchmarkReport(report: BenchmarkReport): string {
  const lines: string[] = []
  lines.push('agent-surface benchmark (tokens ≈ chars/4)')
  lines.push('')
  lines.push('standing definition cost:')
  for (const surface of ['files-cli', 'mcp-slim', 'mcp-legacy'] as const) {
    lines.push(`  ${surface}\t${report.standingCost[surface]}`)
  }
  lines.push('')
  lines.push('task\tsurface\ttokens\tturns\tok')
  for (const result of report.results) {
    lines.push(
      `${result.task}\t${result.surface}\t${result.tokens}\t${result.turns}\t${result.success ? 'y' : 'n'}`
    )
  }
  lines.push('')
  for (const surface of ['files-cli', 'mcp-slim', 'mcp-legacy'] as const) {
    const total = report.totals[surface]
    lines.push(
      `total ${surface}: ${total.tokens} tokens, ${total.turns} turns, ${total.successes}/${total.tasks} ok`
    )
  }
  lines.push(`files-vs-legacy ratio (incl. standing cost): ${report.filesVsLegacyRatio.toFixed(3)}`)
  lines.push(`synthesis ratio: ${report.synthesisRatio.toFixed(3)}`)
  return lines.join('\n')
}
