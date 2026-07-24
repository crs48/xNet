/**
 * Read-only tools for the in-app assistant (exploration 0394, Phase 1).
 *
 * The 28 `xnet_*` tools already reached MCP clients, the CLI, and the bridge;
 * the in-app chat was the one consumer that never got them, so it could only
 * answer from whatever context happened to be injected. This selects the
 * subset it may call and turns it into provider tool specs.
 *
 * Phase 1 is deliberately read-only. Nothing here can write, propose, or
 * fetch: the plan→approve→apply ceremony that makes writes safe has no in-chat
 * surface yet, and shipping write tools before the consent UI would be exactly
 * the over-promise the panel's capability badge used to warn about.
 */

import type { AiSurfaceService, AIToolSpec, ToolCallingFidelity } from '@xnetjs/plugins'

/**
 * The Phase 1 allow-list. Kept explicit rather than derived from `risk: 'low'`
 * alone so that adding a low-risk tool to the registry cannot silently widen
 * what the in-app assistant can reach — the two conditions are ANDed below.
 */
export const READ_ONLY_TOOL_NAMES = [
  'xnet_search',
  'xnet_graph_expand',
  'xnet_read_page_markdown',
  'xnet_database_describe',
  'xnet_database_query',
  'xnet_database_sample',
  'xnet_canvas_list',
  'xnet_canvas_read_viewport',
  'xnet_canvas_search',
  'xnet_get_audit_log'
] as const

const ALLOWED = new Set<string>(READ_ONLY_TOOL_NAMES)

/**
 * Whether a tier may be given tools at all.
 *
 * Only `reliable` tool-callers qualify. A `weak` tier (in-tab WebLLM) emits
 * malformed or hallucinated calls often enough that handing it tools produces
 * confident nonsense rather than grounded answers, and `none` cannot call them
 * at all — both are better served by the injected context pack. This is the
 * same fidelity signal `writeModeFor()` uses to decide propose-vs-apply.
 */
export function toolsEnabledFor(fidelity: ToolCallingFidelity | undefined): boolean {
  return fidelity === 'reliable'
}

/**
 * The read-only tool specs to advertise, in registry order. Returns `[]` when
 * the tier can't be trusted with tools, so the caller can pass the result
 * straight through without branching.
 */
export function readOnlyToolSpecs(
  surface: Pick<AiSurfaceService, 'getTools'> | null,
  fidelity: ToolCallingFidelity | undefined
): AIToolSpec[] {
  if (!surface || !toolsEnabledFor(fidelity)) return []
  return surface
    .getTools()
    .filter((tool) => ALLOWED.has(tool.name) && tool.risk === 'low')
    .map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: { ...tool.inputSchema }
    }))
}

/** Standing instructions describing the tools, appended when they're enabled. */
export const AI_TOOLS_PROMPT = [
  'You can call read-only tools to look things up in the workspace yourself —',
  'search it, read a page, describe or query a database, expand the graph around',
  'a node. Prefer calling a tool over guessing, and prefer it over saying you',
  'lack access. Cite what you found by title or id. These tools only read: you',
  'cannot create, edit, or delete anything, so when asked to make a change,',
  'describe precisely what you would change and ask the user to apply it.'
].join(' ')
