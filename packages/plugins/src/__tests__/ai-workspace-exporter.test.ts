/**
 * Tests for the AI workspace exporter.
 */

import type { AIProvider } from '../ai/providers'
import type { NodeStoreAPI, SchemaRegistryAPI } from '../services/local-api'
import { mkdtemp, readFile, rm, unlink, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createAiAgentRuntime } from '../ai/runtime'
import {
  createAiWorkspaceExporter,
  createAiWorkspaceWatcher
} from '../services/ai-workspace-exporter'

type MockNode = {
  id: string
  schemaId: string
  properties: Record<string, unknown>
  deleted: boolean
  createdAt: number
  updatedAt: number
}

function createMockStore(initialNodes: MockNode[]): NodeStoreAPI & {
  setNode(id: string, properties: Record<string, unknown>): void
} {
  const nodes = new Map(initialNodes.map((node) => [node.id, node]))

  return {
    get: async (id) => nodes.get(id) ?? null,
    list: async (options) => {
      let result = Array.from(nodes.values())
      if (options?.schemaId) {
        result = result.filter((node) => node.schemaId === options.schemaId)
      }
      if (options?.offset) result = result.slice(options.offset)
      if (options?.limit) result = result.slice(0, options.limit)
      return result
    },
    create: async (options) => {
      const node = {
        id: `node-${nodes.size + 1}`,
        schemaId: options.schemaId,
        properties: options.properties,
        deleted: false,
        createdAt: Date.now(),
        updatedAt: Date.now()
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
    subscribe: () => () => {},
    setNode: (id, properties) => {
      const existing = nodes.get(id)
      if (!existing) throw new Error(`Node not found: ${id}`)
      nodes.set(id, {
        ...existing,
        properties: { ...existing.properties, ...properties },
        updatedAt: existing.updatedAt + 1
      })
    }
  }
}

function createMockSchemas(): SchemaRegistryAPI {
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
      'xnet://xnet.fyi/Canvas@1.0.0',
      {
        iri: 'xnet://xnet.fyi/Canvas@1.0.0',
        name: 'Canvas',
        properties: { title: { type: 'text' } }
      }
    ],
    [
      'xnet://xnet.fyi/db/projects@1.0.0',
      {
        iri: 'xnet://xnet.fyi/db/projects@1.0.0',
        name: 'Project Row',
        properties: { title: { type: 'text' }, databaseId: { type: 'text' } }
      }
    ]
  ])

  return {
    getAllIRIs: () => Array.from(schemas.keys()),
    get: async (iri) => schemas.get(iri) ?? null
  }
}

