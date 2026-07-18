/**
 * Characterization tests for AiSurfaceService (exploration 0276).
 *
 * Pins the externally observable surface — tool names/risk/scopes, callTool
 * dispatch, the page/database mutation plan → apply → rollback round-trips,
 * audit-log recording, and the xnet:// resource URI families — so the tool
 * registry and resource URI router refactors must preserve behavior exactly.
 */

import type {
  AiDatabaseMutationApplyResult,
  AiPageMarkdownApplyResult,
  AiPageMarkdownRollbackResult,
  AiSurfaceService
} from './service'
import type { AiAuditEvent, AiMutationPlan } from './types'
import type { NodeData, NodeStoreAPI, SchemaRegistryAPI } from '../services/local-api'
import { beforeEach, describe, expect, it } from 'vitest'
import { createAiSurfaceService } from './service'

// ─── Fixtures ───────────────────────────────────────────────────────────────

const PAGE_SCHEMA = 'xnet://xnet.fyi/Page@1.0.0'
const DATABASE_SCHEMA = 'xnet://xnet.fyi/Database@1.0.0'
const ROW_SCHEMA = 'xnet://xnet.fyi/DatabaseRow@2.0.0'
const CANVAS_SCHEMA = 'xnet://xnet.fyi/Canvas@1.0.0'

const PAGE_MARKDOWN = '# Meeting Notes\n\nDiscussed roadmap milestones.'

function createFixtureNodes(): NodeData[] {
  return [
    {
      id: 'page-1',
      schemaId: PAGE_SCHEMA,
      properties: { title: 'Meeting Notes', markdown: PAGE_MARKDOWN },
      deleted: false,
      createdAt: 1,
      updatedAt: 100
    },
    {
      id: 'db-1',
      schemaId: DATABASE_SCHEMA,
      properties: {
        title: 'Tasks',
        rowSchemaId: ROW_SCHEMA,
        columns: [{ id: 'col-title', name: 'Title', type: 'text' }],
        views: [{ id: 'view-1', name: 'All tasks' }]
      },
      deleted: false,
      createdAt: 2,
      updatedAt: 90
    },
    {
      id: 'row-1',
      schemaId: ROW_SCHEMA,
      properties: { title: 'Ship the refactor', database: 'db-1', status: 'todo' },
      deleted: false,
      createdAt: 3,
      updatedAt: 80
    },
    {
      id: 'canvas-1',
      schemaId: CANVAS_SCHEMA,
      properties: {
        title: 'Planning Board',
        objects: [
          {
            id: 'obj-1',
            type: 'note',
            x: 0,
            y: 0,
            width: 240,
            height: 160,
            properties: { title: 'Sticky note' }
          }
        ],
        edges: []
      },
      deleted: false,
      createdAt: 4,
      updatedAt: 70
    }
  ]
}

type MemoryStore = NodeStoreAPI & { readonly nodes: Map<string, NodeData> }

function createMemoryStore(seed: NodeData[]): MemoryStore {
  const nodes = new Map<string, NodeData>(
    seed.map((node) => [node.id, { ...node, properties: { ...node.properties } }])
  )
  let created = 0
  let tick = 1000

  return {
    nodes,
    get: async (id) => nodes.get(id) ?? null,
    list: async (options) => {
      let result = Array.from(nodes.values())
      if (options?.schemaId) result = result.filter((node) => node.schemaId === options.schemaId)
      if (options?.offset) result = result.slice(options.offset)
      if (options?.limit) result = result.slice(0, options.limit)
      return result
    },
    create: async (options) => {
      created += 1
      tick += 1
      const node: NodeData = {
        id: `created-${created}`,
        schemaId: options.schemaId,
        properties: { ...options.properties },
        deleted: false,
        createdAt: tick,
        updatedAt: tick
      }
      nodes.set(node.id, node)
      return node
    },
    update: async (id, options) => {
      const existing = nodes.get(id)
      if (!existing) throw new Error(`Node not found: ${id}`)
      const node: NodeData = {
        ...existing,
        properties: { ...existing.properties, ...options.properties },
        updatedAt: existing.updatedAt + 1
      }
      nodes.set(id, node)
      return node
    },
    delete: async (id) => {
      const existing = nodes.get(id)
      if (existing) {
        nodes.set(id, { ...existing, deleted: true, updatedAt: existing.updatedAt + 1 })
      }
    },
    subscribe: () => () => {}
  }
}

