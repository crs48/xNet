/**
 * Tests for the AI workspace exporter.
 */

import type { NodeStoreAPI, SchemaRegistryAPI } from '../services/local-api'
import { mkdtemp, readFile, rm, unlink, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
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
    expect(result.files).toContain('Pages/Product-Roadmap--page_1.md')
    expect(result.files).toContain('Databases/Projects--db_projects.schema.json')
    expect(result.files).toContain('Databases/Projects--db_projects.rows.jsonl')
    expect(result.files).toContain('Canvases/Planning-Canvas--canvas_1.canvas')

    const page = await readFile(join(rootDir, 'Pages/Product-Roadmap--page_1.md'), 'utf8')
    expect(page).toContain('id: "page_1"')
    expect(page).toContain('Roadmap body')

    const rows = await readFile(join(rootDir, 'Databases/Projects--db_projects.rows.jsonl'), 'utf8')
    expect(rows).toContain('"id":"row_1"')

    const canvas = JSON.parse(
      await readFile(join(rootDir, 'Canvases/Planning-Canvas--canvas_1.canvas'), 'utf8')
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

  it('keeps ids in filenames and manifest entries when titles change', async () => {
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
    expect(first.manifestEntries[0].path).toContain('page_1')
    expect(second.manifestEntries[0].path).toContain('page_1')
    expect(second.manifestEntries[0].path).toBe('Pages/New-Title--page_1.md')
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

    const pagePath = join(rootDir, 'Pages/Product-Roadmap--page_1.md')
    const rowsPath = join(rootDir, 'Databases/Projects--db_projects.rows.jsonl')
    const canvasPath = join(rootDir, 'Canvases/Planning-Canvas--canvas_1.canvas')
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
      'Canvases/Planning-Canvas--canvas_1.canvas',
      'Databases/Projects--db_projects.rows.jsonl',
      'Pages/Product-Roadmap--page_1.md'
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

    await unlink(join(rootDir, 'Pages/Product-Roadmap--page_1.md'))

    const watcher = createAiWorkspaceWatcher({ store, schemas, clock })
    const result = await watcher.scanChangedFiles({ rootDir })

    expect(result.pendingPlans).toEqual([])
    expect(result.conflicts).toHaveLength(1)
    expect(result.conflicts[0]).toMatchObject({
      kind: 'missing-file',
      path: 'Pages/Product-Roadmap--page_1.md',
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
        path: 'Pages/Product-Roadmap--page_1.md',
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
})
