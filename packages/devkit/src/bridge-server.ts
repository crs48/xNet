/**
 * @xnetjs/devkit — the agent bridge HTTP daemon (exploration 0194).
 *
 * Serves the loopback endpoint the xNet chat panel's `bridge` connector tier
 * already probes at `http://127.0.0.1:31416`:
 *
 * - `GET  /health`              → {@link bridgeHealth} so the panel detects the
 *   bridge tier (it requires `{ ok: true }`).
 * - `POST /v1/chat/completions` → an **OpenAI-compatible** chat endpoint backed
 *   by a {@link ChatAgent} (the user's own `claude` / `codex` CLI). Supports
 *   streaming (SSE, which is what the panel's provider requests) and one-shot.
 *
 * Hardened like the MCP HTTP transport (`@xnetjs/plugins` `mcp-http.ts`): binds
 * loopback only, validates the `Host` header (anti-DNS-rebinding), answers
 * `OPTIONS` preflights, gates by `Origin` (loopback + an allowlist — never
 * reflects `*` to an arbitrary site), requires a per-launch **pairing token** on
 * the data endpoints (constant-time compared), and emits
 * `Access-Control-Allow-Private-Network` so an HTTPS page can reach the loopback
 * daemon (Chrome's Local Network Access flow).
 *
 * The token is the layer that survives regardless of browser: loopback-bind +
 * origin allowlist alone is exactly the assumption DNS rebinding / a drive-by
 * site defeats (the Ollama CVE-2024-28224 class). It is delivered out-of-band —
 * the Electron main process injects it into its renderer over preload, and
 * `xnet bridge serve` prints it as a pairing code the user pastes into the web
 * app. `GET /health` stays unauthenticated so the connector ladder can detect
 * the bridge before pairing.
 */

import { isStreamingChatAgent, type ChatAgent, type ChatMessage } from './chat-agent'
import type { AgentTaskResult } from './dev-loop'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { bridgeHealth, type BridgeRunRequest } from './bridge'
import { createBridgeSessionStore } from './bridge-sessions'

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost'])
/** Default port — the address the connector ladder (0174) probes. */
export const DEFAULT_BRIDGE_PORT = 31416
const MAX_BODY_BYTES = 1024 * 1024

export interface BridgeServerConfig {
  /** The agent that produces replies (e.g. `cliChatAgent` over `claude`). */
  agent: ChatAgent
  /** Which agent CLI this wraps, surfaced in `/health` (e.g. `'claude'`). */
  agentName?: string
  version?: string
  /** Loopback host. Defaults `127.0.0.1`; non-loopback is refused. */
  host?: string
  /** Port to bind. Defaults {@link DEFAULT_BRIDGE_PORT}; pass `0` for ephemeral. */
  port?: number
  /**
   * Browser origins allowed *in addition to* loopback origins. A request whose
   * `Origin` is absent (non-browser) or loopback is always allowed; a deployed
   * web origin must be listed here to reach the local agent.
   */
  allowedOrigins?: string[]
  /**
   * Shared secret required in `Authorization: Bearer <token>` on the data
   * endpoints (`/v1/chat/completions`, `/run`). A cryptographically random token
   * is generated when omitted; read it back from
   * {@link BridgeServerHandle.pairingToken} to hand to the client out-of-band.
   * `/health` is never gated, so detection works before pairing.
   */
  pairingToken?: string
  /**
   * Optional code-task handler for `POST /run` (e.g. devkit `handleBridgeRun`):
   * isolate in a worktree → agent edits → gate → checkpoint/rollback. Opt-in —
   * when absent, `/run` answers 501. This is powerful (runs a coding agent + the
   * gate), so callers enable it explicitly.
   */
  run?: (request: BridgeRunRequest) => Promise<AgentTaskResult>
}

export interface BridgeServerHandle {
  start(): Promise<void>
  stop(): Promise<void>
  /** Resolved base URL, valid after `start()`. */
  readonly url: string
  /** The pairing token clients must present on the data endpoints. */
  readonly pairingToken: string
}

