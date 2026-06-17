/**
 * Agent bridge daemon for the Electron app (exploration 0194).
 *
 * Runs the loopback HTTP daemon XNet's chat panel probes at :31416 (the
 * `bridge` connector tier), driving the user's OWN coding-agent CLI
 * (`claude` / `codex` / …) as the model. The agent authenticates with the
 * user's subscription — the app never sees the token.
 *
 * It only advertises the bridge when the agent CLI is actually runnable
 * (a `--version` probe), so the panel never shows an "available" bridge that
 * errors on first message. The HTTP server itself is in-process; the agent CLI
 * is spawned per chat turn by `cliChatAgent`.
 */

import {
  cliChatAgent,
  createBridgeServer,
  NodeCommandRunner,
  type BridgeServerHandle
} from '@xnetjs/devkit'
import { app, ipcMain } from 'electron'

export interface AgentBridgeStatus {
  running: boolean
  agent: string
  url?: string
  detail?: string
}

let handle: BridgeServerHandle | undefined
let status: AgentBridgeStatus = { running: false, agent: 'claude' }

function resolveAgent(explicit?: string): string {
  return explicit ?? process.env.XNET_BRIDGE_AGENT ?? 'claude'
}

function argsForAgent(command: string): string[] | undefined {
  if (command === 'codex') return ['exec', '{prompt}']
  return undefined // claude / default → cliChatAgent default ['-p', '{prompt}']
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
  const cwd = options.cwd ?? app.getPath('home')
  const runner = new NodeCommandRunner()

  const probe = await runner.run(agentCmd, ['--version'], { cwd, timeoutMs: 4000 })
  if (!probe.ok) {
    status = { running: false, agent: agentCmd, detail: `${agentCmd} not found on PATH` }
    return status
  }

  const args = argsForAgent(agentCmd)
  const agent = cliChatAgent(runner, { command: agentCmd, cwd, ...(args ? { args } : {}) })
  const server = createBridgeServer({ agent, agentName: agentCmd, version: app.getVersion() })
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
  status = { running: true, agent: agentCmd, url: server.url }
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
