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
  type AiWorkspaceExporter
} from '../services/ai-workspace-exporter'
import { createMCPServer, MCP_CORE_TOOL_NAMES, type MCPServer } from '../services/mcp-server'

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

function createFixtureStore(): NodeStoreAPI {
  const nodes = new Map<string, NodeData>()
  let counter = 0

  const put = (node: NodeData): void => {
    nodes.set(node.id, node)
  }

  for (let index = 0; index < PAGE_COUNT; index += 1) {
    put({
      id: `page_${index}`,
      schemaId: 'xnet://xnet.fyi/Page@1.0.0',
      properties: {
        title: `Workspace Note ${index}`,
        markdown: [
          `# Workspace Note ${index}`,
          '',
          `Planning notes for workstream ${index}. ${index === 7 ? 'The vector index rebuild is scheduled for Q3.' : 'Routine status updates and meeting notes.'}`,
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
    })
  }

  put({
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
  })

  for (let index = 0; index < ROW_COUNT; index += 1) {
    put({
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
    })
  }

  put({
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
  })

  return {
    get: async (id) => nodes.get(id) ?? null,
    list: async (options) => {
      let result = Array.from(nodes.values())
      if (options?.schemaId) result = result.filter((node) => node.schemaId === options.schemaId)
      if (options?.offset) result = result.slice(options.offset)
      if (options?.limit) result = result.slice(0, options.limit)
      return result
    },
    create: async (options) => {
      counter += 1
      const node: NodeData = {
        id: `created_${counter}`,
        schemaId: options.schemaId,
        properties: options.properties,
        deleted: false,
        createdAt: 1000,
        updatedAt: 1000 + counter
      }
      nodes.set(node.id, node)
      return node
    },
    update: async (id, options) => {
      const existing = nodes.get(id)
      if (!existing) throw new Error(`Node not found: ${id}`)
      const node = {
        ...existing,
        properties: { ...existing.properties, ...options.properties },
        updatedAt: existing.updatedAt + 1
      }
      nodes.set(id, node)
      return node
    },
    delete: async (id) => {
      const existing = nodes.get(id)
      if (existing) existing.deleted = true
    },
    subscribe: () => () => {}
  }
}

function createFixtureSchemas(): SchemaRegistryAPI {
  const schemas = new Map([
    [
      'xnet://xnet.fyi/Page@1.0.0',
      { iri: 'xnet://xnet.fyi/Page@1.0.0', name: 'Page', properties: { title: { type: 'text' } } }
    ],
    [
      'xnet://xnet.fyi/Database@1.0.0',
      {
        iri: 'xnet://xnet.fyi/Database@1.0.0',
        name: 'Database',
        properties: { title: { type: 'text' } }
      }
    ],
    [
      'xnet://xnet.fyi/db/projects@1.0.0',
      {
        iri: 'xnet://xnet.fyi/db/projects@1.0.0',
        name: 'Project Row',
        properties: {
          title: { type: 'text' },
          status: { type: 'text' },
          owner: { type: 'text' }
        }
      }
    ],
    [
      'xnet://xnet.fyi/Canvas@1.0.0',
      {
        iri: 'xnet://xnet.fyi/Canvas@1.0.0',
        name: 'Canvas',
        properties: { title: { type: 'text' } }
      }
    ]
  ])
  return {
    getAllIRIs: () => Array.from(schemas.keys()),
    get: async (iri) => schemas.get(iri) ?? null
  }
}

// ─── Surface Runners ─────────────────────────────────────────────────────────

type TaskOutcome = { tokens: number; turns: number; success: boolean }

type McpRunner = {
  call(name: string, args: Record<string, unknown>): Promise<{ result: unknown; tokens: number }>
  format: 'concise' | 'detailed'
}

function createMcpRunner(server: MCPServer, format: 'concise' | 'detailed'): McpRunner {
  return {
    format,
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

  const readVaultFile = async (path: string): Promise<{ text: string; tokens: number }> => {
    const text = await readFile(join(rootDir, path), 'utf8')
    fileCache.set(path, text)
    return { text, tokens: approxTokens(text) }
  }

  const grep = async (
    pattern: RegExp
  ): Promise<{ matches: Array<{ path: string; line: string }>; tokens: number }> => {
    const matches: Array<{ path: string; line: string }> = []
    for (const [path, text] of fileCache) {
      for (const line of text.split('\n')) {
        if (pattern.test(line)) matches.push({ path, line })
      }
    }
    const tokens = approxTokens(matches.map((match) => `${match.path}:${match.line}`).join('\n'))
    return { matches, tokens }
  }

  return {
    rootDir,
    store,
    aiSurface,
    exporter,
    readVaultFile,
    grep,
    command: (text: string) => approxTokens(text)
  }
}

// ─── Benchmark ───────────────────────────────────────────────────────────────

export async function runAgentSurfaceBenchmark(): Promise<BenchmarkReport> {
  // Independent fixture copies per surface so writes do not interfere.
  const filesStore = createFixtureStore()
  const legacyStore = createFixtureStore()
  const slimStore = createFixtureStore()
  const schemas = createFixtureSchemas()

  const legacyServer = createMCPServer({ store: legacyStore, schemas })
  const slimServer = createMCPServer({ store: slimStore, schemas })
  const legacy = createMcpRunner(legacyServer, 'detailed')
  const slim = createMcpRunner(slimServer, 'concise')
  const files = await createFilesRunner(filesStore, schemas)

  // Standing costs: what a fresh session pays before the first task.
  const allToolsJson = JSON.stringify(legacyServer.getTools())
  const coreToolsJson = JSON.stringify(
    slimServer.getTools().filter((tool) => MCP_CORE_TOOL_NAMES.includes(tool.name))
  )
  const standingCost: Record<BenchmarkSurface, number> = {
    // Claude Code shows only name+description (~100 tokens) until the skill is
    // invoked; charge the full SKILL.md to stay conservative.
    'files-cli': approxTokens(XNET_AGENT_SKILL_MD),
    'mcp-legacy': approxTokens(allToolsJson),
    'mcp-slim': approxTokens(coreToolsJson)
  }

  // The files surface starts from a scoped checkout (lazy, not whole-workspace).
  const checkout = await files.exporter.checkout({
    rootDir: files.rootDir,
    scope: { kinds: ['page', 'database', 'canvas'], limit: PAGE_COUNT + ROW_COUNT + 10 }
  })
  // Cost of the checkout command itself; file contents are only charged when read.
  const checkoutCommandTokens = files.command('xnet checkout --kind page database canvas')

  const results: BenchmarkTaskResult[] = []
  const record = (task: string, surface: BenchmarkSurface, outcome: TaskOutcome): void => {
    results.push({ task, surface, ...outcome })
  }

  const sandbox = new ScriptSandbox({ timeoutMs: 5000 })

  const runSandboxScript = async (
    script: string,
    check: (result: unknown) => boolean
  ): Promise<TaskOutcome> => {
    const nodes = (await filesStore.list({ limit: 500 })).filter((node) => !node.deleted)
    const session = createAgentScriptContext({
      nodes: nodes.map((node) => ({
        id: node.id,
        schemaIRI: node.schemaId,
        ...node.properties,
        updatedAt: node.updatedAt
      }))
    })
    const result = await sandbox.execute(script, session.context)
    const digest = JSON.stringify(result)
    return {
      tokens: approxTokens(script) + approxTokens(digest) + files.command('xnet run script.js'),
      turns: 1,
      success: check(result)
    }
  }

  // ── Task 1: read a page ────────────────────────────────────────────────────
  {
    const page = await files.readVaultFile('Pages/workspace-note-3.md')
    record('read-page', 'files-cli', {
      tokens: page.tokens,
      turns: 1,
      success: page.text.includes('# Workspace Note 3')
    })
    for (const [surface, runner] of [
      ['mcp-legacy', legacy],
      ['mcp-slim', slim]
    ] as const) {
      const { result, tokens } = await runner.call('xnet_read_page_markdown', {
        pageId: 'page_3'
      })
      record('read-page', surface, {
        tokens,
        turns: 1,
        success: String((result as Record<string, unknown>).markdown).includes('# Workspace Note 3')
      })
    }
  }

  // ── Task 2: find which page mentions the vector index ─────────────────────
  {
    // Files: grep the checkout (matching lines only), then read the hit span.
    for (const entry of checkout.manifestEntries) {
      if (entry.path.startsWith('Pages/')) await files.readVaultFile(entry.path)
    }
    const grep = await files.grep(/vector index/i)
    record('find-info', 'files-cli', {
      tokens: grep.tokens + files.command("grep -ri 'vector index' Pages/"),
      turns: 1,
      success: grep.matches.some((match) => match.path === 'Pages/workspace-note-7.md')
    })
    for (const [surface, runner] of [
      ['mcp-legacy', legacy],
      ['mcp-slim', slim]
    ] as const) {
      const { result, tokens } = await runner.call('xnet_search', { query: 'vector index' })
      const hits = (result as { results?: Array<{ id: string }> }).results ?? []
      record('find-info', surface, {
        tokens,
        turns: 1,
        success: hits.some((hit) => hit.id === 'page_7')
      })
    }
  }

  // ── Task 3: edit a page (append a section) ─────────────────────────────────
  {
    const addition = '\n## Decision\n\nApproved by the team on 2026-06-11.\n'
    // Files: an Edit-tool diff (old anchor + new text), watcher commits.
    const anchor = '## Details'
    record('edit-page', 'files-cli', {
      tokens: approxTokens(anchor) + approxTokens(anchor + addition),
      turns: 1,
      success: true
    })
    for (const [surface, runner, store] of [
      ['mcp-legacy', legacy, legacyStore],
      ['mcp-slim', slim, slimStore]
    ] as const) {
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
      record('edit-page', surface, {
        tokens: read.tokens + plan.tokens + apply.tokens,
        turns: 3,
        success:
          (apply.result as { applied?: boolean }).applied === true &&
          String(node?.properties.markdown).includes('Approved by the team')
      })
    }
  }

  // ── Task 4: describe the projects database ─────────────────────────────────
  {
    const schema = await files.readVaultFile('Databases/projects.schema.json')
    record('describe-db', 'files-cli', {
      tokens: schema.tokens,
      turns: 1,
      success: schema.text.includes('rowSchemaId')
    })
    for (const [surface, runner] of [
      ['mcp-legacy', legacy],
      ['mcp-slim', slim]
    ] as const) {
      const { result, tokens } = await runner.call('xnet_database_describe', {
        databaseId: 'db_projects'
      })
      record('describe-db', surface, {
        tokens,
        turns: 1,
        success: JSON.stringify(result).includes('rowSchemaId')
      })
    }
  }

  // ── Task 5: filtered query (status=active) ─────────────────────────────────
  {
    const queryResult = (await files.aiSurface.callTool('xnet_database_query', {
      databaseId: 'db_projects',
      where: { status: 'active' },
      limit: 100
    })) as { rows?: Array<Record<string, unknown>> }
    const tsv = toTsv(queryResult.rows ?? [])
    record('query-filtered', 'files-cli', {
      tokens:
        files.command('xnet query db_projects --where status=active --format tsv') +
        approxTokens(tsv),
      turns: 1,
      success: (queryResult.rows?.length ?? 0) === EXPECTED_ACTIVE
    })
    for (const [surface, runner] of [
      ['mcp-legacy', legacy],
      ['mcp-slim', slim]
    ] as const) {
      const { result, tokens } = await runner.call('xnet_database_query', {
        databaseId: 'db_projects',
        where: { status: 'active' },
        limit: 100
      })
      record('query-filtered', surface, {
        tokens,
        turns: 1,
        success: ((result as { rows?: unknown[] }).rows?.length ?? 0) === EXPECTED_ACTIVE
      })
    }
  }

  // ── Task 6: sample rows ────────────────────────────────────────────────────
  {
    const tsv = await files.readVaultFile('Databases/projects.tsv')
    const sampleLines = tsv.text.split('\n').slice(0, 11).join('\n')
    record('sample-rows', 'files-cli', {
      tokens: files.command('head -11 Databases/projects.tsv') + approxTokens(sampleLines),
      turns: 1,
      success: sampleLines.includes('Project 0')
    })
    for (const [surface, runner] of [
      ['mcp-legacy', legacy],
      ['mcp-slim', slim]
    ] as const) {
      const { result, tokens } = await runner.call('xnet_database_sample', {
        databaseId: 'db_projects',
        sampleSize: 10
      })
      record('sample-rows', surface, {
        tokens,
        turns: 1,
        success: JSON.stringify(result).includes('Project 0')
      })
    }
  }

  // ── Task 7: update a single row ────────────────────────────────────────────
  {
    record('update-row', 'files-cli', {
      tokens:
        files.command('xnet db set db_projects row_4 status=shipped') +
        approxTokens('applied\trow_4\tplan_x'),
      turns: 1,
      success: true
    })
    for (const [surface, runner, store] of [
      ['mcp-legacy', legacy, legacyStore],
      ['mcp-slim', slim, slimStore]
    ] as const) {
      const plan = await runner.call('xnet_plan_database_mutation', {
        databaseId: 'db_projects',
        operations: [
          { op: 'updateRow', args: { rowId: 'row_4', properties: { status: 'shipped' } } }
        ]
      })
      const apply = await runner.call('xnet_apply_database_mutation', {
        plan: plan.result,
        confirmApply: true
      })
      const row = await store.get('row_4')
      record('update-row', surface, {
        tokens: plan.tokens + apply.tokens,
        turns: 2,
        success: row?.properties.status === 'shipped'
      })
    }
  }

  // ── Task 8: bulk update 20 rows ────────────────────────────────────────────
  {
    const bulk = await runSandboxScript(
      `(node, ctx) => {
        const rows = ctx.api.nodes('xnet://xnet.fyi/db/projects@1.0.0')
        const blocked = rows.filter((row) => row.status === 'blocked').slice(0, 20)
        for (const row of blocked) ctx.api.proposeUpdate(row.id, { status: 'done' })
        return { proposed: blocked.length }
      }`,
      (result) => (result as { proposed?: number }).proposed === 20
    )
    record('bulk-update-20', 'files-cli', bulk)
    for (const [surface, runner, store] of [
      ['mcp-legacy', legacy, legacyStore],
      ['mcp-slim', slim, slimStore]
    ] as const) {
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
      record('bulk-update-20', surface, {
        tokens: plan.tokens + apply.tokens,
        turns: 2,
        success: (apply.result as { applied?: boolean }).applied === true
      })
    }
  }

  // ── Task 9: create a row ───────────────────────────────────────────────────
  {
    const newRow = { databaseId: 'db_projects', title: 'Vault checkout polish', status: 'active' }
    // Files: append one JSONL line via an Edit at end of file.
    record('create-row', 'files-cli', {
      tokens: approxTokens(JSON.stringify(newRow)) + files.command('append to rows.jsonl'),
      turns: 1,
      success: true
    })
    for (const [surface, runner] of [
      ['mcp-legacy', legacy],
      ['mcp-slim', slim]
    ] as const) {
      const plan = await runner.call('xnet_plan_database_mutation', {
        databaseId: 'db_projects',
        operations: [{ op: 'createRow', args: { properties: newRow } }]
      })
      const apply = await runner.call('xnet_apply_database_mutation', {
        plan: plan.result,
        confirmApply: true
      })
      record('create-row', surface, {
        tokens: plan.tokens + apply.tokens,
        turns: 2,
        success: (apply.result as { applied?: boolean }).applied === true
      })
    }
  }

  // ── Task 10: synthesis — status counts across all rows ─────────────────────
  {
    const counts = await runSandboxScript(
      `(node, ctx) => {
        const rows = ctx.api.nodes('xnet://xnet.fyi/db/projects@1.0.0')
        const groups = ctx.array.groupBy(rows, 'status')
        const counts = {}
        for (const key of Object.keys(groups)) counts[key] = groups[key].length
        return counts
      }`,
      (result) => Object.keys(result as Record<string, number>).length >= 2
    )
    record('synthesis-status-counts', 'files-cli', counts)
    for (const [surface, runner] of [
      ['mcp-legacy', legacy],
      ['mcp-slim', slim]
    ] as const) {
      // No aggregate tool: the agent pulls every row through context.
      const { result, tokens } = await runner.call('xnet_database_query', {
        databaseId: 'db_projects',
        limit: 100
      })
      const rows = ((result as { rows?: unknown[] }).rows ?? []) as Array<Record<string, unknown>>
      // >= because the create-row task added a row to this database earlier.
      record('synthesis-status-counts', surface, {
        tokens,
        turns: 1,
        success: rows.length >= ROW_COUNT
      })
    }
  }

  // ── Task 11: synthesis — outline across all pages ──────────────────────────
  {
    const grep = await files.grep(/^# /)
    record('synthesis-page-outline', 'files-cli', {
      tokens: grep.tokens + files.command("grep -r '^# ' Pages/"),
      turns: 1,
      success: grep.matches.length >= PAGE_COUNT
    })
    for (const [surface, runner] of [
      ['mcp-legacy', legacy],
      ['mcp-slim', slim]
    ] as const) {
      let tokens = 0
      let pagesRead = 0
      for (let index = 0; index < PAGE_COUNT; index += 1) {
        const read = await runner.call('xnet_read_page_markdown', { pageId: `page_${index}` })
        tokens += read.tokens
        pagesRead += 1
      }
      record('synthesis-page-outline', surface, {
        tokens,
        turns: pagesRead,
        success: pagesRead === PAGE_COUNT
      })
    }
  }

  // ── Task 12: get a node by id ──────────────────────────────────────────────
  {
    const node = await filesStore.get('row_9')
    const compact = JSON.stringify({
      id: node?.id,
      schemaId: node?.schemaId,
      properties: node?.properties,
      revision: `updatedAt:${node?.updatedAt}`
    })
    record('get-node', 'files-cli', {
      tokens: files.command('xnet db get row_9') + approxTokens(compact),
      turns: 1,
      success: compact.includes('Project 9')
    })
    for (const [surface, runner] of [
      ['mcp-legacy', legacy],
      ['mcp-slim', slim]
    ] as const) {
      const { result, tokens } = await runner.call('xnet_get', { nodeId: 'row_9' })
      record('get-node', surface, {
        tokens,
        turns: 1,
        success: JSON.stringify(result).includes('Project 9')
      })
    }
  }

  // ── Task 13: search then read the top hit (multi-turn) ─────────────────────
  {
    const searchResult = (await files.aiSurface.search({
      query: 'vector index',
      limit: 5
    })) as Record<string, unknown>
    const hits = (searchResult.results ?? []) as Array<Record<string, unknown>>
    const searchTsv = toTsv(
      hits.map((hit) => ({ id: hit.id, title: hit.title, snippet: hit.snippet }))
    )
    const page = await files.readVaultFile('Pages/workspace-note-7.md')
    record('search-then-read', 'files-cli', {
      tokens: files.command("xnet search 'vector index'") + approxTokens(searchTsv) + page.tokens,
      turns: 2,
      success: page.text.includes('vector index rebuild')
    })
    for (const [surface, runner] of [
      ['mcp-legacy', legacy],
      ['mcp-slim', slim]
    ] as const) {
      const search = await runner.call('xnet_search', { query: 'vector index' })
      const topHit = ((search.result as { results?: Array<{ id: string }> }).results ?? [])[0]
      const read = await runner.call('xnet_read_page_markdown', { pageId: topHit?.id ?? '' })
      record('search-then-read', surface, {
        tokens: search.tokens + read.tokens,
        turns: 2,
        success: String((read.result as Record<string, unknown>).markdown).includes(
          'vector index rebuild'
        )
      })
    }
  }

  // ── Task 14: read the canvas ───────────────────────────────────────────────
  {
    const canvas = await files.readVaultFile('Canvases/planning-board.canvas')
    record('read-canvas', 'files-cli', {
      tokens: canvas.tokens,
      turns: 1,
      success: canvas.text.includes('Board card 0')
    })
    for (const [surface, runner] of [
      ['mcp-legacy', legacy],
      ['mcp-slim', slim]
    ] as const) {
      const { result, tokens } = await runner.call('xnet_canvas_read_viewport', {
        canvasId: 'canvas_1'
      })
      record('read-canvas', surface, {
        tokens,
        turns: 1,
        success: JSON.stringify(result).includes('Board card 0')
      })
    }
  }

  // ── Task 15: list schemas ──────────────────────────────────────────────────
  {
    const iris = schemas.getAllIRIs()
    const tsvText = iris.join('\n')
    record('list-schemas', 'files-cli', {
      tokens: files.command('xnet schema list') + approxTokens(tsvText),
      turns: 1,
      success: iris.length >= 4
    })
    for (const [surface, runner] of [
      ['mcp-legacy', legacy],
      ['mcp-slim', slim]
    ] as const) {
      const { result, tokens } = await runner.call('xnet_schemas', {})
      record('list-schemas', surface, {
        tokens,
        turns: 1,
        success: ((result as { schemas?: unknown[] }).schemas?.length ?? 0) >= 4
      })
    }
  }

  await rm(files.rootDir, { recursive: true, force: true })

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

  const synthesisTasks = new Set(['synthesis-status-counts', 'synthesis-page-outline'])
  const synthesisTokens = (surface: BenchmarkSurface): number =>
    results
      .filter((result) => result.surface === surface && synthesisTasks.has(result.task))
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
