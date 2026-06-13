/**
 * `xnet mcp serve` — expose the workspace to MCP clients (exploration 0175).
 *
 * xNet's `MCPServer` (with its mutation-plan guardrail) becomes a *substrate*
 * that any MCP client can drive: Claude Code / Codex (`transport: "stdio"`),
 * OpenClaw (`mcp.servers` with stdio or `streamable-http`), Cline, Goose, etc.
 * Build the server once; integrate everywhere.
 *
 * Two transports:
 * - **stdio** (default) — spawned by the client; process isolation is the
 *   security boundary. Use for Claude Code / Codex / OpenClaw stdio.
 * - **--http** — a hardened loopback HTTP transport (pairing token + Origin
 *   allowlist) for browser / HTTP-only clients (OpenClaw `streamable-http`).
 *
 * Both share the same backend the agent commands use: the local API
 * (`createRemoteAgentBackend`, default http://127.0.0.1:31415), so every write
 * flows through the same store and AI surface.
 */

import {
  createMCPServer,
  createMcpHttpServer,
  type MCPServer,
  type McpHttpServerHandle
} from '@xnetjs/plugins/node'
import { Command } from 'commander'
import { createRemoteAgentBackend, type AgentBackend } from '../utils/agent-remote.js'

export type McpBackendFactory = (options: {
  apiUrl?: string
  token?: string
}) => Promise<AgentBackend>

const defaultBackendFactory: McpBackendFactory = (options) => createRemoteAgentBackend(options)

/** Build an MCP server over a resolved backend. Writes route through its AI surface. */
export function buildMcpServer(backend: AgentBackend): MCPServer {
  return createMCPServer({ store: backend.store, schemas: backend.schemas })
}

export type McpServeOptions = {
  http?: boolean
  host?: string
  port?: number
  allowOrigin?: string[]
  pairingToken?: string
  apiUrl?: string
}

export type McpServeHandle = {
  mode: 'stdio' | 'http'
  server: MCPServer
  http?: McpHttpServerHandle
  stop(): Promise<void>
}

/**
 * Resolve the backend and build the server. In `--http` mode the HTTP transport
 * is started and returned; in stdio mode the caller drives `server.startStdio()`
 * (which blocks until stdin closes), so it is not started here.
 */
export async function startMcpServe(
  backendFactory: McpBackendFactory,
  options: McpServeOptions
): Promise<McpServeHandle> {
  const backend = await backendFactory({
    ...(options.apiUrl ? { apiUrl: options.apiUrl } : {})
  })
  const server = buildMcpServer(backend)

  if (options.http) {
    const http = createMcpHttpServer({
      server,
      ...(options.pairingToken ? { pairingToken: options.pairingToken } : {}),
      ...(options.allowOrigin && options.allowOrigin.length > 0
        ? { allowedOrigins: options.allowOrigin }
        : {}),
      ...(options.host ? { host: options.host } : {}),
      ...(options.port !== undefined ? { port: options.port } : {})
    })
    await http.start()
    return { mode: 'http', server, http, stop: () => http.stop() }
  }

  return {
    mode: 'stdio',
    server,
    stop: async () => {
      server.stop()
    }
  }
}

/** A ready-to-paste OpenClaw `mcp.servers` entry for the running HTTP transport. */
export function openClawHttpConfigSnippet(handle: McpHttpServerHandle): string {
  return JSON.stringify(
    {
      mcp: {
        servers: {
          xnet: {
            url: `${handle.url}${handle.path}`,
            transport: 'streamable-http',
            headers: { 'x-xnet-pairing': handle.pairingToken }
          }
        }
      }
    },
    null,
    2
  )
}

export function registerMcpCommand(
  program: Command,
  backendFactory: McpBackendFactory = defaultBackendFactory
): void {
  const mcp = program.command('mcp').description('Expose the workspace to MCP clients')

  mcp
    .command('serve')
    .description('Start an MCP server (stdio by default; --http for browser/OpenClaw clients)')
    .option('--http', 'Serve over hardened loopback HTTP instead of stdio')
    .option('--host <host>', 'Loopback host for --http (default 127.0.0.1)')
    .option('--port <n>', 'Port for --http (default 31416)', parseIntOption)
    .option(
      '--allow-origin <origin...>',
      'Browser origins permitted for --http (e.g. https://user.github.io)'
    )
    .option('--pairing-token <token>', 'Shared secret for --http (generated if omitted)')
    .option('--api-url <url>', 'xNet local API URL (default http://127.0.0.1:31415)')
    .action(async (options: McpServeOptions) => {
      const handle = await startMcpServe(backendFactory, options)
      if (handle.mode === 'http' && handle.http) {
        // stderr so stdout stays clean for any tooling that scrapes it.
        console.error(`xNet MCP server listening on ${handle.http.url}${handle.http.path}`)
        console.error(`pairing token: ${handle.http.pairingToken}`)
        console.error('OpenClaw config:\n' + openClawHttpConfigSnippet(handle.http))
        const shutdown = (): void => {
          void handle.stop().then(() => process.exit(0))
        }
        process.on('SIGINT', shutdown)
        process.on('SIGTERM', shutdown)
        return
      }
      // stdio: blocks until the client closes stdin.
      await handle.server.startStdio()
    })
}

function parseIntOption(value: string): number {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed)) throw new Error(`Invalid number: ${value}`)
  return parsed
}
