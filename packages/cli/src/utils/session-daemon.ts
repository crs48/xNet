/**
 * `xnet serve` — a warm process for the read verbs (exploration 0415).
 *
 * Every `xnet` verb is a cold Node process: resolve a backend, open SQLite,
 * prime the schema registry, answer, exit. Measured at ~0.25 s against an
 * *empty* database, before any data is touched. A fifteen-call agent turn
 * therefore spends around four seconds doing nothing but booting.
 *
 * The daemon holds the store, the schema registry, the FTS handle and (later)
 * the vector tier open, and answers over a unix socket. Verbs try it first and
 * fall back to the cold path when nothing is listening — an absent daemon is
 * the normal case, not an error.
 *
 * What is *not* normal, and is therefore loud:
 *
 * - **A version mismatch.** A daemon from an older CLI answering a newer verb
 *   is exactly the failure that looks like success. The handshake compares
 *   protocol and CLI version and the client exits 1 rather than trust it.
 * - **A connection that dies mid-request.** The client rejects with a named
 *   error. A killed daemon must never read as "no results" — that is the same
 *   class of bug as a truncated scan reporting an exhaustive search (0413's
 *   exit-0 zombie taught this the expensive way).
 */

import { createHash } from 'node:crypto'
import { createServer, connect, type Server, type Socket } from 'node:net'
import { mkdir, rm, stat } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

/** Bumped whenever the wire shape changes in a way an old peer would misread. */
export const SESSION_PROTOCOL = 1

/** Ops the daemon serves. Deliberately small: the read verbs, nothing that writes. */
export type SessionOp = 'search' | 'recall' | 'query' | 'get' | 'ping'

export type SessionRequest = { id: number; op: SessionOp; params: Record<string, unknown> }

export type SessionResponse =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: string }

export type SessionHello = {
  hello: 'xnet'
  protocol: number
  version: string
  pid: number
  /** What this daemon is serving, so a client can tell it apart from another tree's. */
  target: string
  /** Retrieval tier the warm process resolved — the client reports it verbatim. */
  tier: string
}

/** Raised for every daemon failure that must not be mistaken for an empty result. */
export class SessionDaemonError extends Error {
  readonly _tag = 'SessionDaemonError'
  constructor(
    message: string,
    readonly code: 'version-mismatch' | 'protocol' | 'disconnected' | 'failed'
  ) {
    super(message)
    this.name = 'SessionDaemonError'
  }
}

// ─── Socket path ─────────────────────────────────────────────────────────────

/**
 * The daemon key, derived from the *options* rather than a resolved backend.
 *
 * A client that had to resolve a backend to find the daemon would already have
 * paid the cost the daemon exists to avoid. Both sides compute this from the
 * same flags and environment, so the same invocation always lands on the same
 * socket — and two worktrees pointing at two stores never share one (the 0413
 * lesson, applied before it can bite).
 */
export function sessionTargetFor(options: {
  db?: string
  apiUrl?: string
  agent?: string
}): string {
  const db = options.db ?? process.env.XNET_DB
  if (db) return `db:${db}${options.agent ? `#${options.agent}` : ''}`
  const apiUrl = options.apiUrl ?? process.env.XNET_API_URL ?? 'http://127.0.0.1:31415'
  return `api:${apiUrl.replace(/\/$/, '')}`
}

/**
 * One socket per backend target, so two worktrees pointing at two stores never
 * share a daemon (the 0413 lesson, applied before it can bite).
 */
export function socketPathFor(target: string): string {
  const digest = createHash('sha256').update(target).digest('hex').slice(0, 12)
  if (process.platform === 'win32') return `\\\\.\\pipe\\xnet-session-${digest}`
  const base =
    process.env.XDG_RUNTIME_DIR ??
    (process.platform === 'darwin' ? join(homedir(), '.xnet', 'run') : tmpdir())
  return join(base, `xnet-session-${digest}.sock`)
}

// ─── Server ──────────────────────────────────────────────────────────────────

export type SessionHandlers = {
  [K in Exclude<SessionOp, 'ping'>]: (params: Record<string, unknown>) => Promise<unknown>
}

export type SessionServerOptions = {
  target: string
  version: string
  tier: string
  handlers: SessionHandlers
  /** Override the socket path (tests). */
  socketPath?: string
}