const noopProvider: AIProvider = {
  name: 'NoopProvider',
  getCapabilities: () => ({
    tools: false,
    structuredOutputs: false,
    streaming: false,
    contextWindow: 8_000,
    local: true,
    privacy: 'local',
    quality: 'local'
  }),
  generate: async () => ''
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let index = 0; index < 20; index += 1) {
    if (predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  throw new Error('Timed out waiting for async export job')
}

describe('AiWorkspaceExporter', () => {
  let rootDir: string

  beforeEach(async () => {
    rootDir = await mkdtemp(join(tmpdir(), 'xnet-ai-workspace-'))
  })

  afterEach(async () => {
    await rm(rootDir, { recursive: true, force: true })
  })

  it('exports pages, databases, canvases, config files, and manifest entries', async () => {
    const store = createMockStore([
      {
        id: 'page_1',
        schemaId: 'xnet://xnet.fyi/Page@1.0.0',
        properties: { title: 'Product Roadmap', markdown: 'Roadmap body' },
        deleted: false,
        createdAt: 1,
        updatedAt: 10
      },
      {
        id: 'db_projects',
        schemaId: 'xnet://xnet.fyi/Database@1.0.0',
        properties: {
          title: 'Projects',
          rowSchemaId: 'xnet://xnet.fyi/db/projects@1.0.0',
          columns: [{ id: 'title', name: 'Title' }],
          views: [{ id: 'table', type: 'table' }]
        },
        deleted: false,
        createdAt: 1,
        updatedAt: 11
      },
      {
        id: 'row_1',
        schemaId: 'xnet://xnet.fyi/db/projects@1.0.0',
        properties: { databaseId: 'db_projects', title: 'MCP v2' },
        deleted: false,
        createdAt: 1,
        updatedAt: 12
      },
      {
        id: 'canvas_1',
        schemaId: 'xnet://xnet.fyi/Canvas@1.0.0',
        properties: {
          title: 'Planning Canvas',
          objects: [{ id: 'obj_1', type: 'page', x: 10, y: 20, width: 320, height: 200 }],
          edges: []
        },
        deleted: false,
        createdAt: 1,
        updatedAt: 13
      }
    ])
    const exporter = createAiWorkspaceExporter({
      store,
      schemas: createMockSchemas(),
      clock: () => new Date('2026-06-02T12:00:00.000Z')
    })

    const result = await exporter.exportWorkspace({
      rootDir,
      workspaceName: 'Test Workspace',
      scope: { nodeIds: ['page_1', 'db_projects', 'canvas_1'] }
    })

    expect(result.files).toContain('AGENTS.md')
    expect(result.files).toContain('.mcp.json')
    expect(result.files).toContain('.codex/config.toml')
    expect(result.files).toContain('Pages/product-roadmap.md')
    expect(result.files).toContain('Databases/projects.schema.json')
    expect(result.files).toContain('Databases/projects.rows.jsonl')
    expect(result.files).toContain('Canvases/planning-canvas.canvas')

    const page = await readFile(join(rootDir, 'Pages/product-roadmap.md'), 'utf8')
    expect(page).toContain('id: "page_1"')
    expect(page).toContain('Roadmap body')

    const rows = await readFile(join(rootDir, 'Databases/projects.rows.jsonl'), 'utf8')
    expect(rows).toContain('"id":"row_1"')

    const canvas = JSON.parse(
      await readFile(join(rootDir, 'Canvases/planning-canvas.canvas'), 'utf8')
    )
    expect(canvas.nodes[0].id).toBe('obj_1')
    expect(canvas.nodes[0].xnet.type).toBe('page')

    const manifest = await readFile(join(rootDir, '.xnet/manifest.jsonl'), 'utf8')
    const entries = manifest
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
    expect(entries.some((entry) => entry.id === 'page_1' && entry.sha256)).toBe(true)
  })

  it('keeps node identity in the manifest while filenames stay semantic slugs', async () => {
    const store = createMockStore([
      {
        id: 'page_1',
        schemaId: 'xnet://xnet.fyi/Page@1.0.0',
        properties: { title: 'Old Title', markdown: 'Body' },
        deleted: false,
        createdAt: 1,
        updatedAt: 10
      }
    ])
    const exporter = createAiWorkspaceExporter({
      store,
      schemas: createMockSchemas(),
      clock: () => new Date('2026-06-02T12:00:00.000Z')
    })

    const first = await exporter.exportWorkspace({
      rootDir,
      scope: { nodeIds: ['page_1'] }
    })
    store.setNode('page_1', { title: 'New Title' })
    const second = await exporter.exportWorkspace({
      rootDir,
      scope: { nodeIds: ['page_1'] }
    })

    expect(first.manifestEntries[0].id).toBe('page_1')
    expect(second.manifestEntries[0].id).toBe('page_1')
    expect(first.manifestEntries[0].path).toBe('Pages/old-title.md')
    expect(second.manifestEntries[0].path).toBe('Pages/new-title.md')
  })

  it('runs full workspace export as a background incremental job', async () => {
    const store = createMockStore([
      {
        id: 'page_1',
        schemaId: 'xnet://xnet.fyi/Page@1.0.0',
        properties: { title: 'Page One', markdown: 'Body one' },
        deleted: false,
        createdAt: 1,
        updatedAt: 10
      },
      {
        id: 'page_2',
        schemaId: 'xnet://xnet.fyi/Page@1.0.0',
        properties: { title: 'Page Two', markdown: 'Body two' },
        deleted: false,
        createdAt: 1,
        updatedAt: 20
      }
    ])
    const exporter = createAiWorkspaceExporter({
      store,
      schemas: createMockSchemas(),
      clock: () => new Date('2026-06-02T12:00:00.000Z')
    })
    await exporter.exportWorkspace({
      rootDir,
      scope: { nodeIds: ['page_1', 'page_2'] }
    })
    store.setNode('page_2', { markdown: 'Updated body two' })
    const runtime = createAiAgentRuntime({
      provider: noopProvider,
      clock: () => new Date('2026-06-02T12:00:00.000Z')
    })

    const job = await runtime.startBackgroundJob(
      {
        kind: 'export',
        title: 'Incremental AI workspace export',
        metadata: { incremental: true, rootDir }
      },
      async () =>
        exporter.exportWorkspaceIncremental({
          rootDir,
          scope: { nodeIds: ['page_1', 'page_2'] }
        })
    )

    await waitFor(() => runtime.getSnapshot().telemetry.backgroundJobsCompleted === 1)
    const completed = runtime
      .getSnapshot()
      .backgroundJobs.find((candidate) => candidate.id === job.id)
    const result = completed?.result as {
      incremental: boolean
      skippedNodeIds: string[]
      manifestEntries: Array<{ id: string; revision: string }>
    }

    expect(completed).toMatchObject({ status: 'completed' })
    expect(result.incremental).toBe(true)
    expect(result.skippedNodeIds).toEqual(['page_1'])
    expect(result.manifestEntries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'page_1', revision: 'updatedAt:10' }),
        expect.objectContaining({ id: 'page_2', revision: 'updatedAt:21' })
      ])
    )
  })

  it('turns changed page, database, and canvas projection files into pending mutation plans', async () => {
    const store = createMockStore([
      {
        id: 'page_1',
        schemaId: 'xnet://xnet.fyi/Page@1.0.0',
        properties: { title: 'Product Roadmap', markdown: 'Roadmap body' },
        deleted: false,
        createdAt: 1,
        updatedAt: 10
      },
      {
        id: 'db_projects',
        schemaId: 'xnet://xnet.fyi/Database@1.0.0',
        properties: {
          title: 'Projects',
          rowSchemaId: 'xnet://xnet.fyi/db/projects@1.0.0',
          columns: [{ id: 'title', name: 'Title' }],
          views: []
        },
        deleted: false,
        createdAt: 1,
        updatedAt: 11
      },
      {
        id: 'row_1',
        schemaId: 'xnet://xnet.fyi/db/projects@1.0.0',
        properties: { databaseId: 'db_projects', title: 'MCP v2' },
        deleted: false,
        createdAt: 1,
        updatedAt: 12
      },
      {
        id: 'canvas_1',
        schemaId: 'xnet://xnet.fyi/Canvas@1.0.0',
        properties: {
          title: 'Planning Canvas',
          objects: [{ id: 'obj_1', type: 'page', x: 10, y: 20, width: 320, height: 200 }],
          edges: []
        },
        deleted: false,
        createdAt: 1,
        updatedAt: 13
      }
    ])
    const clock = () => new Date('2026-06-02T12:00:00.000Z')
    const schemas = createMockSchemas()
    const exporter = createAiWorkspaceExporter({ store, schemas, clock })
    await exporter.exportWorkspace({
      rootDir,
      scope: { nodeIds: ['page_1', 'db_projects', 'canvas_1'] }
    })

    const pagePath = join(rootDir, 'Pages/product-roadmap.md')
    const rowsPath = join(rootDir, 'Databases/projects.rows.jsonl')
    const canvasPath = join(rootDir, 'Canvases/planning-canvas.canvas')
    const page = await readFile(pagePath, 'utf8')
    const canvas = JSON.parse(await readFile(canvasPath, 'utf8'))
    canvas.nodes.push({
      id: 'obj_2',
      type: 'text',
      x: 80,
      y: 100,
      width: 240,
      height: 160,
      text: 'New note'
    })

    await writeFile(
      pagePath,
      page.replace('Roadmap body', 'Roadmap body\n\nUpdated by agent'),
      'utf8'
    )
    await writeFile(
      rowsPath,
      `${JSON.stringify({ id: 'row_1', title: 'MCP v2' })}\n${JSON.stringify({
        id: 'row_2',
        title: 'Local agent'
      })}\n`,
      'utf8'
    )
    await writeFile(canvasPath, `${JSON.stringify(canvas, null, 2)}\n`, 'utf8')

    const watcher = createAiWorkspaceWatcher({ store, schemas, clock })
    const result = await watcher.scanChangedFiles({ rootDir })

    expect(result.conflicts).toEqual([])
    expect(result.changedFiles.map((file) => file.path).sort()).toEqual([
      'Canvases/planning-canvas.canvas',
      'Databases/projects.rows.jsonl',
      'Pages/product-roadmap.md'
    ])
    expect(result.pendingPlans).toHaveLength(3)
    expect(result.review.entries).toHaveLength(3)
    expect(result.review.entries.every((entry) => entry.kind === 'pending-plan')).toBe(true)
    expect(result.review.entries[0].suggestedActions).toEqual([
      'approve',
      'reject',
      'request-revision'
    ])

    const pagePlan = result.pendingPlans.find((pending) => pending.path.endsWith('.md'))?.plan
    const rowsPlan = result.pendingPlans.find((pending) =>
      pending.path.endsWith('.rows.jsonl')
    )?.plan
    const canvasPlan = result.pendingPlans.find((pending) => pending.path.endsWith('.canvas'))?.plan

    expect(pagePlan?.changes[0].operations[0].op).toBe('replaceMarkdown')
    expect(rowsPlan?.changes[0].targetKind).toBe('databaseRows')
    expect(rowsPlan?.changes[0].operations[0].op).toBe('replaceRowsProjection')
    expect(canvasPlan?.changes[0].targetKind).toBe('canvas')
    expect(
      canvasPlan?.changes[0].operations.some((operation) => operation.op === 'addObject')
    ).toBe(true)

    const persistedPlan = JSON.parse(
      await readFile(join(rootDir, result.pendingPlans[0].planPath), 'utf8')
    )
    expect(persistedPlan.id).toBe(result.pendingPlans[0].plan.id)

    const reviewIndex = JSON.parse(await readFile(join(rootDir, '.xnet/review/index.json'), 'utf8'))
    expect(reviewIndex.entries.map((entry: { planId: string }) => entry.planId).sort()).toEqual(
      result.pendingPlans.map((pending) => pending.plan.id).sort()
    )
  })

  it('writes conflict records for missing exported files', async () => {
    const store = createMockStore([
      {
        id: 'page_1',
        schemaId: 'xnet://xnet.fyi/Page@1.0.0',
        properties: { title: 'Product Roadmap', markdown: 'Roadmap body' },
        deleted: false,
        createdAt: 1,
        updatedAt: 10
      }
    ])
    const clock = () => new Date('2026-06-02T12:00:00.000Z')
    const schemas = createMockSchemas()
    const exporter = createAiWorkspaceExporter({ store, schemas, clock })
    await exporter.exportWorkspace({
      rootDir,
      scope: { nodeIds: ['page_1'] }
    })

    await unlink(join(rootDir, 'Pages/product-roadmap.md'))

    const watcher = createAiWorkspaceWatcher({ store, schemas, clock })
    const result = await watcher.scanChangedFiles({ rootDir })

    expect(result.pendingPlans).toEqual([])
    expect(result.conflicts).toHaveLength(1)
    expect(result.conflicts[0]).toMatchObject({
      kind: 'missing-file',
      path: 'Pages/product-roadmap.md',
      id: 'page_1'
    })

    const persistedConflict = JSON.parse(
      await readFile(join(rootDir, result.conflicts[0].conflictPath ?? ''), 'utf8')
    )
    expect(persistedConflict.kind).toBe('missing-file')

    expect(result.review.entries).toEqual([
      expect.objectContaining({
        kind: 'conflict',
        status: 'needs-review',
        path: 'Pages/product-roadmap.md',
        conflictKind: 'missing-file',
        suggestedActions: ['reject', 'request-revision']
      })
    ])

    const reviewIndex = JSON.parse(await readFile(join(rootDir, '.xnet/review/index.json'), 'utf8'))
    expect(reviewIndex.entries[0]).toMatchObject({
      kind: 'conflict',
      conflictPath: result.conflicts[0].conflictPath
    })
  })

  it('turns stale exported edits into conflicts instead of pending plans', async () => {
    const store = createMockStore([
      {
        id: 'page_1',
        schemaId: 'xnet://xnet.fyi/Page@1.0.0',
        properties: { title: 'Product Roadmap', markdown: 'Roadmap body' },
        deleted: false,
        createdAt: 1,
        updatedAt: 10
      }
    ])
    const clock = () => new Date('2026-06-02T12:00:00.000Z')
    const schemas = createMockSchemas()
    const exporter = createAiWorkspaceExporter({ store, schemas, clock })
    await exporter.exportWorkspace({
      rootDir,
      scope: { nodeIds: ['page_1'] }
    })

    store.setNode('page_1', { markdown: 'Live edit' })
    const pagePath = join(rootDir, 'Pages/product-roadmap.md')
    const page = await readFile(pagePath, 'utf8')
    await writeFile(pagePath, page.replace('Roadmap body', 'External edit'), 'utf8')

    const watcher = createAiWorkspaceWatcher({ store, schemas, clock })
    const result = await watcher.scanChangedFiles({ rootDir })

    expect(result.pendingPlans).toEqual([])
    expect(result.conflicts).toHaveLength(1)
    expect(result.conflicts[0]).toMatchObject({
      kind: 'stale-export',
      path: 'Pages/product-roadmap.md',
      id: 'page_1'
    })
    expect(result.conflicts[0].message).toContain('live node is updatedAt:11')
    expect(result.review.entries[0]).toMatchObject({
      kind: 'conflict',
      conflictKind: 'stale-export'
    })
  })

  it('requires an explicit scope for checkout and merges successive checkouts', async () => {
    const store = createMockStore([
      {
        id: 'page_1',
        schemaId: 'xnet://xnet.fyi/Page@1.0.0',
        properties: { title: 'Q3 Planning', markdown: 'Quarterly goals' },
        deleted: false,
        createdAt: 1,
        updatedAt: 10
      },
      {
        id: 'page_2',
        schemaId: 'xnet://xnet.fyi/Page@1.0.0',
        properties: { title: 'Hiring Notes', markdown: 'Pipeline review' },
        deleted: false,
        createdAt: 1,
        updatedAt: 20
      }
    ])
    const exporter = createAiWorkspaceExporter({
      store,
      schemas: createMockSchemas(),
      clock: () => new Date('2026-06-02T12:00:00.000Z')
    })

    await expect(exporter.checkout({ rootDir, scope: {} })).rejects.toThrow(/explicit scope/)

    const first = await exporter.checkout({ rootDir, scope: { query: 'Q3 Planning' } })
    expect(first.manifestEntries.map((entry) => entry.id)).toEqual(['page_1'])
    expect(first.files).toContain('Pages/q3-planning.md')
    expect(first.files).toContain('SKILL.md')

    const second = await exporter.checkout({ rootDir, scope: { nodeIds: ['page_2'] } })
    expect(second.manifestEntries.map((entry) => entry.id).sort()).toEqual(['page_1', 'page_2'])
    expect(second.manifestEntries.map((entry) => entry.path).sort()).toEqual([
      'Pages/hiring-notes.md',
      'Pages/q3-planning.md'
    ])
  })

  it('supports kind-folder checkout scopes', async () => {
    const store = createMockStore([
      {
        id: 'page_1',
        schemaId: 'xnet://xnet.fyi/Page@1.0.0',
        properties: { title: 'Page One', markdown: 'Body' },
        deleted: false,
        createdAt: 1,
        updatedAt: 10
      },
      {
        id: 'canvas_1',
        schemaId: 'xnet://xnet.fyi/Canvas@1.0.0',
        properties: { title: 'Board', objects: [], edges: [] },
        deleted: false,
        createdAt: 1,
        updatedAt: 13
      }
    ])
    const exporter = createAiWorkspaceExporter({
      store,
      schemas: createMockSchemas(),
      clock: () => new Date('2026-06-02T12:00:00.000Z')
    })

    const result = await exporter.checkout({ rootDir, scope: { kinds: ['page'] } })
    expect(result.manifestEntries.map((entry) => entry.id)).toEqual(['page_1'])
  })

  it('dedupes colliding semantic slugs with a short hash suffix', async () => {
    const store = createMockStore([
      {
        id: 'page_a',
        schemaId: 'xnet://xnet.fyi/Page@1.0.0',
        properties: { title: 'Weekly Sync', markdown: 'A' },
        deleted: false,
        createdAt: 1,
        updatedAt: 10
      },
      {
        id: 'page_b',
        schemaId: 'xnet://xnet.fyi/Page@1.0.0',
        properties: { title: 'Weekly Sync', markdown: 'B' },
        deleted: false,
        createdAt: 1,
        updatedAt: 20
      }
    ])
    const exporter = createAiWorkspaceExporter({
      store,
      schemas: createMockSchemas(),
      clock: () => new Date('2026-06-02T12:00:00.000Z')
    })

    const result = await exporter.exportWorkspace({
      rootDir,
      scope: { nodeIds: ['page_a', 'page_b'] }
    })
    const paths = result.manifestEntries.map((entry) => entry.path)
    expect(paths).toContain('Pages/weekly-sync.md')
    expect(paths.some((path) => /^Pages\/weekly-sync--[0-9a-f]{8}\.md$/.test(path))).toBe(true)
  })

  it('writes a read-only TSV sidecar for large databases and quarantines edits to it', async () => {
    const rows = Array.from({ length: 5 }, (_, index) => ({
      id: `row_${index}`,
      schemaId: 'xnet://xnet.fyi/db/projects@1.0.0',
      properties: { databaseId: 'db_projects', title: `Project ${index}` },
      deleted: false,
      createdAt: 1,
      updatedAt: 10 + index
    }))
    const store = createMockStore([
      {
        id: 'db_projects',
        schemaId: 'xnet://xnet.fyi/Database@1.0.0',
        properties: {
          title: 'Projects',
          rowSchemaId: 'xnet://xnet.fyi/db/projects@1.0.0',
          columns: [{ id: 'title', name: 'Title' }],
          views: []
        },
        deleted: false,
        createdAt: 1,
        updatedAt: 11
      },
      ...rows
    ])
    const clock = () => new Date('2026-06-02T12:00:00.000Z')
    const schemas = createMockSchemas()
    const exporter = createAiWorkspaceExporter({ store, schemas, clock, tsvSidecarMinRows: 3 })
    const result = await exporter.exportWorkspace({
      rootDir,
      scope: { nodeIds: ['db_projects'] }
    })

    expect(result.files).toContain('Databases/projects.tsv')
    const tsv = await readFile(join(rootDir, 'Databases/projects.tsv'), 'utf8')
    const [header, ...dataLines] = tsv.trim().split('\n')
    expect(header.split('\t')).toContain('title')
    expect(dataLines).toHaveLength(5)

    await writeFile(join(rootDir, 'Databases/projects.tsv'), `${tsv}edited\tline\n`, 'utf8')
    const watcher = createAiWorkspaceWatcher({ store, schemas, clock, tsvSidecarMinRows: 3 })
    const scan = await watcher.scanChangedFiles({ rootDir })
    expect(scan.pendingPlans).toEqual([])
    expect(scan.conflicts).toHaveLength(1)
    expect(scan.conflicts[0].kind).toBe('unsupported-change')
    expect(scan.conflicts[0].message).toContain('read-only TSV sidecar')
  })

  it('quarantines page edits with round-trip validation warnings instead of planning them', async () => {
    const store = createMockStore([
      {
        id: 'page_1',
        schemaId: 'xnet://xnet.fyi/Page@1.0.0',
        properties: { title: 'Product Roadmap', markdown: 'Roadmap body' },
        deleted: false,
        createdAt: 1,
        updatedAt: 10
      }
    ])
    const clock = () => new Date('2026-06-02T12:00:00.000Z')
    const schemas = createMockSchemas()
    const exporter = createAiWorkspaceExporter({ store, schemas, clock })
    await exporter.exportWorkspace({ rootDir, scope: { nodeIds: ['page_1'] } })

    const pagePath = join(rootDir, 'Pages/product-roadmap.md')
    const page = await readFile(pagePath, 'utf8')
    await writeFile(
      pagePath,
      page.replace('Roadmap body', 'Roadmap body\n\n<!-- hidden html comment -->'),
      'utf8'
    )

    const watcher = createAiWorkspaceWatcher({ store, schemas, clock })
    const result = await watcher.scanChangedFiles({ rootDir })

    expect(result.pendingPlans).toEqual([])
    expect(result.conflicts).toHaveLength(1)
    expect(result.conflicts[0].kind).toBe('validation-warning')
    expect(result.conflicts[0].message).toContain('HTML comments')
  })

  it('writes human-readable conflict notes with resolution instructions', async () => {
    const store = createMockStore([
      {
        id: 'page_1',
        schemaId: 'xnet://xnet.fyi/Page@1.0.0',
        properties: { title: 'Product Roadmap', markdown: 'Roadmap body' },
        deleted: false,
        createdAt: 1,
        updatedAt: 10
      }
    ])
    const clock = () => new Date('2026-06-02T12:00:00.000Z')
    const schemas = createMockSchemas()
    const exporter = createAiWorkspaceExporter({ store, schemas, clock })
    await exporter.exportWorkspace({ rootDir, scope: { nodeIds: ['page_1'] } })
    await unlink(join(rootDir, 'Pages/product-roadmap.md'))

    const watcher = createAiWorkspaceWatcher({ store, schemas, clock })
    const result = await watcher.scanChangedFiles({ rootDir })

    expect(result.conflicts[0].notePath).toMatch(/\.md$/)
    const note = await readFile(join(rootDir, result.conflicts[0].notePath ?? ''), 'utf8')
    expect(note).toContain('# Conflict: missing-file')
    expect(note).toContain('How to resolve')
    expect(note).toContain('Pages/product-roadmap.md')
  })

  it('falls back to polling when configured and still picks up changes', async () => {
    const store = createMockStore([
      {
        id: 'page_1',
        schemaId: 'xnet://xnet.fyi/Page@1.0.0',
        properties: { title: 'Product Roadmap', markdown: 'Roadmap body' },
        deleted: false,
        createdAt: 1,
        updatedAt: 10
      }
    ])
    const clock = () => new Date('2026-06-02T12:00:00.000Z')
    const schemas = createMockSchemas()
    const exporter = createAiWorkspaceExporter({ store, schemas, clock })
    await exporter.exportWorkspace({ rootDir, scope: { nodeIds: ['page_1'] } })

    const pagePath = join(rootDir, 'Pages/product-roadmap.md')
    const page = await readFile(pagePath, 'utf8')

    const watcher = createAiWorkspaceWatcher({ store, schemas, clock })
    const scans: number[] = []
    const handle = watcher.watchWorkspace(
      { rootDir, usePolling: true, pollIntervalMs: 20 },
      (result) => {
        scans.push(result.pendingPlans.length)
      }
    )
    expect(handle.isPolling()).toBe(true)

    await writeFile(pagePath, page.replace('Roadmap body', 'Polled edit'), 'utf8')
    for (let index = 0; index < 100 && scans.length === 0; index += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
    handle.close()

    expect(scans.length).toBeGreaterThan(0)
    expect(scans[scans.length - 1]).toBe(1)
  })
})
