/**
 * Write tools for the in-app assistant (exploration 0394, Phase 2).
 *
 * Phase 1 was deliberately read-only; this is the other half. The assistant
 * may now be advertised the plan→apply cluster for pages, but only when:
 *
 *   1. the connector tier's tool-calling is `reliable` — the same fidelity
 *      gate {@link writeModeFor} uses to grant `agentic` writes at all, and
 *   2. the operator turned writes on for the panel (default OFF — a write
 *      surface must be opted into, never a side effect of picking a model).
 *
 * Advertising is not permission: every medium+ risk call still parks in the
 * approval ceremony (`ai-chat-ceremony.ts`) and executes only after the
 * operator releases it. The allow-list is explicit for the same reason as
 * Phase 1's: adding a tool to the registry must never silently widen what the
 * in-app assistant can reach.
 */

import type { AiSurfaceService, AIToolSpec, ToolCallingFidelity } from '@xnetjs/plugins'
import { writeModeFor } from '@xnetjs/plugins'

/**
 * The Phase 2 allow-list: the page plan→apply cluster plus page composition.
 * Deliberately page-centric — databases and canvas mutations arrive with
 * their own preview UI, not as a side effect of this ceremony.
 */
export const WRITE_TOOL_NAMES = [
  'xnet_validate_page_markdown',
  'xnet_plan_page_patch',
  'xnet_apply_page_markdown',
  'xnet_compose_page'
] as const

const ALLOWED = new Set<string>(WRITE_TOOL_NAMES)

/**
 * Whether write tools may be advertised at all for a tier. Mirrors
 * {@link writeModeFor}: only `agentic` (reliable) tiers qualify; propose-only
 * tiers keep describing changes in prose for the human to apply.
 */
export function writesEnabledFor(fidelity: ToolCallingFidelity | undefined): boolean {
  return fidelity !== undefined && writeModeFor(fidelity) === 'agentic'
}

/**
 * The write tool specs to advertise. `[]` unless the tier qualifies AND the
 * operator opted in — callers pass the result straight through, same shape as
 * `readOnlyToolSpecs`.
 */
export function writeToolSpecs(
  surface: Pick<AiSurfaceService, 'getTools'> | null,
  fidelity: ToolCallingFidelity | undefined,
  writesOptedIn: boolean
): AIToolSpec[] {
  if (!surface || !writesOptedIn || !writesEnabledFor(fidelity)) return []
  return surface
    .getTools()
    .filter((tool) => ALLOWED.has(tool.name))
    .map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: { ...tool.inputSchema }
    }))
}

/**
 * Replaces `AI_TOOLS_PROMPT` when writes are armed: same search guidance,
 * minus the "you cannot create, edit, or delete" close — a prompt that both
 * grants and denies writing teaches the model to ignore one half of it.
 */
export const AI_TOOLS_PROMPT_WRITABLE = [
  'You can call tools to look things up in the workspace yourself — search it,',
  'read a page, describe or query a database, expand the graph around a node.',
  'Prefer calling a tool over guessing, and prefer it over saying you lack',
  'access. Cite what you found by title or id.'
].join(' ')

/** Standing instructions appended when write tools are enabled. */
export const AI_WRITE_TOOLS_PROMPT = [
  'You can also propose and apply page edits: validate markdown, plan a patch,',
  'apply page markdown, or compose a new page. Plan before you apply. Every',
  'apply pauses for the operator to approve in this chat — medium-risk actions',
  'need the approval code, higher-risk ones need an explicit in-app approval —',
  'so state clearly what each change will do before calling the tool, and never',
  'promise a change happened until the tool result confirms it.'
].join(' ')
