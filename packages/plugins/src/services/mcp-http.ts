/**
 * HTTP transport for the xNet MCP server (exploration 0175).
 *
 * The {@link MCPServer} ships a stdio transport for process-spawned clients
 * (Claude Code, Codex, OpenClaw `mcp.servers` with `transport: "stdio"`). A
 * browser or an HTTP-only MCP client (OpenClaw `transport: "streamable-http"`)
 * cannot speak stdio, so this exposes the same `handleRequest` JSON-RPC surface
 * over HTTP.
 *
 * Because the same surface can mutate a user's workspace, the transport is a
 * trust boundary and is hardened accordingly (exploration 0175, "boundary
 * hardening"):
 *
 * - **Loopback only.** Binds `127.0.0.1`/`::1`; refuses to start on a
 *   non-loopback host so the substrate is never exposed to the network the way
 *   OpenClaw's own `0.0.0.0:18789` default famously is.
 * - **Pairing token.** Every JSON-RPC request must carry the shared
 *   `x-xnet-pairing` secret; compared in constant time.
 * - **Origin allowlist.** Browser requests (those carrying an `Origin`) must
 *   match the allowlist; never reflects `*`. Non-browser clients (no `Origin`)
 *   are allowed through to the token check.
 * - **Private Network Access.** Emits `Access-Control-Allow-Private-Network`
 *   and answers `OPTIONS` preflights so Chrome's Local Network Access flow can
 *   reach a loopback substrate from an https origin.
 *
 * The guardrail itself (mutation plans, approval, audit) lives in the
 * `AiSurfaceService` behind `MCPServer`, so it is preserved across transports —
 * this layer only governs *who* may talk to the server.
 */

import type { MCPRequest, MCPResponse, MCPServer } from './mcp-server'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost'])
const PAIRING_HEADER = 'x-xnet-pairing'
const DEFAULT_PATH = '/mcp'
/** Reject oversized bodies before buffering them (1 MiB is ample for JSON-RPC). */
const MAX_BODY_BYTES = 1024 * 1024

export interface McpHttpServerConfig {
  /** The MCP server whose `handleRequest` is exposed over HTTP. */
  server: MCPServer
  /**
   * Shared secret required in the `x-xnet-pairing` header. A cryptographically
   * random token is generated when omitted; read it back from
   * {@link McpHttpServerHandle.pairingToken} to hand to the client.
   */
  pairingToken?: string
  /**
   * Browser origins permitted to call the server. Requests that send an
   * `Origin` header not in this list are rejected with 403. Requests without an
   * `Origin` (CLI/native MCP clients) bypass this check and are gated by the
   * pairing token alone. Defaults to none (browser-less).
   */
  allowedOrigins?: readonly string[]
  /** Loopback host to bind. Defaults to `127.0.0.1`. Non-loopback hosts throw. */
  host?: string
  /** Port to bind. Defaults to `31416`; pass `0` for an ephemeral port. */
  port?: number
  /** JSON-RPC endpoint path. Defaults to `/mcp`. */
  path?: string
}

export interface McpHttpServerHandle {
  /** Resolved base URL, e.g. `http://127.0.0.1:31416`. Valid after `start()`. */
  readonly url: string
  /** Bound port. Valid after `start()` (reflects the OS-assigned port if 0). */
  readonly port: number
  /** The pairing token clients must present. */
  readonly pairingToken: string
  /** JSON-RPC endpoint path. */
  readonly path: string
  start(): Promise<void>
  stop(): Promise<void>
  /** The raw Node request handler — exposed for tests and embedding. */
  readonly handler: (req: IncomingMessage, res: ServerResponse) => void
}

/**
 * Create (but do not start) an HTTP transport for an {@link MCPServer}.
 *
 * @throws if `host` is not a loopback address.
 */
export function createMcpHttpServer(config: McpHttpServerConfig): McpHttpServerHandle {
  const host = config.host ?? '127.0.0.1'
  if (!LOOPBACK_HOSTS.has(host)) {
    throw new Error(
      `MCP HTTP transport refuses to bind non-loopback host "${host}"; ` +
        `the substrate must stay on the local machine.`
    )
  }

  const pairingToken = config.pairingToken ?? randomBytes(24).toString('base64url')
  const allowedOrigins = new Set(config.allowedOrigins ?? [])
  const path = config.path ?? DEFAULT_PATH
  const requestedPort = config.port ?? 31416
  const { server } = config

  let httpServer: Server | null = null
  let boundPort = requestedPort

  const handler = (req: IncomingMessage, res: ServerResponse): void => {
    void handleHttp(req, res, {
      server,
      pairingToken,
      allowedOrigins,
      path,
      boundPort: () => boundPort
    })
  }

  return {
    get url() {
      return `http://${host}:${boundPort}`
    },
    get port() {
      return boundPort
    },
    pairingToken,
    path,
    handler,
    start() {
      return new Promise<void>((resolve, reject) => {
        if (httpServer) return resolve()
        const created = createServer(handler)
        created.once('error', reject)
        created.listen(requestedPort, host, () => {
          const address = created.address()
          if (address && typeof address === 'object') boundPort = address.port
          httpServer = created
          created.off('error', reject)
          resolve()
        })
      })
    },
    stop() {
      return new Promise<void>((resolve, reject) => {
        if (!httpServer) return resolve()
        httpServer.close((err) => {
          httpServer = null
          if (err) reject(err)
          else resolve()
        })
      })
    }
  }
}

