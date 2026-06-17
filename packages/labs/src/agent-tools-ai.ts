/**
 * @xnetjs/labs — Lab agent tools as AI tools (exploration 0194 Phase 2).
 *
 * `createLabAgentTools` already produces MCP-shaped tools (`lab_run`/`lab_list`/
 * …) but they aren't in the workspace AI's tool surface. This adapts them to the
 * `AiCallableTool` shape `@xnetjs/plugins` uses, so the agent can discover, run,
 * and author Labs alongside the workspace tools — the AI→Lab→Plugin loop's first
 * hop. It lives in labs because labs already depends on `@xnetjs/plugins` (the
 * reverse would cycle).
 *
 * `LabToolPropertySchema` is structurally a subset of `AiJsonSchema`, so the
 * input schema passes straight through. Execution tools (`lab_run`/`lab_create`/
 * `lab_run_saved`) are marked `high` risk so the agent/consent layer can gate
 * them; read tools (`lab_get`/`lab_list`) are `low`.
 */

import type { LabAgentTool } from './agent-tools'
import type { AiCallableTool } from '@xnetjs/plugins'

/** Lab tools that execute code (vs. read metadata) — surfaced as higher risk. */
const EXECUTION_TOOLS = new Set(['lab_run', 'lab_create', 'lab_run_saved'])

/** `lab_run` → `Lab run`. */
function titleize(name: string): string {
  return name.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
}

/** Stringify a tool result for the text content block. */
function resultText(value: unknown): string {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function toAiTool(tool: LabAgentTool): AiCallableTool {
  return {
    name: tool.name,
    title: titleize(tool.name),
    description: tool.description,
    risk: EXECUTION_TOOLS.has(tool.name) ? 'high' : 'low',
    requiredScopes: ['workspace.read'],
    inputSchema: tool.inputSchema,
    invoke: async (args) => ({
      content: [{ type: 'text', text: resultText(await tool.invoke(args)) }]
    })
  }
}

/**
 * Adapt Lab agent tools to the `AiCallableTool` shape so the workspace AI can
 * call them. Pair with `createLabAgentTools(...)` and register the result with
 * the MCP server / in-app agent runtime.
 */
export function labAgentToolsToAiTools(tools: readonly LabAgentTool[]): AiCallableTool[] {
  return tools.map(toAiTool)
}