const schemas: SchemaRegistryAPI = {
  getAllIRIs: () => [PAGE_SCHEMA, DATABASE_SCHEMA, ROW_SCHEMA, CANVAS_SCHEMA],
  get: async (iri) => {
    if (iri === PAGE_SCHEMA) {
      return { iri, name: 'Page', properties: { title: { type: 'text' } } }
    }
    if (iri === DATABASE_SCHEMA) {
      return { iri, name: 'Database', properties: { title: { type: 'text' } } }
    }
    if (iri === ROW_SCHEMA) {
      return { iri, name: 'DatabaseRow', properties: { title: { type: 'text' } } }
    }
    if (iri === CANVAS_SCHEMA) {
      return { iri, name: 'Canvas', properties: { title: { type: 'text' } } }
    }
    return null
  }
}

// ─── Expected Tool Surface ──────────────────────────────────────────────────

// The full built-in tool surface, in registration order. Names, risk levels,
// and required scopes are load-bearing: agents, the MCP server, and scope
// gating all key off them.
const EXPECTED_BUILT_IN_TOOLS: Record<string, { risk: string; requiredScopes: string[] }> = {
  xnet_search: { risk: 'low', requiredScopes: ['workspace.search'] },
  xnet_graph_expand: { risk: 'low', requiredScopes: ['workspace.read'] },
  xnet_create_context_pack: { risk: 'low', requiredScopes: ['workspace.read', 'workspace.search'] },
  xnet_create_external_context_resource: { risk: 'medium', requiredScopes: ['network.fetch'] },
  xnet_read_page_markdown: { risk: 'low', requiredScopes: ['page.read'] },
  xnet_validate_page_markdown: { risk: 'low', requiredScopes: ['page.read'] },
  xnet_plan_page_patch: { risk: 'medium', requiredScopes: ['page.read', 'page.propose'] },
  xnet_apply_page_markdown: { risk: 'high', requiredScopes: ['page.read', 'page.write'] },
  xnet_get_audit_log: { risk: 'low', requiredScopes: ['workspace.read'] },
  xnet_rollback_page_markdown: { risk: 'high', requiredScopes: ['page.write'] },
  xnet_database_describe: { risk: 'low', requiredScopes: ['database.read'] },
  xnet_database_query: { risk: 'low', requiredScopes: ['database.read', 'database.query'] },
  xnet_database_sample: { risk: 'low', requiredScopes: ['database.read', 'database.query'] },
  xnet_database_explain_query: {
    risk: 'low',
    requiredScopes: ['database.read', 'database.query', 'storage.diagnostics']
  },
  xnet_plan_database_mutation: {
    risk: 'medium',
    requiredScopes: ['database.read', 'database.propose']
  },
  xnet_apply_database_mutation: {
    risk: 'high',
    requiredScopes: ['database.read', 'database.write.rows', 'database.write.schema']
  },
  xnet_canvas_list: { risk: 'low', requiredScopes: ['canvas.read'] },
  xnet_canvas_read_viewport: { risk: 'low', requiredScopes: ['canvas.read'] },
  xnet_canvas_read_selection: { risk: 'low', requiredScopes: ['canvas.read'] },
  xnet_canvas_search: { risk: 'low', requiredScopes: ['canvas.read'] },
  xnet_canvas_export_json_canvas: { risk: 'low', requiredScopes: ['canvas.read'] },
  xnet_canvas_plan_json_canvas_import: {
    risk: 'medium',
    requiredScopes: ['canvas.read', 'canvas.propose']
  },
  xnet_plan_canvas_mutation: { risk: 'medium', requiredScopes: ['canvas.read', 'canvas.propose'] },
  xnet_validate_mutation_plan: { risk: 'medium', requiredScopes: ['workspace.read'] },
  // Frame placement (0346) — the agent as declarative composer.
  xnet_plan_frame_placement: { risk: 'medium', requiredScopes: ['page.read', 'page.propose'] },
  xnet_apply_frame_placement: { risk: 'high', requiredScopes: ['page.write'] },
  xnet_compose_page: { risk: 'high', requiredScopes: ['page.write'] }
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('AiSurfaceService characterization (0276)', () => {
  let store: MemoryStore
  let service: AiSurfaceService

  beforeEach(() => {
    store = createMemoryStore(createFixtureNodes())
    service = createAiSurfaceService({ store, schemas })
  })

  describe('getTools', () => {
    it('returns the built-in tool names in registration order', () => {
      expect(service.getTools().map((tool) => tool.name)).toEqual(
        Object.keys(EXPECTED_BUILT_IN_TOOLS)
      )
    })

    it('pins risk levels and required scopes for every built-in tool', () => {
      for (const tool of service.getTools()) {
        expect(
          { risk: tool.risk, requiredScopes: tool.requiredScopes },
          `tool surface for ${tool.name}`
        ).toEqual(EXPECTED_BUILT_IN_TOOLS[tool.name])
      }
    })

    it('every tool carries a title, description, and object input schema', () => {
      for (const tool of service.getTools()) {
        expect(tool.title, `title for ${tool.name}`).toBeTruthy()
        expect(tool.description, `description for ${tool.name}`).toBeTruthy()
        expect(tool.inputSchema.type, `inputSchema for ${tool.name}`).toBe('object')
      }
    })

    it('appends contributed extra tools without their invoke implementation', async () => {
      const extras = createAiSurfaceService({
        store,
        schemas,
        extraTools: [
          {
            name: 'my_extra_tool',
            title: 'My extra tool',
            description: 'A contributed tool.',
            risk: 'low',
            requiredScopes: ['workspace.read'],
            inputSchema: { type: 'object', properties: {} },
            invoke: (args) => ({ echo: args })
          },
          {
            // Collides with a built-in name: the built-in must win everywhere.
            name: 'xnet_search',
            title: 'Shadowing search',
            description: 'Must be dropped.',
            risk: 'low',
            requiredScopes: ['workspace.read'],
            inputSchema: { type: 'object', properties: {} },
            invoke: () => 'shadowed'
          }
        ]
      })

      const tools = extras.getTools()
      expect(tools.map((tool) => tool.name)).toEqual([
        ...Object.keys(EXPECTED_BUILT_IN_TOOLS),
        'my_extra_tool'
      ])
      expect(tools.some((tool) => 'invoke' in tool)).toBe(false)

      await expect(extras.callTool('my_extra_tool', { a: 1 })).resolves.toEqual({
        echo: { a: 1 }
      })
      const search = (await extras.callTool('xnet_search', { query: 'roadmap' })) as Record<
        string,
        unknown
      >
      expect(search).not.toBe('shadowed')
      expect(search.count).toBe(1)
    })
  })

  describe('callTool dispatch', () => {
    it('xnet_search finds nodes by property text and validates required args', async () => {
      const result = (await service.callTool('xnet_search', { query: 'roadmap' })) as {
        count: number
        results: Array<{ id: string; schemaId: string }>
      }
      expect(result.count).toBe(1)
      expect(result.results[0].id).toBe('page-1')
      expect(result.results[0].schemaId).toBe(PAGE_SCHEMA)

      await expect(service.callTool('xnet_search', {})).rejects.toThrow(
        'query must be a non-empty string'
      )
    })

    it('xnet_database_describe reports schema, columns, views, and row schema', async () => {
      const result = (await service.callTool('xnet_database_describe', {
        databaseId: 'db-1'
      })) as Record<string, unknown>

      expect(result.rowSchemaId).toBe(ROW_SCHEMA)
      expect(result.columns).toEqual([{ id: 'col-title', name: 'Title', type: 'text' }])
      expect(result.views).toEqual([{ id: 'view-1', name: 'All tasks' }])
      expect((result.database as Record<string, unknown>).id).toBe('db-1')
      expect(result.revision).toBe('updatedAt:90')
    })

    it('xnet_database_query filters rows by database membership via list fallback', async () => {
      const result = (await service.callTool('xnet_database_query', {
        databaseId: 'db-1'
      })) as {
        rows: Array<{ id: string }>
        count: number
        queryPlan: { strategy: string }
      }

      expect(result.count).toBe(1)
      expect(result.rows[0].id).toBe('row-1')
      expect(result.queryPlan.strategy).toBe('list-fallback')
    })

    it('xnet_canvas_list returns only canvas nodes', async () => {
      const result = (await service.callTool('xnet_canvas_list', {})) as {
        count: number
        canvases: Array<{ id: string }>
      }
      expect(result.count).toBe(1)
      expect(result.canvases[0].id).toBe('canvas-1')
    })

    it('throws the unknown-tool error for unregistered names', async () => {
      await expect(service.callTool('xnet_nonexistent')).rejects.toThrow(
        'Unknown AI surface tool: xnet_nonexistent'
      )
    })
  })

  describe('page markdown mutation round-trip (plan → apply → rollback → audit)', () => {
    const editedMarkdown = '# Meeting Notes\n\nDiscussed roadmap milestones.\n\nAdded a decision.'

    async function planPagePatch(): Promise<AiMutationPlan> {
      return (await service.callTool('xnet_plan_page_patch', {
        pageId: 'page-1',
        markdown: editedMarkdown,
        intent: 'Add a decision',
        actor: 'characterization-test'
      })) as AiMutationPlan
    }

    it('plans a validated replaceMarkdown mutation with a review diff', async () => {
      const plan = await planPagePatch()

      expect(plan.validation.valid).toBe(true)
      expect(plan.status).toBe('validated')
      expect(plan.actor).toBe('characterization-test')
      expect(plan.risk).toBe('medium')
      expect(plan.requiredScopes).toEqual(['page.read', 'page.propose'])
      expect(plan.changes).toHaveLength(1)
      expect(plan.changes[0].targetKind).toBe('page')
      expect(plan.changes[0].targetId).toBe('page-1')
      expect(plan.changes[0].baseRevision).toBe('updatedAt:100')
      expect(plan.changes[0].operations[0].op).toBe('replaceMarkdown')
      expect(plan.changes[0].operations[0].args.markdown).toBe(editedMarkdown)
      expect(plan.changes[0].operations[0].args.diff).toContain('+Added a decision.')
      // Body markdown without frontmatter validates with a warning, not an error.
      expect(plan.validation.warnings).toContain('Markdown is missing xNet frontmatter identity')
    })

    it('applies, records an audit event, and rolls back to the previous markdown', async () => {
      const plan = await planPagePatch()

      const applied = (await service.callTool('xnet_apply_page_markdown', {
        plan,
        confirmApply: true
      })) as AiPageMarkdownApplyResult

      expect(applied.applied).toBe(true)
      expect(applied.pageId).toBe('page-1')
      expect(applied.planId).toBe(plan.id)
      expect(applied.mode).toBe('node-property')
      expect(applied.validation.valid).toBe(true)
      expect(applied.rollbackHandle).toMatch(/^rollback_/)
      expect(applied.auditEventId).toBeTruthy()

      const afterApply = store.nodes.get('page-1')
      expect(afterApply?.properties.markdown).toBe(editedMarkdown)
      expect(afterApply?.properties.aiLastAppliedPlanId).toBe(plan.id)

      // The audit log recorded the apply, retrievable by plan id.
      const audit = (await service.callTool('xnet_get_audit_log', { planId: plan.id })) as {
        events: AiAuditEvent[]
        count: number
      }
      expect(audit.count).toBe(1)
      expect(audit.events[0].planId).toBe(plan.id)
      expect(audit.events[0].actor).toBe('characterization-test')
      expect(audit.events[0].appliedChangeIds).toEqual(['page-1'])
      expect(audit.events[0].rollbackHandle).toBe(applied.rollbackHandle)

      const rolledBack = (await service.callTool('xnet_rollback_page_markdown', {
        rollbackHandle: applied.rollbackHandle,
        confirmRollback: true
      })) as AiPageMarkdownRollbackResult

      expect(rolledBack.rolledBack).toBe(true)
      expect(rolledBack.pageId).toBe('page-1')
      expect(rolledBack.planId).toBe(plan.id)
      expect(rolledBack.auditEventId).toBeTruthy()

      const afterRollback = store.nodes.get('page-1')
      expect(afterRollback?.properties.markdown).toBe(PAGE_MARKDOWN)
      expect(afterRollback?.properties.aiRolledBackPlanId).toBe(plan.id)

      // The rollback landed as a second audit event under the same plan id.
      const auditAfterRollback = (await service.callTool('xnet_get_audit_log', {
        planId: plan.id
      })) as { events: AiAuditEvent[]; count: number }
      expect(auditAfterRollback.count).toBe(2)
      expect(auditAfterRollback.events[1].actor).toBe('xnet-rollback')
      expect(auditAfterRollback.events[1].appliedChangeIds).toEqual(['rollback:page-1'])
    })

    it('requires explicit confirmation flags for apply and rollback', async () => {
      const plan = await planPagePatch()

      await expect(service.callTool('xnet_apply_page_markdown', { plan })).rejects.toThrow(
        'confirmApply must be true to apply a page Markdown plan'
      )
      await expect(
        service.callTool('xnet_rollback_page_markdown', { rollbackHandle: 'rollback_x' })
      ).rejects.toThrow('confirmRollback must be true to rollback a page Markdown apply')
    })

    it('reports unknown rollback handles without throwing', async () => {
      const result = (await service.callTool('xnet_rollback_page_markdown', {
        rollbackHandle: 'rollback_missing',
        confirmRollback: true
      })) as AiPageMarkdownRollbackResult

      expect(result.rolledBack).toBe(false)
      expect(result.pageId).toBe('unknown')
      expect(result.validation.errors).toEqual(['Unknown rollback handle: rollback_missing'])
    })

    it('rejects stale plans unless allowStale is set', async () => {
      const plan = await planPagePatch()
      // Move the live node past the plan's base revision.
      await store.update('page-1', { properties: { title: 'Meeting Notes (renamed)' } })

      const rejected = (await service.callTool('xnet_apply_page_markdown', {
        plan,
        confirmApply: true
      })) as AiPageMarkdownApplyResult
      expect(rejected.applied).toBe(false)
      expect(rejected.validation.errors[0]).toMatch(
        /baseRevision updatedAt:100 does not match live revision/
      )

      const allowed = (await service.callTool('xnet_apply_page_markdown', {
        plan,
        confirmApply: true,
        allowStale: true
      })) as AiPageMarkdownApplyResult
      expect(allowed.applied).toBe(true)
      expect(
        allowed.validation.warnings.some((w) => w.includes('does not match live revision'))
      ).toBe(true)
    })

    it('rejects structurally invalid plans instead of applying them', async () => {
      const result = (await service.callTool('xnet_apply_page_markdown', {
        plan: { id: 'plan_bogus' },
        confirmApply: true
      })) as AiPageMarkdownApplyResult

      expect(result.applied).toBe(false)
      expect(result.planId).toBe('plan_bogus')
      expect(result.validation.valid).toBe(false)
      expect(result.validation.errors.length).toBeGreaterThan(0)
    })
  })

  describe('frame placement (0346: plan → apply, compose)', () => {
    it('plans frame directives appended to the page and applies them', async () => {
      const plan = (await service.callTool('xnet_plan_frame_placement', {
        pageId: 'page-1',
        placements: [
          { nodeId: 'db-1', kind: 'database', viewType: 'map' },
          { nodeId: 'page-1', kind: 'page', title: 'Self reference' }
        ]
      })) as AiMutationPlan

      expect(plan.validation.valid).toBe(true)
      expect(plan.requiredScopes).toEqual(['page.read', 'page.propose'])
      const markdown = (plan.changes[0].operations[0].args as { markdown: string }).markdown
      expect(markdown).toContain(':::xnet-database')
      expect(markdown).toContain('"viewType":"map"')
      expect(markdown).toContain(':::xnet-page')

      const applied = (await service.callTool('xnet_apply_frame_placement', {
        plan,
        confirmApply: true
      })) as AiPageMarkdownApplyResult
      expect(applied.applied).toBe(true)
      expect(applied.auditEventId).toBeTruthy()
    })

    it('composes a new page of frames in one audited step', async () => {
      const result = (await service.callTool('xnet_compose_page', {
        title: 'Trip planner',
        intro: 'Everything about the trip.',
        placements: [{ nodeId: 'db-1', kind: 'database', viewType: 'table' }],
        confirmApply: true
      })) as { pageId: string; applied: boolean }

      expect(result.applied).toBe(true)
      const created = store.nodes.get(result.pageId)
      expect(created?.schemaId).toBe(PAGE_SCHEMA)
      expect(created?.properties.title).toBe('Trip planner')
    })

    it('refuses to compose without confirmApply', async () => {
      await expect(
        service.callTool('xnet_compose_page', {
          title: 'Nope',
          placements: [{ nodeId: 'db-1' }],
          confirmApply: false
        })
      ).rejects.toThrow('confirmApply must be true to compose a page')
    })
  })

  describe('database mutation round-trip (plan → apply, transactional rollback, audit)', () => {
    it('plans and applies a row create, recording an audit event', async () => {
      const plan = (await service.callTool('xnet_plan_database_mutation', {
        databaseId: 'db-1',
        operations: [{ op: 'createRow', args: { properties: { title: 'New row' } } }],
        actor: 'characterization-test'
      })) as AiMutationPlan

      expect(plan.validation.valid).toBe(true)
      expect(plan.risk).toBe('medium')
      expect(plan.requiredScopes).toEqual([
        'database.read',
        'database.propose',
        'database.write.rows'
      ])
      expect(plan.changes).toHaveLength(1)
      expect(plan.changes[0].targetKind).toBe('databaseRows')

      const applied = (await service.callTool('xnet_apply_database_mutation', {
        plan,
        confirmApply: true
      })) as AiDatabaseMutationApplyResult

      expect(applied.applied).toBe(true)
      expect(applied.appliedChangeIds).toEqual(['row:create:created-1'])
      expect(applied.rolledBackChangeIds).toEqual([])
      expect(applied.auditEventId).toBeTruthy()

      const createdRow = store.nodes.get('created-1')
      expect(createdRow?.schemaId).toBe(ROW_SCHEMA)
      expect(createdRow?.properties).toEqual({ database: 'db-1', title: 'New row' })

      const audit = (await service.callTool('xnet_get_audit_log', { planId: plan.id })) as {
        events: AiAuditEvent[]
        count: number
      }
      expect(audit.count).toBe(1)
      expect(audit.events[0].appliedChangeIds).toEqual(['row:create:created-1'])
    })

    it('rolls back already-applied row mutations when a later operation fails', async () => {
      const plan = (await service.callTool('xnet_plan_database_mutation', {
        databaseId: 'db-1',
        operations: [
          { op: 'createRow', args: { properties: { title: 'Will be rolled back' } } },
          { op: 'updateRow', args: { rowId: 'missing-row', properties: { title: 'Nope' } } }
        ]
      })) as AiMutationPlan
      expect(plan.validation.valid).toBe(true)

      const result = (await service.callTool('xnet_apply_database_mutation', {
        plan,
        confirmApply: true
      })) as AiDatabaseMutationApplyResult

      expect(result.applied).toBe(false)
      expect(result.validation.errors).toEqual(['Node not found: missing-row'])
      expect(result.appliedChangeIds).toEqual(['row:create:created-1'])
      expect(result.rolledBackChangeIds).toEqual(['row:rollback-delete:created-1'])
      expect(
        result.validation.warnings.some((warning) =>
          warning.includes('Previously applied row mutations in this plan were rolled back.')
        )
      ).toBe(true)

      // The created row was deleted again by the rollback.
      expect(store.nodes.get('created-1')?.deleted).toBe(true)

      // Failed applies do not append audit events.
      const audit = (await service.callTool('xnet_get_audit_log', { planId: plan.id })) as {
        count: number
      }
      expect(audit.count).toBe(0)
    })

    it('requires confirmDelete for destructive row operations at plan time', async () => {
      const plan = (await service.callTool('xnet_plan_database_mutation', {
        databaseId: 'db-1',
        operations: [{ op: 'deleteRow', args: { rowId: 'row-1' } }]
      })) as AiMutationPlan

      expect(plan.validation.valid).toBe(false)
      expect(plan.risk).toBe('high')
      expect(plan.validation.errors).toEqual([
        'operations[0] delete/drop/remove operations require confirmDelete true or deletionMarker "DELETE"'
      ])
    })
  })

  describe('readResource URI families', () => {
    it('serves the workspace summary as compact JSON', async () => {
      const content = await service.readResource('xnet://workspace/summary')
      expect(content.uri).toBe('xnet://workspace/summary')
      expect(content.mimeType).toBe('application/json')

      const summary = JSON.parse(content.text) as Record<string, unknown>
      expect(summary.nodeSampleCount).toBe(4)
      expect(summary.schemaCount).toBe(4)
      expect(summary.schemaCounts).toEqual({
        [PAGE_SCHEMA]: 1,
        [DATABASE_SCHEMA]: 1,
        [ROW_SCHEMA]: 1,
        [CANVAS_SCHEMA]: 1
      })
      const tools = summary.tools as Array<{ name: string }>
      expect(tools.map((tool) => tool.name)).toEqual(Object.keys(EXPECTED_BUILT_IN_TOOLS))
    })

    it('serves page markdown with xNet frontmatter identity', async () => {
      const content = await service.readResource('xnet://page/page-1.md')
      expect(content.mimeType).toBe('text/markdown')
      expect(content.text).toContain('id: "page-1"')
      expect(content.text).toContain(`schemaId: "${PAGE_SCHEMA}"`)
      expect(content.text).toContain('revision: "updatedAt:100"')
      expect(content.text).toContain('# Meeting Notes')
      expect(content.text.startsWith('---\nxnet:\n')).toBe(true)
    })

    it('serves the page outline extracted from the markdown projection', async () => {
      const content = await service.readResource('xnet://page/page-1/outline')
      const outline = JSON.parse(content.text) as {
        pageId: string
        headings: Array<{ level: number; title: string }>
      }
      expect(outline.pageId).toBe('page-1')
      expect(outline.headings).toEqual([{ level: 1, title: 'Meeting Notes', lineNumber: 1 }])
    })

    it('serves the database schema projection', async () => {
      const content = await service.readResource('xnet://database/db-1/schema')
      expect(content.mimeType).toBe('application/json')

      const described = JSON.parse(content.text) as Record<string, unknown>
      expect(described.rowSchemaId).toBe(ROW_SCHEMA)
      expect(described.columns).toEqual([{ id: 'col-title', name: 'Title', type: 'text' }])
      expect((described.database as Record<string, unknown>).id).toBe('db-1')
    })

    it('serves canvas objects with normalized geometry', async () => {
      const content = await service.readResource('xnet://canvas/canvas-1/objects')
      const canvas = JSON.parse(content.text) as {
        canvasId: string
        count: number
        objects: Array<Record<string, unknown>>
      }
      expect(canvas.canvasId).toBe('canvas-1')
      expect(canvas.count).toBe(1)
      expect(canvas.objects[0]).toMatchObject({
        id: 'obj-1',
        type: 'note',
        x: 0,
        y: 0,
        width: 240,
        height: 160
      })
    })

    it('rejects malformed and unknown resource URIs with the exact error messages', async () => {
      await expect(service.readResource('not-a-uri')).rejects.toThrow(
        'Invalid xNet resource URI: not-a-uri'
      )
      await expect(service.readResource('https://example.com/x')).rejects.toThrow(
        'Invalid xNet resource URI: https://example.com/x'
      )
      await expect(service.readResource('xnet://bogus/whatever')).rejects.toThrow(
        'Resource not found: xnet://bogus/whatever'
      )
      await expect(service.readResource('xnet://page/nope.md')).rejects.toThrow(
        'Node not found: nope'
      )
    })
  })

  describe('getResources', () => {
    it('lists the advertised resource URI templates', () => {
      expect(service.getResources().map((resource) => resource.uri)).toEqual([
        'xnet://workspace/summary',
        'xnet://workspace/recent',
        'xnet://nodes',
        'xnet://schemas',
        'xnet://page/{pageId}.md',
        'xnet://page/{pageId}/outline',
        'xnet://database/{databaseId}/schema',
        'xnet://database/{databaseId}/views',
        'xnet://database/{databaseId}/sample?limit=10',
        'xnet://canvas/{canvasId}/viewport?x=0&y=0&w=1000&h=800',
        'xnet://canvas/{canvasId}/objects',
        'xnet://canvas/{canvasId}/selection?ids=object-1,object-2',
        'xnet://canvas/{canvasId}/json-canvas'
      ])
    })
  })
})