interface HandlerContext {
  server: MCPServer
  pairingToken: string
  allowedOrigins: Set<string>
  path: string
  /** Bound port (read lazily — it's only known after `listen`). */
  boundPort: () => number
}

async function handleHttp(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: HandlerContext
): Promise<void> {
  // Anti-DNS-rebinding: reject any request whose Host isn't our exact loopback
  // authority before anything else. A rebinding page reaches 127.0.0.1 at the
  // socket but still carries its own hostname in Host (the fix Ollama shipped
  // for CVE-2024-28224). Applies even to /health and OPTIONS.
  if (!isHostAllowed(req.headers.host, ctx.boundPort())) {
    res.writeHead(403).end()
    return
  }
  const origin = req.headers.origin
  const originDecision = decideOrigin(origin, ctx.allowedOrigins)

  applyCorsHeaders(res, originDecision.allowedOrigin)

  // Preflight: answer CORS without requiring the pairing token (browsers do
  // not send custom headers on preflight). Still enforce the origin allowlist.
  if (req.method === 'OPTIONS') {
    if (!originDecision.ok) return sendJson(res, 403, { error: 'origin not allowed' })
    res.writeHead(204).end()
    return
  }

  // Unauthenticated liveness probe so connector detection can find the bridge
  // (exploration 0174 `detectConnectors`). Leaks only name/version, loopback-only.
  if (req.method === 'GET' && isHealthPath(req.url)) {
    if (!originDecision.ok) return sendJson(res, 403, { error: 'origin not allowed' })
    return sendJson(res, 200, { ok: true, server: ctx.server.getServerInfo() })
  }

  if (!originDecision.ok) return sendJson(res, 403, { error: 'origin not allowed' })

  if (req.method !== 'POST' || !isPath(req.url, ctx.path)) {
    return sendJson(res, 404, { error: 'not found' })
  }

  if (!checkPairingToken(req.headers[PAIRING_HEADER], ctx.pairingToken)) {
    return sendJson(res, 401, { error: 'invalid or missing pairing token' })
  }

  let body: string
  try {
    body = await readBody(req)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'request too large'
    return sendJson(res, 413, { error: message })
  }

  let payload: unknown
  try {
    payload = JSON.parse(body) as unknown
  } catch {
    return sendJson(res, 200, parseError())
  }

  // Support a single request or a JSON-RPC batch array.
  if (Array.isArray(payload)) {
    const responses = await Promise.all(
      payload.map((entry) => ctx.server.handleRequest(entry as MCPRequest))
    )
    return sendJson(res, 200, responses)
  }
  const response = await ctx.server.handleRequest(payload as MCPRequest)
  return sendJson(res, 200, response)
}

interface OriginDecision {
  ok: boolean
  /** Origin to echo in `Access-Control-Allow-Origin`, or null to omit. */
  allowedOrigin: string | null
}

/**
 * Accept only requests whose `Host` header is our exact loopback authority
 * (`127.0.0.1:<port>` / `localhost:<port>` / `[::1]:<port>`) — the anti-DNS-
 * rebinding gate shared with the agent bridge daemon.
 */
function isHostAllowed(hostHeader: string | string[] | undefined, boundPort: number): boolean {
  const host = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader
  if (!host) return false
  const portMatch = host.match(/:(\d+)$/)
  const hostname = host.replace(/:\d+$/, '').replace(/^\[|\]$/g, '')
  if (!LOOPBACK_HOSTS.has(hostname)) return false
  return portMatch === null || portMatch[1] === String(boundPort)
}

function decideOrigin(origin: string | undefined, allowed: Set<string>): OriginDecision {
  // No Origin header => non-browser client (CLI/native). Allowed; token gates it.
  if (origin === undefined) return { ok: true, allowedOrigin: null }
  if (allowed.has(origin)) return { ok: true, allowedOrigin: origin }
  return { ok: false, allowedOrigin: null }
}

function applyCorsHeaders(res: ServerResponse, allowedOrigin: string | null): void {
  if (allowedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin)
    res.setHeader('Vary', 'Origin')
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', `content-type, ${PAIRING_HEADER}`)
  // Chrome Private Network / Local Network Access: lets an https origin reach
  // this loopback server once the user grants the permission prompt.
  res.setHeader('Access-Control-Allow-Private-Network', 'true')
}

function checkPairingToken(header: string | string[] | undefined, expected: string): boolean {
  const provided = Array.isArray(header) ? header[0] : header
  if (typeof provided !== 'string') return false
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(new Error('request body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

function parseError(): MCPResponse {
  return {
    jsonrpc: '2.0',
    id: null as unknown as number,
    error: { code: -32700, message: 'Parse error' }
  }
}

function isHealthPath(url: string | undefined): boolean {
  const pathname = pathnameOf(url)
  return pathname === '/health' || pathname === '/healthz'
}

function isPath(url: string | undefined, expected: string): boolean {
  return pathnameOf(url) === expected
}

function pathnameOf(url: string | undefined): string {
  if (!url) return '/'
  const queryIndex = url.indexOf('?')
  return queryIndex === -1 ? url : url.slice(0, queryIndex)
}
