/**
 * Tests for the AI surface contract.
 */

import type { NodeStoreAPI, SchemaRegistryAPI } from '../services/local-api'
import { describe, expect, it, vi } from 'vitest'
import {
  attachAiPlanValidation,
  createAiOperation,
  createAiSurfaceService,
  getXNetMarkdownDirectiveSpecs,
  parseAiMutationPlan,
  renderMarkdownLineDiff,
  serializeAiMutationPlan,
  validateXNetPageMarkdown,
  type AiPageMarkdownApplyAdapterInput,
  validateAiMutationPlan,
  type AiMutationPlan
} from '../ai-surface'

type MockNode = {
  id: string
  schemaId: string
  properties: Record<string, unknown>
  deleted: boolean
  createdAt: number
  updatedAt: number
}

function createMockStore(initialNodes: MockNode[]): NodeStoreAPI {
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
        createdAt: 1,
        updatedAt: 1
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
  return {
    getAllIRIs: () => ['xnet://xnet.fyi/Page@1.0.0'],
    get: async (iri) =>
      iri === 'xnet://xnet.fyi/Page@1.0.0'
        ? { iri, name: 'Page', properties: { title: { type: 'text' } } }
        : null
  }
}

function createValidPlan(overrides: Partial<AiMutationPlan> = {}): AiMutationPlan {
  return {
    id: 'plan_1',
    actor: 'test-agent',
    intent: 'Rewrite a page section',
    risk: 'medium',
    requiredScopes: ['page.read', 'page.propose'],
    changes: [
      {
        targetKind: 'page',
        targetId: 'page_1',
        baseRevision: 'updatedAt:1',
        operations: [
          createAiOperation(
            'replaceMarkdown',
            { markdown: '# Updated page' },
            'User asked for a rewrite'
          )
        ]
      }
    ],
    validation: { valid: true, errors: [], warnings: [] },
    createdAt: '2026-06-02T12:00:00.000Z',
    status: 'proposed',
    ...overrides
  }
}

