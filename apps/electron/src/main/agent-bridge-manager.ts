/**
 * Agent bridge daemon for the Electron app (exploration 0194).
 *
 * Runs the loopback HTTP daemon xNet's chat panel probes at :31416 (the
 * `bridge` connector tier), driving the user's OWN coding-agent CLI
 * (`claude` / `codex` / …) as the model. The agent authenticates with the
 * user's subscription — the app never sees the token.
 *
 * It only advertises the bridge when the agent CLI is actually runnable
 * (a `--version` probe), so the panel never shows an "available" bridge that
 * errors on first message. The HTTP server itself is in-process; the agent CLI
 * is spawned per chat turn — Claude Code over the streaming, session-aware
 * path (`cliStreamingChatAgent`, exploration 0391), other agents one-shot via
 * `cliChatAgent`.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  buildAgentArgs,
  cliChatAgent,
  cliStreamingChatAgent,
  createBridgeServer,
  mcpConfigFor,
  NodeCommandRunner,
  NodeLineRunner,
  type BridgeServerHandle,
  type ChatAgent
} from '@xnetjs/devkit'
import { app, ipcMain } from 'electron'

export interface AgentBridgeStatus {
  running: boolean
  agent: string
  url?: string
  /**
   * The pairing token a browser must present as `Authorization: Bearer <token>`.
   * Delivered to the renderer over IPC only — never over HTTP — so the xNet app
   * can auto-pair; an external browser gets it via the `xnet bridge serve`
   * pairing code instead. Present only while `running`.
   */
  token?: string
  detail?: string
}

let handle: BridgeServerHandle | undefined
let status: AgentBridgeStatus = { running: false, agent: 'claude' }

function resolveAgent(explicit?: string): string {
  return explicit ?? process.env.XNET_BRIDGE_AGENT ?? 'claude'
}

/**
 * Browser origins allowed to reach the loopback bridge, on top of loopback
 * origins. The deployed PWA lives at `https://xnet.fyi/app`, so its origin is
 * `https://xnet.fyi` — that must be listed here or the daemon's origin gate
 * rejects it. Self-hosters extend the set via `XNET_BRIDGE_ALLOWED_ORIGINS`
 * (comma-separated).
 */
export function resolveAllowedOrigins(): string[] {
  const extra = (process.env.XNET_BRIDGE_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
  return ['https://xnet.fyi', ...extra]
}

/**
 * Opt-in: give the agent xNet's workspace tools by pointing its MCP config at a
 * resolvable `xnet mcp serve`. Requires `XNET_BRIDGE_MCP=1` and a CLI entry
 * (`XNET_BRIDGE_MCP_CLI`, run via this process's node), because in a packaged
 * app `xnet` isn't on PATH. Returns the written config path, or undefined.
 */
function resolveMcpConfigPath(): string | undefined {
  if (!process.env.XNET_BRIDGE_MCP) return undefined
  const cli = process.env.XNET_BRIDGE_MCP_CLI
  if (!cli) return undefined
  const apiUrl = process.env.XNET_BRIDGE_MCP_API_URL ?? 'http://127.0.0.1:31415'
  const spec = { command: process.execPath, args: [cli, 'mcp', 'serve', '--api-url', apiUrl] }
  const configPath = join(app.getPath('userData'), 'agent-bridge-mcp.json')
  writeFileSync(configPath, JSON.stringify(mcpConfigFor(spec)))
  return configPath
}

export function getAgentBridgeStatus(): AgentBridgeStatus {
  return status
}

/** Start the bridge if the chosen agent CLI is installed; otherwise record why. */
export async function startAgentBridge(
  options: { agent?: string; cwd?: string } = {}
): Promise<AgentBridgeStatus> {
  if (handle) return status
  const agentCmd = resolveAgent(options.agent)
  // Chat turns run in a dedicated home (Claude Code stores sessions per cwd),
  // so bridge sessions never interleave with real coding sessions in repos.
  const cwd = options.cwd ?? join(app.getPath('home'), '.xnet', 'agent-home')
  mkdirSync(cwd, { recursive: true })
  const runner = new NodeCommandRunner()

  const probe = await runner.run(agentCmd, ['--version'], { cwd, timeoutMs: 4000 })
  if (!probe.ok) {
    status = { running: false, agent: agentCmd, detail: `${agentCmd} not found on PATH` }
    return status
  }

  const mcpConfigPath = resolveMcpConfigPath()
  let agent: ChatAgent
  if (agentCmd === 'claude') {
    // Streaming + session continuity (exploration 0391): live deltas over SSE,
    // --resume across turns.
    agent = cliStreamingChatAgent(new NodeLineRunner(), {
      command: agentCmd,
      cwd,
      ...(mcpConfigPath ? { launch: { mcpConfigPath } } : {})
    })
  } else {
    const args = buildAgentArgs(agentCmd, { ...(mcpConfigPath ? { mcpConfigPath } : {}) })
    agent = cliChatAgent(runner, { command: agentCmd, cwd, args })
  }
  const server = createBridgeServer({
    agent,
    agentName: agentCmd,
    version: app.getVersion(),
    allowedOrigins: resolveAllowedOrigins()
  })
  try {
    await server.start()
  } catch (err) {
    status = {
      running: false,
      agent: agentCmd,
      detail: err instanceof Error ? err.message : String(err)
    }
    return status
  }
  handle = server
  status = { running: true, agent: agentCmd, url: server.url, token: server.pairingToken }
  return status
}

export async function stopAgentBridge(): Promise<void> {
  await handle?.stop()
  handle = undefined
  status = { ...status, running: false }
}

export function setupAgentBridgeIPC(): void {
  ipcMain.handle('xnet:agent-bridge:status', () => getAgentBridgeStatus())
  ipcMain.handle('xnet:agent-bridge:start', async (_event, agent?: string) =>
    startAgentBridge({ agent })
  )
  ipcMain.handle('xnet:agent-bridge:stop', async () => {
    await stopAgentBridge()
    return getAgentBridgeStatus()
  })
}