export function createBridgeServer(config: BridgeServerConfig): BridgeServerHandle {
  const host = config.host ?? '127.0.0.1'
  if (!LOOPBACK_HOSTS.has(host)) {
    throw new Error(
      `Agent bridge refuses to bind non-loopback host "${host}"; it must stay on the local machine.`
    )
  }
  const requestedPort = config.port ?? DEFAULT_BRIDGE_PORT
  const allowed = new Set(config.allowedOrigins ?? [])
  const pairingToken = config.pairingToken ?? randomBytes(24).toString('base64url')
  const agentName = config.agentName ?? 'agent'
  const version = config.version ?? '0.1.0'
  // Conversation → CLI-session map (per daemon launch; a restart just means
  // the next turn re-seeds a fresh session with full history).
  const sessions = createBridgeSessionStore()
  let boundPort = requestedPort
  let server: Server | undefined

  const onRequest = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    // Reject any request whose Host isn't our exact loopback authority. This is
    // the anti-DNS-rebinding gate: a rebinding page sends `Host: evil.com`, so it
    // never reaches the origin/token checks below (the fix Ollama shipped for
    // CVE-2024-28224). Checked before everything else.
    if (!isHostAllowed(headerStr(req.headers.host), boundPort)) {
      endStatus(res, 403)
      return
    }
    const origin = headerStr(req.headers.origin)
    const ok = isOriginAllowed(origin, allowed)

    if (req.method === 'OPTIONS') {
      if (!ok) {
        endStatus(res, 403)
        return
      }
      applyCors(res, origin)
      endStatus(res, 204)
      return
    }
    if (!ok) {
      sendJson(res, 403, { error: 'origin not allowed' })
      return
    }
    applyCors(res, origin)

    const path = (req.url ?? '').split('?')[0]

    if (req.method === 'GET' && path === '/health') {
      sendJson(res, 200, bridgeHealth({ agent: agentName, version }))
      return
    }

    if (req.method === 'POST' && path === '/v1/chat/completions') {
      if (!isTokenValid(headerStr(req.headers.authorization), pairingToken)) {
        sendJson(res, 401, { error: { message: 'invalid or missing pairing token' } })
        return
      }
      let body: Record<string, unknown>
      try {
        body = await readJson(req)
      } catch (err) {
        sendJson(res, 400, { error: { message: messageOf(err) } })
        return
      }
      const messages = parseMessages(body)
      const model = typeof body.model === 'string' ? body.model : agentName
      const stream = body.stream === true

      // Streaming-capable agent (Claude Code): plan the turn against the
      // session store (resume + suffix-only prompt when the conversation is
      // known), forward deltas LIVE as SSE chunks, and record the finished
      // turn so the next request resumes the CLI session (exploration 0391).
      if (isStreamingChatAgent(config.agent)) {
        const plan = sessions.plan(messages)
        const sse = stream ? createSseStream(res, model) : undefined
        try {
          const result = await config.agent.streamTurn(plan, (delta) => sse?.delta(delta))
          if (result.sessionId) sessions.record(messages, result.text, result.sessionId)
          if (sse) sse.done()
          else sendJson(res, 200, completion(result.text, model))
        } catch (err) {
          // Mid-stream failures can't become an HTTP error any more; surface
          // them as visible text (the panel's SSE parser ignores error frames).
          if (sse?.started) sse.fail(messageOf(err))
          else sendJson(res, 502, { error: { message: messageOf(err) } })
        }
        return
      }

      let text: string
      try {
        text = await config.agent.chat(messages)
      } catch (err) {
        sendJson(res, 502, { error: { message: messageOf(err) } })
        return
      }
      if (stream) sendSse(res, text, model)
      else sendJson(res, 200, completion(text, model))
      return
    }

    if (req.method === 'POST' && path === '/run') {
      if (!isTokenValid(headerStr(req.headers.authorization), pairingToken)) {
        sendJson(res, 401, { error: { message: 'invalid or missing pairing token' } })
        return
      }
      if (!config.run) {
        sendJson(res, 501, { error: 'code tasks are not enabled on this bridge' })
        return
      }
      let body: Record<string, unknown>
      try {
        body = await readJson(req)
      } catch (err) {
        sendJson(res, 400, { error: { message: messageOf(err) } })
        return
      }
      const taskId = typeof body.taskId === 'string' ? body.taskId : ''
      const prompt = typeof body.prompt === 'string' ? body.prompt : ''
      if (!taskId || !prompt) {
        sendJson(res, 400, { error: 'taskId and prompt are required' })
        return
      }
      const request: BridgeRunRequest = {
        taskId,
        prompt,
        ...(typeof body.worktreeName === 'string' ? { worktreeName: body.worktreeName } : {})
      }
      try {
        sendJson(res, 200, await config.run(request))
      } catch (err) {
        sendJson(res, 502, { error: { message: messageOf(err) } })
      }
      return
    }

    sendJson(res, 404, { error: 'not found' })
  }

  return {
    get url() {
      return `http://${host}:${boundPort}`
    },
    pairingToken,
    start() {
      return new Promise<void>((resolve, reject) => {
        const created = createServer((req, res) => {
          void onRequest(req, res).catch(() => {
            if (!res.headersSent) sendJson(res, 500, { error: 'internal error' })
            else res.end()
          })
        })
        created.on('error', reject)
        created.listen(requestedPort, host, () => {
          const address = created.address()
          if (address && typeof address === 'object') boundPort = address.port
          server = created
          resolve()
        })
      })
    },
    stop() {
      return new Promise<void>((resolve) => {
        if (!server) return resolve()
        server.close(() => resolve())
        server = undefined
      })
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Accept only requests whose `Host` header is our exact loopback authority
 * (`127.0.0.1:<port>` / `localhost:<port>` / `[::1]:<port>`). A DNS-rebinding
 * page reaches `127.0.0.1` at the socket level but still carries the attacker's
 * hostname in `Host`, so this rejects it before any handler runs.
 */
function isHostAllowed(hostHeader: string | undefined, boundPort: number): boolean {
  if (!hostHeader) return false
  const portMatch = hostHeader.match(/:(\d+)$/)
  const hostname = hostHeader.replace(/:\d+$/, '').replace(/^\[|\]$/g, '')
  if (!LOOPBACK_HOSTS.has(hostname)) return false
  // A port is required in practice (the panel always hits an explicit port), but
  // if absent we can't mismatch it; when present it must equal the bound port.
  return portMatch === null || portMatch[1] === String(boundPort)
}

/** Constant-time compare of the presented `Authorization: Bearer <token>`. */
function isTokenValid(authHeader: string | undefined, expected: string): boolean {
  const presented = (authHeader ?? '').replace(/^Bearer\s+/i, '')
  const a = Buffer.from(presented)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

function isOriginAllowed(origin: string | undefined, allowed: Set<string>): boolean {
  if (origin === undefined) return true // non-browser client (curl, the CLI)
  if (origin === 'null') return true // file:// pages (packaged Electron)
  if (allowed.has(origin)) return true
  try {
    return LOOPBACK_HOSTS.has(new URL(origin).hostname)
  } catch {
    return false
  }
}

function applyCors(res: ServerResponse, origin: string | undefined): void {
  if (origin && origin !== 'null') res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Vary', 'Origin')
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'content-type, authorization')
  res.setHeader('Access-Control-Allow-Private-Network', 'true')
}

function parseMessages(body: Record<string, unknown>): ChatMessage[] {
  const raw = Array.isArray(body.messages) ? body.messages : []
  const messages: ChatMessage[] = []
  for (const entry of raw) {
    if (entry && typeof entry === 'object') {
      const role = (entry as { role?: unknown }).role
      const content = (entry as { content?: unknown }).content
      if (
        (role === 'system' || role === 'user' || role === 'assistant') &&
        typeof content === 'string'
      ) {
        messages.push({ role, content })
      }
    }
  }
  if (messages.length === 0 && typeof body.prompt === 'string') {
    messages.push({ role: 'user', content: body.prompt })
  }
  return messages
}

function completion(text: string, model: string): Record<string, unknown> {
  return {
    id: 'bridge',
    object: 'chat.completion',
    model,
    choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }]
  }
}

