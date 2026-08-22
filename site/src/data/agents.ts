/**
 * Single source of truth for the agent-door connect commands (exploration
 * 0457). The hero tabs, /agents, and GetStarted all render from this file so
 * the command a visitor copies is the same everywhere — and there is exactly
 * one place to change when a client's install convention moves.
 *
 * Two affordances per GUI client, deliberately: the one-click deeplink is
 * progressive enhancement (Cursor deeplinks have documented failure modes),
 * and the copyable config is the fallback that always works.
 */

/** MCP server config shared by the Cursor/VS Code registrations. The npx
 *  launcher matches what `xnet connect` itself registers when the `xnet` bin
 *  is not on PATH — the registration works with zero prior install. */
const MCP_COMMAND = {
  command: 'npx',
  args: ['-y', '@xnetjs/cli', 'mcp', 'serve'],
  env: { XNET_READONLY: '1' }
} as const

/** `.cursor/mcp.json` / `.mcp.json`-shaped config for the copyable fallback. */
export const MCP_CONFIG_JSON = JSON.stringify({ mcpServers: { xnet: MCP_COMMAND } }, null, 2)

/** Cursor one-click install deeplink (config is base64 of the server entry). */
const cursorDeeplink = (() => {
  const config = Buffer.from(JSON.stringify(MCP_COMMAND)).toString('base64')
  return `cursor://anysphere.cursor-deeplink/mcp/install?name=xnet&config=${encodeURIComponent(config)}`
})()

/** VS Code one-click install URL (`vscode:mcp/install?<urlencoded JSON>`). */
const vscodeDeeplink = (() => {
  const payload = JSON.stringify({ name: 'xnet', ...MCP_COMMAND })
  return `vscode:mcp/install?${encodeURIComponent(payload)}`
})()

export interface AgentClient {
  id: 'claude-code' | 'codex' | 'cursor' | 'vscode' | 'any'
  /** Tab / button label. */
  label: string
  /** Shell lines for the copyable terminal block (plain text; pages highlight). */
  command: string[]
  /** One-line note rendered under the block. */
  note: string
  /** Optional one-click install link — always paired with the copyable form. */
  deeplink?: { href: string; label: string }
  /** Copyable JSON config fallback for GUI clients (no shell involved). */
  configJson?: string
}

export const AGENT_CLIENTS: AgentClient[] = [
  {
    id: 'claude-code',
    label: 'Claude Code',
    command: ['npx @xnetjs/cli connect claude-code'],
    note: 'Installs the ~500-token skill, registers the MCP fallback, self-checks. Read-only until --writes.'
  },
  {
    id: 'codex',
    label: 'Codex',
    command: ['npx @xnetjs/cli connect codex'],
    note: 'Writes the AGENTS.md contract and registers the server in .codex/config.toml. Read-only until --writes.'
  },
  {
    id: 'cursor',
    label: 'Cursor',
    command: [MCP_CONFIG_JSON],
    note: 'Paste into .cursor/mcp.json — or use the one-click install button.',
    deeplink: { href: cursorDeeplink, label: 'Add xnet to Cursor' },
    configJson: MCP_CONFIG_JSON
  },
  {
    id: 'vscode',
    label: 'VS Code',
    command: [MCP_CONFIG_JSON],
    note: 'Paste into your MCP config — or use the one-click install button.',
    deeplink: { href: vscodeDeeplink, label: 'Install in VS Code' },
    configJson: MCP_CONFIG_JSON
  },
  {
    id: 'any',
    label: 'Any agent',
    command: ['npx -y @xnetjs/cli mcp serve'],
    note: 'A standard MCP server over stdio — point any MCP-capable client at it. Set XNET_READONLY=1 for read-only.'
  }
]

/** The one canonical command quoted in prose (hero, README, docs). */
export const CANONICAL_CONNECT = 'npx @xnetjs/cli connect claude-code'
