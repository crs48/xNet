/**
 * Tests for the files-first agent CLI commands (exploration 0161).
 */

import type { NodeData, NodeStoreAPI, SchemaRegistryAPI } from '@xnetjs/plugins/node'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createAgentServices,
  parseAssignments,
  runCheckout,
  runCommit,
  runDbGet,
  runDbSet,
  runQuery,
  runScript,
  runSearch,
  runStatus,
  type AgentCliServices
} from '../commands/agent.js'

type MockNode = NodeData

function createMockStore(initialNodes: MockNode[]): NodeStoreAPI {
  const nodes = new Map(initialNodes.map((node) => [node.id, node]))
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
      const node: MockNode = {
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
    subscribe: () => () => {}
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

function createTestServices(): AgentCliServices {
  const store = createMockStore([
    {
      id: 'page_1',
      schemaId: 'xnet://xnet.fyi/Page@1.0.0',
      properties: { title: 'Q3 Planning', markdown: 'Quarterly goals and OKRs' },
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
      properties: { databaseId: 'db_projects', title: 'MCP v2', status: 'active' },
      deleted: false,
      createdAt: 1,
      updatedAt: 12
    },
    {
      id: 'row_2',
      schemaId: 'xnet://xnet.fyi/db/projects@1.0.0',
      properties: { databaseId: 'db_projects', title: 'Vault checkout', status: 'done' },
      deleted: false,
      createdAt: 1,
      updatedAt: 13
    }
  ])
  return createAgentServices({ store, schemas: createMockSchemas() })
}

describe('agent CLI commands', () => {
  let rootDir: string

  beforeEach(async () => {
    rootDir = await mkdtemp(join(tmpdir(), 'xnet-cli-agent-'))
  })

  afterEach(async () => {
    await rm(rootDir, { recursive: true, force: true })
  })

  it('checkout materializes a query-scoped slice with SKILL.md', async () => {
    const services = createTestServices()
    const output = await runCheckout(services, { dir: rootDir, query: 'Q3 Planning' })

    expect(output).toContain('checked out 1 file(s)')
    expect(output).toContain('Pages/q3-planning.md\tpage_1')
    const skill = await readFile(join(rootDir, 'SKILL.md'), 'utf8')
    expect(skill).toContain('name: xnet')
  })

  it('status reports clean and then pending plans after an edit', async () => {
    const services = createTestServices()
    await runCheckout(services, { dir: rootDir, node: ['page_1'] })
    expect(await runStatus(services, { dir: rootDir })).toBe('clean')

    const pagePath = join(rootDir, 'Pages/q3-planning.md')
    const page = await readFile(pagePath, 'utf8')
    await writeFile(pagePath, page.replace('Quarterly goals', 'Revised goals'), 'utf8')

    const status = await runStatus(services, { dir: rootDir })
    expect(status).toContain('pending\tPages/q3-planning.md')
  })

  it('commit --apply applies page edits and refreshes the projection', async () => {
    const services = createTestServices()
    await runCheckout(services, { dir: rootDir, node: ['page_1'] })

    const pagePath = join(rootDir, 'Pages/q3-planning.md')
    const page = await readFile(pagePath, 'utf8')
    await writeFile(pagePath, page.replace('Quarterly goals', 'Revised goals'), 'utf8')

    const output = await runCommit(services, { dir: rootDir, apply: true })
    expect(output).toContain('applied\tPages/q3-planning.md')

    const node = await services.store.get('page_1')
    expect(node?.properties.markdown).toContain('Revised goals')

    // Projection refreshed: status is clean again afterwards.
    expect(await runStatus(services, { dir: rootDir })).toBe('clean')
  })

  it('search returns TSV results', async () => {
    const services = createTestServices()
    const output = await runSearch(services, { text: 'planning' })
    const lines = output.split('\n')
    expect(lines[0].split('\t')).toEqual(['id', 'schemaId', 'title', 'snippet'])
    expect(output).toContain('page_1')
  })

  it('query returns TSV rows with flattened properties and supports where filters', async () => {
    const services = createTestServices()
    const output = await runQuery(services, { databaseId: 'db_projects' })
    const lines = output.split('\n')
    expect(lines[0].split('\t')).toContain('title')
    expect(lines).toHaveLength(3)

    const filtered = await runQuery(services, {
      databaseId: 'db_projects',
      where: ['status=active'],
      format: 'jsonl'
    })
    const rows = filtered.split('\n').map((line) => JSON.parse(line))
    expect(rows).toHaveLength(1)
    expect(rows[0].id).toBe('row_1')
  })

  it('db get returns compact JSON with a revision token', async () => {
    const services = createTestServices()
    const output = await runDbGet(services, { nodeId: 'row_1' })
    const node = JSON.parse(output)
    expect(node.id).toBe('row_1')
    expect(node.revision).toBe('updatedAt:12')
    expect(output).not.toContain('\n')
  })

  it('db set updates a row through the plan/apply pipeline', async () => {
    const services = createTestServices()
    const output = await runDbSet(services, {
      databaseId: 'db_projects',
      rowId: 'row_1',
      assignments: ['status=shipped']
    })
    expect(output).toContain('applied\trow_1')
    const row = await services.store.get('row_1')
    expect(row?.properties.status).toBe('shipped')
  })

  it('run executes a sandboxed script with api reads and write proposals', async () => {
    const services = createTestServices()
    const scriptPath = join(rootDir, 'script.js')
    await writeFile(
      scriptPath,
      `(node, ctx) => {
        const rows = ctx.api.nodes('xnet://xnet.fyi/db/projects@1.0.0')
        const active = rows.filter((row) => row.status === 'active')
        for (const row of active) {
          ctx.api.proposeUpdate(row.id, { status: 'review' })
        }
        return { total: rows.length, active: active.length }
      }`,
      'utf8'
    )

    const output = JSON.parse(
      await runScript(services, { file: scriptPath, dir: rootDir })
    ) as Record<string, unknown>
    expect(output.result).toEqual({ total: 2, active: 1 })
    expect(output.plan).toMatchObject({ changes: 1, valid: true })

    const planPath = (output.planPath ?? '') as string
    const plan = JSON.parse(await readFile(join(rootDir, planPath), 'utf8'))
    expect(plan.changes[0]).toMatchObject({
      targetKind: 'node',
      targetId: 'row_1',
      baseRevision: 'updatedAt:12'
    })
  })

  it('parses assignments with JSON and string values', () => {
    expect(parseAssignments(['count=3', 'done=true', 'title=Hello world'])).toEqual({
      count: 3,
      done: true,
      title: 'Hello world'
    })
    expect(() => parseAssignments(['nope'])).toThrow(/field=value/)
  })
})