export type SessionServerHandle = {
  socketPath: string
  connections: () => number
  stop: () => Promise<void>
}

export async function startSessionServer(
  options: SessionServerOptions
): Promise<SessionServerHandle> {
  const socketPath = options.socketPath ?? socketPathFor(options.target)
  if (process.platform !== 'win32') {
    await mkdir(dirname(socketPath), { recursive: true })
    // A socket file left by a crashed daemon would make `listen` fail with
    // EADDRINUSE. Remove it only when nothing is actually listening — probing
    // first so we never evict a live daemon and leave two half-servers behind.
    if (await pathExists(socketPath)) {
      if (await isListening(socketPath)) {
        throw new SessionDaemonError(
          `A daemon is already serving ${options.target} at ${socketPath}`,
          'failed'
        )
      }
      await rm(socketPath, { force: true })
    }
  }

  const sockets = new Set<Socket>()
  const server: Server = createServer((socket) => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
    socket.on('error', () => sockets.delete(socket))

    const hello: SessionHello = {
      hello: 'xnet',
      protocol: SESSION_PROTOCOL,
      version: options.version,
      pid: process.pid,
      target: options.target,
      tier: options.tier
    }
    socket.write(`${JSON.stringify(hello)}\n`)

    let buffer = ''
    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8')
      let newline = buffer.indexOf('\n')
      while (newline !== -1) {
        const line = buffer.slice(0, newline)
        buffer = buffer.slice(newline + 1)
        void handleLine(line, socket, options.handlers)
        newline = buffer.indexOf('\n')
      }
    })
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(socketPath, () => {
      server.removeListener('error', reject)
      resolve()
    })
  })

  return {
    socketPath,
    connections: () => sockets.size,
    stop: async () => {
      for (const socket of sockets) socket.destroy()
      await new Promise<void>((resolve) => server.close(() => resolve()))
      if (process.platform !== 'win32') await rm(socketPath, { force: true })
    }
  }
}

async function handleLine(line: string, socket: Socket, handlers: SessionHandlers): Promise<void> {
  if (!line.trim()) return
  let request: SessionRequest
  try {
    request = JSON.parse(line) as SessionRequest
  } catch {
    socket.write(`${JSON.stringify({ id: 0, ok: false, error: 'malformed request' })}\n`)
    return
  }
  const reply = (response: SessionResponse): void => {
    if (!socket.destroyed) socket.write(`${JSON.stringify(response)}\n`)
  }
  if (request.op === 'ping') {
    reply({ id: request.id, ok: true, result: 'pong' })
    return
  }
  const handler = handlers[request.op]
  if (!handler) {
    reply({ id: request.id, ok: false, error: `unknown op: ${request.op}` })
    return
  }
  try {
    reply({ id: request.id, ok: true, result: await handler(request.params ?? {}) })
  } catch (err) {
    reply({ id: request.id, ok: false, error: err instanceof Error ? err.message : String(err) })
  }
}

// ─── Client ──────────────────────────────────────────────────────────────────

export type SessionClient = {
  hello: SessionHello
  call: (op: SessionOp, params?: Record<string, unknown>) => Promise<unknown>
  close: () => void
}

export type ConnectSessionOptions = {
  target: string
  /** The calling CLI's version; a mismatch is fatal, not silently tolerated. */
  version: string
  socketPath?: string
  /** How long to wait for the handshake before treating the daemon as absent. */
  timeoutMs?: number
}

/**
 * Connect to a running daemon.
 *
 * Returns `null` when nothing is listening — that is the ordinary case and the
 * caller falls back to the cold path without a word. Every other failure
 * **throws** {@link SessionDaemonError}: a daemon that is present but wrong is
 * far more dangerous than one that is absent.
 */