interface SseStream {
  readonly started: boolean
  delta(text: string): void
  done(): void
  /** Surface an error as a visible content delta, then close the stream. */
  fail(message: string): void
}

/**
 * An incremental OpenAI-style SSE writer: headers + role chunk go out on the
 * FIRST delta (so a pre-stream failure can still be a clean HTTP 502), then
 * every delta is flushed live as its own chunk.
 */
function createSseStream(res: ServerResponse, model: string): SseStream {
  let started = false
  const writeChunk = (delta: Record<string, unknown>, finish: string | null = null): void => {
    res.write(
      `data: ${JSON.stringify({
        id: 'bridge',
        object: 'chat.completion.chunk',
        model,
        choices: [{ index: 0, delta, finish_reason: finish }]
      })}\n\n`
    )
  }
  const start = (): void => {
    if (started) return
    started = true
    res.statusCode = 200
    res.setHeader('content-type', 'text/event-stream')
    res.setHeader('cache-control', 'no-cache')
    res.setHeader('connection', 'keep-alive')
    // Push the headers + role preamble immediately so the client's reader
    // starts consuming before the first token lands.
    res.flushHeaders?.()
    writeChunk({ role: 'assistant' })
  }
  return {
    get started() {
      return started
    },
    delta(text) {
      if (!text) return
      start()
      writeChunk({ content: text })
    },
    done() {
      start()
      writeChunk({}, 'stop')
      res.write('data: [DONE]\n\n')
      res.end()
    },
    fail(message) {
      start()
      writeChunk({ content: `\n\n[bridge error: ${message}]` })
      writeChunk({}, 'stop')
      res.write('data: [DONE]\n\n')
      res.end()
    }
  }
}

/** Stream the reply as OpenAI-style SSE chunks (one content delta, then DONE). */
function sendSse(res: ServerResponse, text: string, model: string): void {
  res.statusCode = 200
  res.setHeader('content-type', 'text/event-stream')
  res.setHeader('cache-control', 'no-cache')
  res.setHeader('connection', 'keep-alive')
  const chunk = (delta: Record<string, unknown>): void => {
    res.write(
      `data: ${JSON.stringify({
        id: 'bridge',
        object: 'chat.completion.chunk',
        model,
        choices: [{ index: 0, delta }]
      })}\n\n`
    )
  }
  chunk({ role: 'assistant' })
  if (text) chunk({ content: text })
  chunk({})
  res.write('data: [DONE]\n\n')
  res.end()
}

function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(new Error('request body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as unknown
        resolve(parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {})
      } catch {
        reject(new Error('invalid JSON body'))
      }
    })
    req.on('error', reject)
  })
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('content-type', 'application/json')
  res.end(JSON.stringify(body))
}

function endStatus(res: ServerResponse, status: number): void {
  res.statusCode = status
  res.end()
}

function headerStr(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