describe('AI surface contract', () => {
  describe('validateAiMutationPlan', () => {
    it('accepts a valid mutation plan', () => {
      const validation = validateAiMutationPlan(createValidPlan())

      expect(validation.valid).toBe(true)
      expect(validation.errors).toEqual([])
    })

    it('rejects unsupported risk levels and scopes', () => {
      const invalid = {
        ...createValidPlan(),
        risk: 'severe',
        requiredScopes: ['page.read', 'page.destroy']
      }

      const validation = validateAiMutationPlan(invalid)

      expect(validation.valid).toBe(false)
      expect(validation.errors).toContain('risk must be one of: low, medium, high, critical')
      expect(validation.errors).toContain('requiredScopes[1] is not a supported AI scope')
    })

    it('requires critical risk for storage recovery scope', () => {
      const validation = validateAiMutationPlan(
        createValidPlan({
          risk: 'high',
          requiredScopes: ['storage.recovery'],
          changes: [
            {
              targetKind: 'storage',
              targetId: 'local',
              baseRevision: 'snapshot:1',
              operations: [createAiOperation('restoreSnapshot', { snapshotId: 'snapshot_1' })]
            }
          ]
        })
      )

      expect(validation.valid).toBe(false)
      expect(validation.errors).toContain('storage.recovery scope requires critical risk')
    })

    it('warns when low-risk plans request write scopes', () => {
      const validation = validateAiMutationPlan(
        createValidPlan({
          risk: 'low',
          requiredScopes: ['page.write']
        })
      )

      expect(validation.valid).toBe(true)
      expect(validation.warnings).toContain('low-risk plans should not request write scopes')
    })
  })

  describe('serialization', () => {
    it('round-trips a valid mutation plan', () => {
      const plan = createValidPlan()
      const serialized = serializeAiMutationPlan(plan)
      const parsed = parseAiMutationPlan(serialized)

      expect(parsed.validation.valid).toBe(true)
      expect(parsed.plan?.id).toBe(plan.id)
      expect(parsed.plan?.changes[0].operations[0].op).toBe('replaceMarkdown')
    })

    it('returns validation errors for invalid JSON', () => {
      const parsed = parseAiMutationPlan('{not-json')

      expect(parsed.plan).toBeNull()
      expect(parsed.validation.valid).toBe(false)
      expect(parsed.validation.errors[0]).toContain('Invalid mutation plan JSON')
    })
  })

  describe('attachAiPlanValidation', () => {
    it('updates plan status based on validation', () => {
      const plan = attachAiPlanValidation(createValidPlan())

      expect(plan.status).toBe('validated')
      expect(plan.validation.valid).toBe(true)
    })
  })

  describe('page Markdown validation', () => {
    it('exposes the xNet Markdown directive contract used by editor Markdown IO', () => {
      expect(getXNetMarkdownDirectiveSpecs().map((spec) => spec.name)).toEqual([
        'xnet-database',
        'xnet-page',
        'xnet-embed',
        'xnet-ref',
        'xnet-db-ref',
        'wikilink'
      ])
      expect(getXNetMarkdownDirectiveSpecs().map((spec) => spec.editorExtension)).toContain(
        'DatabaseEmbedExtension'
      )
    })

    it('validates xNet frontmatter and supported directives', () => {
      const markdown = [
        '---',
        'xnet:',
        '  id: "page_1"',
        '  schemaId: "xnet://xnet.fyi/Page@1.0.0"',
        '  revision: "updatedAt:1"',
        '  exportedAt: "2026-06-02T12:00:00.000Z"',
        '---',
        '',
        '# Product Roadmap',
        '',
        ':::xnet-database',
        '{"databaseId":"db-roadmap","viewType":"board"}',
        ':::',
        '',
        'Related {{xnet-ref {"nodeId":"task_1","label":"Launch beta"}}} and [[Planning]].'
      ].join('\n')

      const result = validateXNetPageMarkdown(markdown, {
        pageId: 'page_1',
        schemaId: 'xnet://xnet.fyi/Page@1.0.0',
        baseRevision: 'updatedAt:1'
      })

      expect(result.validation.valid).toBe(true)
      expect(result.frontmatter?.id).toBe('page_1')
      expect(result.directives.map((directive) => directive.name)).toEqual([
        'xnet-database',
        'xnet-ref',
        'wikilink'
      ])
    })

    it('rejects mismatched identity and malformed xNet directive JSON', () => {
      const markdown = [
        '---',
        'xnet:',
        '  id: "wrong_page"',
        '  schemaId: "xnet://xnet.fyi/Page@1.0.0"',
        '---',
        '',
        ':::xnet-page',
        '{"pageId":',
        ':::'
      ].join('\n')

      const result = validateXNetPageMarkdown(markdown, {
        pageId: 'page_1',
        schemaId: 'xnet://xnet.fyi/Page@1.0.0'
      })

      expect(result.validation.valid).toBe(false)
      expect(result.validation.errors).toContain(
        'Frontmatter page id wrong_page does not match target page page_1'
      )
      expect(result.validation.errors).toContain(
        'xnet-page block directive payload must be valid JSON'
      )
    })

    it('renders simple line diffs for Markdown review payloads', () => {
      expect(renderMarkdownLineDiff('# A\nold', '# A\nnew')).toBe(' # A\n-old\n+new')
    })
  })

  describe('page Markdown apply', () => {
    it('applies validated page Markdown plans through the node-property fallback', async () => {
      const store = createMockStore([
        {
          id: 'page_1',
          schemaId: 'xnet://xnet.fyi/Page@1.0.0',
          properties: { title: 'Product Roadmap', markdown: 'Original' },
          deleted: false,
          createdAt: 1,
          updatedAt: 10
        }
      ])
      const service = createAiSurfaceService({
        store,
        schemas: createMockSchemas(),
        clock: () => new Date('2026-06-02T12:00:00.000Z')
      })
      const markdown = [
        '---',
        'xnet:',
        '  id: "page_1"',
        '  schemaId: "xnet://xnet.fyi/Page@1.0.0"',
        '  revision: "updatedAt:10"',
        '---',
        '',
        '# Product Roadmap',
        '',
        'Updated body'
      ].join('\n')
      const plan = (await service.callTool('xnet_plan_page_patch', {
        pageId: 'page_1',
        baseRevision: 'updatedAt:10',
        markdown
      })) as AiMutationPlan

      const result = await service.callTool('xnet_apply_page_markdown', {
        plan,
        confirmApply: true
      })
      const updated = await store.get('page_1')

      expect(result).toMatchObject({
        applied: true,
        pageId: 'page_1',
        planId: plan.id,
        mode: 'node-property'
      })
      expect(updated?.properties.markdown).toBe('# Product Roadmap\n\nUpdated body')
      expect(updated?.properties.aiLastAppliedPlanId).toBe(plan.id)
    })

    it('uses a configured TipTap/Yjs adapter instead of updating node markdown directly', async () => {
      const store = createMockStore([
        {
          id: 'page_1',
          schemaId: 'xnet://xnet.fyi/Page@1.0.0',
          properties: { title: 'Product Roadmap', markdown: 'Original' },
          deleted: false,
          createdAt: 1,
          updatedAt: 10
        }
      ])
      const applyMarkdown = vi.fn(async (_input: AiPageMarkdownApplyAdapterInput) => ({
        mode: 'tiptap-yjs' as const,
        yjsField: 'content',
        documentUpdate: { kind: 'replaceXmlFragment' }
      }))
      const service = createAiSurfaceService({
        store,
        schemas: createMockSchemas(),
        pageMarkdownAdapter: { applyMarkdown },
        clock: () => new Date('2026-06-02T12:00:00.000Z')
      })
      const plan = (await service.callTool('xnet_plan_page_patch', {
        pageId: 'page_1',
        baseRevision: 'updatedAt:10',
        markdown: '# Product Roadmap\n\nUpdated body'
      })) as AiMutationPlan

      const result = await service.callTool('xnet_apply_page_markdown', {
        plan,
        confirmApply: true
      })
      const unchanged = await store.get('page_1')

      expect(result).toMatchObject({
        applied: true,
        mode: 'tiptap-yjs',
        yjsField: 'content',
        documentUpdate: { kind: 'replaceXmlFragment' }
      })
      expect(applyMarkdown).toHaveBeenCalledWith(
        expect.objectContaining({
          pageId: 'page_1',
          bodyMarkdown: '# Product Roadmap\n\nUpdated body',
          baseRevision: 'updatedAt:10'
        })
      )
      expect(unchanged?.properties.markdown).toBe('Original')
    })

    it('validates and applies AI-edited pages with page, database, embed, reference, and wikilink directives', async () => {
      const store = createMockStore([
        {
          id: 'page_1',
          schemaId: 'xnet://xnet.fyi/Page@1.0.0',
          properties: { title: 'Product Roadmap', markdown: 'Original' },
          deleted: false,
          createdAt: 1,
          updatedAt: 10
        }
      ])
      const applyMarkdown = vi.fn(async (_input: AiPageMarkdownApplyAdapterInput) => ({
        mode: 'tiptap-yjs' as const,
        yjsField: 'content'
      }))
      const service = createAiSurfaceService({
        store,
        schemas: createMockSchemas(),
        pageMarkdownAdapter: { applyMarkdown },
        clock: () => new Date('2026-06-02T12:00:00.000Z')
      })
      const markdown = [
        '---',
        'xnet:',
        '  id: "page_1"',
        '  schemaId: "xnet://xnet.fyi/Page@1.0.0"',
        '  revision: "updatedAt:10"',
        '---',
        '',
        '# Product Roadmap',
        '',
        ':::xnet-database',
        '{"databaseId":"db-roadmap","viewType":"board"}',
        ':::',
        '',
        ':::xnet-page',
        '{"pageId":"default/roadmap","title":"Roadmap"}',
        ':::',
        '',
        ':::xnet-embed',
        '{"url":"https://example.com/demo","provider":"link","title":"Demo"}',
        ':::',
        '',
        'Related {{xnet-ref {"url":"https://github.com/xnetjs/xNet/issues/301","provider":"github","kind":"issue","refId":"301","title":"Issue 301"}}}, {{xnet-db-ref {"databaseId":"db-roadmap","title":"Roadmap DB"}}}, and [[Planning]].'
      ].join('\n')

      const plan = (await service.callTool('xnet_plan_page_patch', {
        pageId: 'page_1',
        baseRevision: 'updatedAt:10',
        markdown
      })) as AiMutationPlan
      const result = await service.callTool('xnet_apply_page_markdown', {
        plan,
        confirmApply: true
      })

      expect(plan.validation.valid).toBe(true)
      expect(plan.changes[0].operations[0].args.directiveCount).toBe(6)
      expect(result).toMatchObject({
        applied: true,
        mode: 'tiptap-yjs',
        yjsField: 'content'
      })
      const adapterInput = applyMarkdown.mock.calls[0]?.[0]
      expect(adapterInput?.bodyMarkdown).toContain(':::xnet-database')
      expect(adapterInput?.bodyMarkdown).toContain('{{xnet-db-ref')
      expect(adapterInput?.bodyMarkdown).toContain('[[Planning]]')
    })

    it('refuses stale page Markdown plans unless stale apply is explicitly allowed', async () => {
      const store = createMockStore([
        {
          id: 'page_1',
          schemaId: 'xnet://xnet.fyi/Page@1.0.0',
          properties: { title: 'Product Roadmap', markdown: 'Original' },
          deleted: false,
          createdAt: 1,
          updatedAt: 10
        }
      ])
      const service = createAiSurfaceService({
        store,
        schemas: createMockSchemas(),
        clock: () => new Date('2026-06-02T12:00:00.000Z')
      })
      const plan = (await service.callTool('xnet_plan_page_patch', {
        pageId: 'page_1',
        baseRevision: 'updatedAt:10',
        markdown: '# Product Roadmap\n\nUpdated body'
      })) as AiMutationPlan
      await store.update('page_1', { properties: { title: 'Renamed' } })

      const result = await service.callTool('xnet_apply_page_markdown', {
        plan,
        confirmApply: true
      })

      expect(result).toMatchObject({
        applied: false,
        pageId: 'page_1'
      })
      expect(JSON.stringify(result)).toContain('does not match live revision')
    })
  })
})