export async function connectSession(
  options: ConnectSessionOptions
): Promise<SessionClient | null> {
  const socketPath = options.socketPath ?? socketPathFor(options.target)
  const timeoutMs = options.timeoutMs ?? 1000

  let socket: Socket
  try {
    socket = await new Promise<Socket>((resolve, reject) => {
      const s = connect(socketPath)
      const timer = setTimeout(() => {
        s.destroy()
        reject(new SessionDaemonError('daemon did not answer in time', 'disconnected'))
      }, timeoutMs)
      s.once('connect', () => {
        clearTimeout(timer)
        resolve(s)
      })
      s.once('error', (err) => {
        clearTimeout(timer)
        reject(err)
      })
    })
  } catch (err) {
    // No socket, or nothing listening on it: no daemon. Fall back quietly.
    if (isAbsent(err)) return null
    throw err instanceof SessionDaemonError
      ? err
      : new SessionDaemonError(`could not reach the xnet daemon: ${String(err)}`, 'failed')
  }

  const pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >()
  let helloResolve: ((hello: SessionHello) => void) | null = null
  let helloReject: ((error: Error) => void) | null = null
  const helloPromise = new Promise<SessionHello>((resolve, reject) => {
    helloResolve = resolve
    helloReject = reject
  })
  // The socket can close before the `await` below attaches a handler, which
  // Node reports as an unhandled rejection even though we do handle it. One
  // no-op handler now makes the rejection accounted-for; the `await` still sees
  // the real outcome.
  helloPromise.catch(() => {})

  let buffer = ''
  socket.on('data', (chunk) => {
    buffer += chunk.toString('utf8')
    let newline = buffer.indexOf('\n')
    while (newline !== -1) {
      const line = buffer.slice(0, newline)
      buffer = buffer.slice(newline + 1)
      newline = buffer.indexOf('\n')
      if (!line.trim()) continue
      let message: unknown
      try {
        message = JSON.parse(line)
      } catch {
        continue
      }
      if (isHello(message)) {
        helloResolve?.(message)
        helloResolve = null
        // Settled: a later close must not try to reject it.
        helloReject = null
        continue
      }
      const response = message as SessionResponse
      const waiter = pending.get(response.id)
      if (!waiter) continue
      pending.delete(response.id)
      if (response.ok) waiter.resolve(response.result)
      else waiter.reject(new SessionDaemonError(response.error, 'failed'))
    }
  })

  // A daemon that dies with calls in flight must fail them, loudly. Resolving
  // them to empty would be indistinguishable from "the workspace has nothing".
  const fail = (reason: string): void => {
    const error = new SessionDaemonError(reason, 'disconnected')
    helloReject?.(error)
    helloReject = null
    for (const waiter of pending.values()) waiter.reject(error)
    pending.clear()
  }
  socket.on('close', () => fail('the xnet daemon closed the connection mid-request'))
  socket.on('error', (err) => fail(`the xnet daemon connection failed: ${err.message}`))

  const helloTimer = setTimeout(() => fail('the xnet daemon never sent a handshake'), timeoutMs)
  let hello: SessionHello
  try {
    hello = await helloPromise
  } finally {
    clearTimeout(helloTimer)
  }

  if (hello.protocol !== SESSION_PROTOCOL || hello.version !== options.version) {
    socket.destroy()
    throw new SessionDaemonError(
      `Refusing a stale xnet daemon at ${socketPath}: it speaks protocol ` +
        `${hello.protocol}/v${hello.version}, this CLI speaks ${SESSION_PROTOCOL}/v${options.version} ` +
        `(pid ${hello.pid}). Restart it with \`xnet serve\`, or stop it and re-run without one.`,
      'version-mismatch'
    )
  }

  let nextId = 0
  return {
    hello,
    call: (op, params = {}) => {
      const id = ++nextId
      return new Promise<unknown>((resolve, reject) => {
        if (socket.destroyed) {
          reject(new SessionDaemonError('the xnet daemon connection is closed', 'disconnected'))
          return
        }
        pending.set(id, { resolve, reject })
        socket.write(`${JSON.stringify({ id, op, params })}\n`)
      })
    },
    close: () => {
      socket.destroy()
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isHello(value: unknown): value is SessionHello {
  return typeof value === 'object' && value !== null && (value as SessionHello).hello === 'xnet'
}

/** Connection errors that mean "no daemon here", as opposed to "it went wrong". */
function isAbsent(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code
  return code === 'ENOENT' || code === 'ECONNREFUSED'
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

/** True when something is actually accepting connections on `socketPath`. */
async function isListening(socketPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect(socketPath)
    const done = (answer: boolean): void => {
      socket.destroy()
      resolve(answer)
    }
    socket.once('connect', () => done(true))
    socket.once('error', () => done(false))
    setTimeout(() => done(false), 300)
  })
}
