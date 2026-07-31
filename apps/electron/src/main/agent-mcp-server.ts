/**
 * The xNet MCP server the bridged coding agent talks to.
 *
 * This is what turns the bridge from a chatbot into something that acts on the
 * workspace: `xnet_query` / `xnet_get` to read it, `xnet_create_page` /
 * `xnet_create_task` / `xnet_update` to write to it. The write guardrail
 * (confirmation for destructive and outward-facing writes, cost budget, audit)
 * lives inside `MCPServer`, so it holds regardless of which agent is driving.
 *
 * It runs **in the main process** over the renderer store proxy, rather than
 * spawning `xnet mcp serve` as a child: the CLI is not an Electron dependency
 * and would not resolve in a packaged app, and an in-process server also skips
 * the local API's HTTP hop and its per-session token. Claude Code reaches it
 * over the Streamable-HTTP MCP transport on an ephemeral loopback port.
 */

import type { ParkedApproval } from '@xnetjs/plugins'
import {
  createMCPServer,
  createMcpHttpServer,
  type McpHttpServerHandle,
  type MCPServer
} from '@xnetjs/plugins/node'
import { BrowserWindow, ipcMain } from 'electron'
import {
  createNodeStoreProxy,
  createSchemaRegistryProxy,
  setupStoreResponseHandler,
  type SchemaRegistryProxy
} from './renderer-store-proxy'

/** Renderer-facing channels for the parked-approval ceremony (0414). */
export const AGENT_APPROVAL_CHANNELS = {
  list: 'xnet:agent-approvals:list',
  approve: 'xnet:agent-approvals:approve',
  deny: 'xnet:agent-approvals:deny',
  changed: 'xnet:agent-approvals:changed'
} as const

const broadcastApprovals = (parked: ParkedApproval[]): void => {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send(AGENT_APPROVAL_CHANNELS.changed, parked)
  }
}

export interface AgentMcpServerHandle {
  /** Full JSON-RPC endpoint, e.g. `http://127.0.0.1:52341/mcp`. */
  readonly endpoint: string
  /** Secret the agent must send as `x-xnet-pairing`. */
  readonly pairingToken: string
  readonly server: MCPServer
  stop(): Promise<void>
}

let handle: AgentMcpServerHandle | undefined

/**
 * Start the MCP server, or return the running one.
 *
 * Binds an ephemeral port (`0`) rather than the transport's 31416 default,
 * which the agent bridge daemon already owns. No `allowedOrigins`: the only
 * intended client is a spawned CLI, which sends no `Origin` and is gated by the
 * pairing token alone.
 */
export async function startAgentMcpServer(): Promise<AgentMcpServerHandle> {
  if (handle) return handle

  setupStoreResponseHandler()
  const schemas: SchemaRegistryProxy = createSchemaRegistryProxy()
  // Not awaited: the bridge starts before `createWindow()`, and priming needs
  // the renderer. Binding the port is what the bridge's MCP config depends on;
  // the cache only has to be warm by the time a chat turn calls a tool.
  void schemas.ensurePrimed().catch(() => undefined)

  const server = createMCPServer({
    store: createNodeStoreProxy(),
    schemas,
    // The 0337 ceremony (0394 Phase 2): every AI-surface tool call lands as an
    // AgentAction node, and medium+ risk writes park behind the risk-tiered
    // approval — medium releases on the APPROVE code the agent relays into
    // chat (`xnet_approve`), high/critical only from an xNet surface. Without
    // this, a bridged agent could run `xnet_apply_page_markdown` with no gate
    // but the system prompt.
    agentAudit: {
      agentDID: 'bridge:agent',
      sessionKey: `bridge-${Date.now().toString(36)}`,
      channel: 'cli'
    }
  })
  // High/critical actions carry no chat code by design — only an xNet surface
  // can release them, and this is the wire that lets one (0414). Without it a
  // bridged agent's page write parks in this process where nothing can reach
  // it and expires five minutes later looking like nothing ever happened.
  const unsubscribe = server.onParkedApprovalsChanged(broadcastApprovals)

  const http = createMcpHttpServer({ server, port: 0 })
  await http.start()

  handle = {
    endpoint: `${http.url}${http.path}`,
    pairingToken: http.pairingToken,
    server,
    stop: async () => {
      unsubscribe()
      broadcastApprovals([])
      await stopHttp(http)
    }
  }
  return handle
}

/**
 * Wire the parked-approval channels. Registered once at startup, not with the
 * server: the bridge starts on demand, and a renderer asking before then must
 * get an empty list rather than an "unhandled channel" throw.
 */
export function setupAgentApprovalIPC(): void {
  ipcMain.handle(AGENT_APPROVAL_CHANNELS.list, () => handle?.server.listParkedApprovals() ?? [])
  ipcMain.handle(
    AGENT_APPROVAL_CHANNELS.approve,
    async (_event, actionId: string, approverDID: string) =>
      (await handle?.server.approveParkedApproval(actionId, approverDID)) ?? false
  )
  ipcMain.handle(
    AGENT_APPROVAL_CHANNELS.deny,
    async (_event, actionId: string, approverDID?: string) =>
      (await handle?.server.denyParkedApproval(actionId, approverDID)) ?? false
  )
}

async function stopHttp(http: McpHttpServerHandle): Promise<void> {
  await http.stop()
  handle = undefined
}

export function getAgentMcpServer(): AgentMcpServerHandle | undefined {
  return handle
}

export async function stopAgentMcpServer(): Promise<void> {
  await handle?.stop()
  handle = undefined
}
