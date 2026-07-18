/**
 * Frame placement tools (exploration 0346, Phase 5) — the agent as
 * composer, declarative tier only.
 *
 * The agent places FRAMES (live registered views over real nodes) on
 * pages by emitting the page-markdown directives the editor already
 * round-trips (`:::xnet-database`, `:::xnet-page`) — never throwaway
 * generated UI. Everything rides the existing plan → validate → apply
 * pipeline, so placements are scoped, previewable, audited, and
 * rollbackable like any other mutation.
 */

import type { AiToolEntry } from './entry'
import { readOptionalRecord, readOptionalString, readRequiredString } from '../args'

interface FramePlacementInput {
  nodeId: string
  kind: 'database' | 'page'
  viewType?: string
  title?: string
  config?: Record<string, unknown>
}

function readPlacements(args: Record<string, unknown>): FramePlacementInput[] {
  const raw = args.placements
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error('placements must be a non-empty array')
  }
  return raw.map((entry, index) => {
    if (typeof entry !== 'object' || entry === null) {
      throw new Error(`placements[${index}] must be an object`)
    }
    const record = entry as Record<string, unknown>
    const nodeId = record.nodeId
    if (typeof nodeId !== 'string' || !nodeId) {
      throw new Error(`placements[${index}].nodeId is required`)
    }
    const kind = record.kind === 'page' ? 'page' : 'database'
    return {
      nodeId,
      kind,
      viewType: typeof record.viewType === 'string' ? record.viewType : undefined,
      title: typeof record.title === 'string' ? record.title : undefined,
      config:
        typeof record.config === 'object' && record.config !== null
          ? (record.config as Record<string, unknown>)
          : undefined
    }
  })
}

/** Render one placement as its page-markdown block directive. */
export function framePlacementDirective(placement: FramePlacementInput): string {
  if (placement.kind === 'page') {
    const payload = { nodeId: placement.nodeId, title: placement.title ?? '' }
    return `:::xnet-page\n${JSON.stringify(payload)}\n:::`
  }
  const payload = {
    databaseId: placement.nodeId,
    viewType: placement.viewType ?? 'table',
    viewConfig: placement.config ?? {}
  }
  return `:::xnet-database\n${JSON.stringify(payload)}\n:::`
}

/** Compose a markdown body from intro text + frame directives. */
export function frameMarkdownBody(
  intro: string | undefined,
  placements: FramePlacementInput[]
): string {
  const sections = placements.map((p) => framePlacementDirective(p))
  return [intro?.trim(), ...sections].filter(Boolean).join('\n\n')
}

const placementsSchema = {
  type: 'array',
  description:
    'Frames to place, in order. kind "database" embeds a live database view ' +
    '(viewType: table | board | list | gallery | calendar | timeline | map | plugin types); ' +
    'kind "page" embeds a live page transclusion.',
  items: {
    type: 'object',
    properties: {
      nodeId: { type: 'string', description: 'Target node id (database or page).' },
      kind: { type: 'string', enum: ['database', 'page'] },
      viewType: { type: 'string', description: 'Registry view type for database frames.' },
      title: { type: 'string', description: 'Display title for page frames.' },
      config: { type: 'object', description: 'Per-view presentation config.' }
    },
    required: ['nodeId']
  }
} as const

export const planFramePlacementTool: AiToolEntry = {
  definition: {
    name: 'xnet_plan_frame_placement',
    title: 'Plan frame placement',
    description:
      'Plan appending live frames (database views, page transclusions) to an existing page. ' +
      'Returns a validated mutation plan with a review diff; apply with xnet_apply_frame_placement.',
    risk: 'medium',
    requiredScopes: ['page.read', 'page.propose'],
    inputSchema: {
      type: 'object',
      properties: {
        pageId: { type: 'string', description: 'Page to place frames on.' },
        placements: placementsSchema,
        intent: { type: 'string', description: 'Why these frames are being placed.' }
      },
      required: ['pageId', 'placements']
    }
  },
  execute: async (host, args) => {
    const pageId = readRequiredString(args, 'pageId')
    const placements = readPlacements(args)
    const current = await host.readPageMarkdown(pageId, true)
    const markdown = `${current.text.trimEnd()}\n\n${frameMarkdownBody(undefined, placements)}\n`
    return host.planPagePatch({
      pageId,
      markdown,
      actor: readOptionalString(args, 'actor') ?? 'ai-agent',
      intent:
        readOptionalString(args, 'intent') ??
        `Place ${placements.length} frame${placements.length === 1 ? '' : 's'} on the page`
    })
  }
}

export const applyFramePlacementTool: AiToolEntry = {
  definition: {
    name: 'xnet_apply_frame_placement',
    title: 'Apply frame placement',
    description:
      'Apply a validated frame-placement plan (from xnet_plan_frame_placement). Requires ' +
      'confirmApply: true. Audited and rollbackable via xnet_rollback_page_markdown.',
    risk: 'high',
    requiredScopes: ['page.write'],
    inputSchema: {
      type: 'object',
      properties: {
        plan: { type: 'object', description: 'The validated mutation plan.' },
        confirmApply: { type: 'boolean', description: 'Must be true to apply.' }
      },
      required: ['plan', 'confirmApply']
    }
  },
  execute: async (host, args) => host.applyPageMarkdown(args)
}

export const composePageTool: AiToolEntry = {
  definition: {
    name: 'xnet_compose_page',
    title: 'Compose a page of frames',
    description:
      'Create a new page and seed it with intro text plus live frames (database views, page ' +
      'transclusions) in one audited step. The result is ordinary editable content — every ' +
      'frame stays live and human-editable. Requires confirmApply: true.',
    risk: 'high',
    requiredScopes: ['page.write'],
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'New page title.' },
        intro: { type: 'string', description: 'Optional intro paragraph (markdown).' },
        placements: placementsSchema,
        confirmApply: { type: 'boolean', description: 'Must be true to create and compose.' },
        intent: { type: 'string' }
      },
      required: ['title', 'placements', 'confirmApply']
    }
  },
  execute: async (host, args) => {
    const title = readRequiredString(args, 'title')
    const placements = readPlacements(args)
    const body = frameMarkdownBody(readOptionalString(args, 'intro'), placements)
    return host.composePage({
      title,
      markdown: body,
      confirmApply: args.confirmApply === true,
      actor: readOptionalString(args, 'actor') ?? 'ai-agent',
      intent: readOptionalString(args, 'intent') ?? `Compose page "${title}"`,
      extra: readOptionalRecord(args, 'extra') ?? undefined
    })
  }
}

export const frameToolEntries: readonly AiToolEntry[] = [
  planFramePlacementTool,
  applyFramePlacementTool,
  composePageTool
]
