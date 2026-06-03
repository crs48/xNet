/**
 * Tests for the AI workspace exporter.
 */

import type { NodeStoreAPI, SchemaRegistryAPI } from '../services/local-api'
import { mkdtemp, readFile, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createAiWorkspaceExporter } from '../services/ai-workspace-exporter'

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
})
