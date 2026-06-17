/**
 * @xnetjs/plugins — agent tools contribution point (exploration 0196).
 *
 * 0194 Phase 2 (`contributionsAsAiTools`) let the AI call a plugin *command*.
 * This adds first-class, model-facing tools that are NOT tied to a UI command —
 * the shape a Connector uses to expose, say, `slack_search_mentions` that reads
 * the governed node store. Register once via `contributes.agentTools`; the host
 * folds them into the AI surface's `extraTools`, so they appear in the in-app
 * AI, the MCP server, and the files-first skill alike.
 *
 * A tool's `invoke` returns raw data; the surface serializes it for the model,
 * keeping contributed tools symmetric with the built-in `xnet_*` tools.
 */

import type { AiExtraTool, AiRiskLevel, AiScope, AiToolDefinition } from './ai-surface/types'

/** Input schema shape, shared with `AiToolDefinition`. */
export type AgentToolInputSchema = AiToolDefinition['inputSchema']

/**
 * A plugin-contributed agent tool. Registered under `id`; exposed to the model
 * under `name` (snake_case, plugin-namespaced by convention, e.g.
 * `slack_search_mentions`).
 */
export interface AgentToolContribution {
  /** Registry key, plugin-scoped (e.g. `dev.xnet.connector.slack.search`). */
  id: string
  /** Model-facing tool name (snake_case), e.g. `slack_search_mentions`. */
  name: string
  /** Human title for menus (defaults to `name`). */
  title?: string
  /** What the tool does — shown to the model. */
  description: string
  /** Risk surfaced to the agent + consent layer (default `medium`). */
  risk?: AiRiskLevel
  /** AI scopes this tool requires (default none). */
  requiredScopes?: AiScope[]
  /** JSON schema for the tool args (default: empty object schema). */
  inputSchema?: AgentToolInputSchema
  /** Execute the tool. Returns raw data; the surface serializes it for the model. */
  invoke: (args: Record<string, unknown>) => unknown | Promise<unknown>
}

const EMPTY_SCHEMA = { type: 'object', properties: {} } as const

/** Convert one contribution into an AI-surface tool. */
export function agentToolToExtraTool(tool: AgentToolContribution): AiExtraTool {
  return {
    name: tool.name,
    title: tool.title ?? tool.name,
    description: tool.description,
    risk: tool.risk ?? 'medium',
    requiredScopes: tool.requiredScopes ?? [],
    inputSchema: tool.inputSchema ?? EMPTY_SCHEMA,
    invoke: tool.invoke
  }
}

/**
 * Convert contributed agent tools into AI-surface tools, de-duped by tool name
 * (first wins — registration order). Pass the result as the AI surface's
 * `extraTools` so they surface in the in-app AI and the MCP server.
 */
export function agentToolsAsExtraTools(tools: readonly AgentToolContribution[]): AiExtraTool[] {
  const seen = new Set<string>()
  const out: AiExtraTool[] = []
  for (const tool of tools) {
    if (seen.has(tool.name)) continue
    seen.add(tool.name)
    out.push(agentToolToExtraTool(tool))
  }
  return out
}
