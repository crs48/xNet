/**
 * @xnetjs/devkit — headless launch specs for coding agents (exploration 0194).
 *
 * Maps a known agent CLI + an optional xNet MCP server to the argv that drives
 * it non-interactively. Handing the agent xNet's MCP server is what turns the
 * bridge from a chatbot into something that *acts on the workspace*: it can
 * search/read and create/update pages, databases, and canvases through the
 * `xnet_*` tools (which enforce the write guardrail server-side). Pure, so the
 * wiring is unit-tested without spawning anything.
 */

export interface McpServerSpec {
  command: string
  args: string[]
}

/** The `mcpServers` config object a spawned agent loads to reach xNet's tools. */
export function mcpConfigFor(
  server: McpServerSpec,
  name = 'xnet'
): { mcpServers: Record<string, McpServerSpec> } {
  return { mcpServers: { [name]: { command: server.command, args: [...server.args] } } }
}

export interface AgentLaunchOptions {
  /** Path to an MCP config JSON file — gives the agent xNet's workspace tools. */
  mcpConfigPath?: string
  /**
   * allowedTools pattern auto-approved for the MCP server (Claude Code print
   * mode — `--permission-mode acceptEdits` does NOT cover MCP tools). Default
   * `mcp__xnet__*` (all xNet tools).
   */
  allowedTools?: string
}

/** Default allow pattern: every tool exposed by the `xnet` MCP server. */
export const DEFAULT_XNET_ALLOWED_TOOLS = 'mcp__xnet__*'

/**
 * Build the argv that drives Claude Code headlessly with **live streaming and
 * session continuity** (exploration 0391): `stream-json` NDJSON events with
 * partial deltas (`--verbose` is required by the CLI in this mode), plus
 * `--resume <id>` when continuing a stored session. Claude-only — Codex has no
 * equivalent; it stays on the one-shot {@link buildAgentArgs} path.
 */
export function buildStreamingAgentArgs(
  prompt: string,
  options: AgentLaunchOptions & { resumeSessionId?: string } = {}
): string[] {
  const args = [
    '-p',
    prompt,
    '--output-format',
    'stream-json',
    '--include-partial-messages',
    '--verbose'
  ]
  if (options.resumeSessionId) args.push('--resume', options.resumeSessionId)
  if (options.mcpConfigPath) {
    args.push('--mcp-config', options.mcpConfigPath)
    args.push('--allowedTools', options.allowedTools ?? DEFAULT_XNET_ALLOWED_TOOLS)
  }
  return args
}

/**
 * Build the arg template (containing a literal `{prompt}` token for
 * {@link cliChatAgent} to substitute) that drives a known agent CLI headlessly.
 */
export function buildAgentArgs(agent: string, options: AgentLaunchOptions = {}): string[] {
  if (agent === 'codex') {
    // Codex loads MCP servers from ~/.codex/config.toml (or `codex mcp`); there
    // is no per-invocation flag, so MCP wiring is left to that global config.
    return ['exec', '{prompt}']
  }
  // Claude Code headless (default).
  const args = ['-p', '{prompt}', '--output-format', 'text']
  if (options.mcpConfigPath) {
    args.push('--mcp-config', options.mcpConfigPath)
    args.push('--allowedTools', options.allowedTools ?? DEFAULT_XNET_ALLOWED_TOOLS)
  }
  return args
}
