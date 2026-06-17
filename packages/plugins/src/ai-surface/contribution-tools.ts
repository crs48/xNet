/**
 * @xnetjs/plugins — plugin contributions as AI tools (exploration 0194 Phase 2).
 *
 * The AI agent can read/write the workspace (the `AiSurfaceService` tools), but
 * until now it could not invoke a *plugin command*. This exposes opted-in
 * commands as `AiToolDefinition`s with an `invoke`, so the agent's tool surface
 * grows with installed plugins — composable, the way MCP made the 2026 ecosystem.
 *
 * Opt-in is explicit (`aiExposed: true`) and capability-scoped (`aiScopes`): a
 * command the AI shouldn't touch simply never opts in, and a high-risk one is
 * surfaced as such so the agent/consent layer can gate it.
 */

import type { CommandContribution } from '../contributions'
import type { AiToolCallResult, AiToolDefinition } from './types'

/** An `AiToolDefinition` that can actually be called. */
export type AiCallableTool = AiToolDefinition & {
  invoke: (args: Record<string, unknown>) => Promise<AiToolCallResult>
}

const EMPTY_SCHEMA = { type: 'object', properties: {} } as const

function textResult(text: string): AiToolCallResult {
  return { content: [{ type: 'text', text }] }
}

/** Build the callable tool for a single exposed command. */
function commandToTool(command: CommandContribution): AiCallableTool {
  return {
    name: `plugin.${command.id}`,
    title: command.name,
    description: command.description ?? command.name,
    risk: command.aiRisk ?? 'medium',
    requiredScopes: command.aiScopes ?? [],
    inputSchema: command.aiInputSchema ?? EMPTY_SCHEMA,
    invoke: async (args) => {
      // Prefer an arg-taking AI invocation; otherwise trigger the plain command.
      const result = command.aiInvoke ? await command.aiInvoke(args) : await command.execute()
      return textResult(result === undefined ? `Ran ${command.name}` : String(result))
    }
  }
}

/**
 * Wrap the opted-in plugin commands as capability-scoped, callable AI tools.
 * Only commands with `aiExposed: true` are included — exposure is never implicit.
 */
export function contributionsAsAiTools(commands: readonly CommandContribution[]): AiCallableTool[] {
  return commands.filter((c) => c.aiExposed).map(commandToTool)
}
