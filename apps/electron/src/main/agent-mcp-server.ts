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

import {
  createMCPServer,
  createMcpHttpServer,
  type McpHttpServerHandle,
  type MCPServer
} from '@xnetjs/plugins/node'
import {
  createNodeStoreProxy,
  createSchemaRegistryProxy,
  setupStoreResponseHandler,
  type SchemaRegistryProxy
} from './renderer-store-proxy'

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

  const server = createMCPServer({ store: createNodeStoreProxy(), schemas })
  const http = createMcpHttpServer({ server, port: 0 })
  await http.start()

  handle = {
    endpoint: `${http.url}${http.path}`,
    pairingToken: http.pairingToken,
    server,
    stop: () => stopHttp(http)
  }
  return handle
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
