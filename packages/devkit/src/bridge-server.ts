/**
 * @xnetjs/devkit — the agent bridge HTTP daemon (exploration 0194).
 *
 * Serves the loopback endpoint the XNet chat panel's `bridge` connector tier
 * already probes at `http://127.0.0.1:31416`:
 *
 * - `GET  /health`              → {@link bridgeHealth} so the panel detects the
 *   bridge tier (it requires `{ ok: true }`).
 * - `POST /v1/chat/completions` → an **OpenAI-compatible** chat endpoint backed
 *   by a {@link ChatAgent} (the user's own `claude` / `codex` CLI). Supports
 *   streaming (SSE, which is what the panel's provider requests) and one-shot.
 *
 * Hardened like the MCP HTTP transport (`@xnetjs/plugins` `mcp-http.ts`): binds
 * loopback only, answers `OPTIONS` preflights, gates by `Origin` (loopback +
 * an allowlist — never reflects `*` to an arbitrary site), and emits
 * `Access-Control-Allow-Private-Network` so an HTTPS page can reach the loopback
 * daemon (Chrome's Local Network Access flow).
 */

import type { ChatAgent, ChatMessage } from './chat-agent'
import type { AgentTaskResult } from './dev-loop'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { bridgeHealth, type BridgeRunRequest } from './bridge'

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
  const agentName = config.agentName ?? 'agent'
  const version = config.version ?? '0.1.0'
  let boundPort = requestedPort
  let server: Server | undefined

  const onRequest = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
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
