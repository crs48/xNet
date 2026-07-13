/**
 * Page Markdown tools: read/validate projections, plan-only patches, and the
 * confirmed apply/rollback pair (plan → apply → rollback, audit-logged).
 */

import type { AiToolEntry } from './entry'
import { readOptionalBoolean, readOptionalString, readRequiredString } from '../args'
import { validateXNetPageMarkdown } from '../page-markdown'

export const readPageMarkdownTool: AiToolEntry = {
  definition: {
    name: 'xnet_read_page_markdown',
    title: 'Read page Markdown',
    description: 'Read a page as Markdown with optional xNet frontmatter.',
    risk: 'low',
    requiredScopes: ['page.read'],
    inputSchema: {
      type: 'object',
      properties: {
        pageId: { type: 'string', description: 'Page node id.' },
        includeFrontmatter: {
          type: 'boolean',
          description: 'Include xNet identity frontmatter. Defaults to true.'
        }
      },
      required: ['pageId']
    }
  },
  execute: async (host, args) => {
    const content = await host.readPageMarkdown(
      readRequiredString(args, 'pageId'),
      readOptionalBoolean(args, 'includeFrontmatter') ?? true
    )
    return { markdown: content.text, mimeType: content.mimeType, uri: content.uri }
  }
}

export const validatePageMarkdownTool: AiToolEntry = {
  definition: {
    name: 'xnet_validate_page_markdown',
    title: 'Validate page Markdown',
    description: 'Validate xNet page frontmatter and supported xNet Markdown directives.',
    risk: 'low',
    requiredScopes: ['page.read'],
    inputSchema: {
      type: 'object',
      properties: {
        pageId: { type: 'string', description: 'Optional target page node id.' },
        baseRevision: { type: 'string', description: 'Optional expected base revision.' },
        markdown: { type: 'string', description: 'Markdown to validate.' }
      },
      required: ['markdown']
    }
  },
  execute: async (host, args) => {
    const pageId = readOptionalString(args, 'pageId')
    const node = pageId ? await host.getNodeOrThrow(pageId) : null
    return validateXNetPageMarkdown(readRequiredString(args, 'markdown'), {
      pageId,
      schemaId: node?.schemaId,
      baseRevision: readOptionalString(args, 'baseRevision')
    })
  }
}

export const planPagePatchTool: AiToolEntry = {
  definition: {
    name: 'xnet_plan_page_patch',
    title: 'Plan page Markdown patch',
    description: 'Validate an edited Markdown page and return a mutation plan without applying it.',
    risk: 'medium',
    requiredScopes: ['page.read', 'page.propose'],
    inputSchema: {
      type: 'object',
      properties: {
        pageId: { type: 'string', description: 'Page node id.' },
        baseRevision: { type: 'string', description: 'Revision the patch was based on.' },
        markdown: { type: 'string', description: 'Proposed full Markdown replacement.' },
        intent: { type: 'string', description: 'User or agent intent for the patch.' },
        actor: { type: 'string', description: 'Agent or user creating the plan.' }
      },
      required: ['pageId', 'markdown']
    }
  },
  execute: async (host, args) => await host.planPagePatch(args)
}

export const applyPageMarkdownTool: AiToolEntry = {
  definition: {
    name: 'xnet_apply_page_markdown',
    title: 'Apply page Markdown plan',
    description:
      'Apply a validated page Markdown mutation plan through the configured BlockNote/Yjs document adapter, with a node-property fallback.',
    risk: 'high',
    requiredScopes: ['page.read', 'page.write'],
    inputSchema: {
      type: 'object',
      properties: {
        plan: { type: 'object', description: 'Validated page Markdown mutation plan.' },
        confirmApply: {
          type: 'boolean',
          description: 'Must be true to apply the page Markdown plan.'
        },
        allowStale: {
          type: 'boolean',
          description: 'Allow applying when the plan base revision differs from the live node.'
        }
      },
      required: ['plan', 'confirmApply']
    }
  },
  execute: async (host, args) => await host.applyPageMarkdown(args)
}

export const rollbackPageMarkdownTool: AiToolEntry = {
  definition: {
    name: 'xnet_rollback_page_markdown',
    title: 'Rollback page Markdown apply',
    description: 'Rollback a previously applied page Markdown plan by rollback handle.',
    risk: 'high',
    requiredScopes: ['page.write'],
    inputSchema: {
      type: 'object',
      properties: {
        rollbackHandle: { type: 'string', description: 'Rollback handle from apply result.' },
        confirmRollback: {
          type: 'boolean',
          description: 'Must be true to perform the rollback.'
        }
      },
      required: ['rollbackHandle', 'confirmRollback']
    }
  },
  execute: async (host, args) => await host.rollbackPageMarkdown(args)
}
