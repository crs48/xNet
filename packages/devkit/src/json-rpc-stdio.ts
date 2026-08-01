/**
 * JSON-RPC 2.0 over a subprocess's stdio (exploration 0416, closing 0392).
 *
 * Two of the agents xNet wants to drive speak this: Codex's `codex app-server`
 * and any ACP agent (`gemini --experimental-acp`). Both are line-delimited
 * JSON-RPC 2.0 over stdin/stdout, both stream progress as *notifications* while
 * a request is in flight, and both can send requests back at the client
 * (permission prompts). The existing {@link LineRunner} is read-only, so
 * neither could be driven — this adds the missing half.
 *
 * Deliberately transport-only: it correlates ids and routes notifications, and
 * knows nothing about what the messages mean. The agent-specific folding into
 * `AgentFrame`s lives with each adapter.
 */

/** A live subprocess with writable stdin and line-delimited stdout. */
export interface DuplexProcess {
  /** Write one line (a newline is appended if absent). */
  write(line: string): void
  /** Complete stdout lines, as they arrive. */
  lines(): AsyncIterable<string>
  /** Terminate the process. */
  kill(): void
}

export interface DuplexRunOptions {
  cwd: string
  env?: Record<string, string | undefined>
  /** Kill the process after this many ms with no output (0 = never). */
  idleTimeoutMs?: number
}

/** Spawns a duplex subprocess. Injected so adapters are testable without one. */
export interface DuplexRunner {
  spawn(command: string, args: string[], options: DuplexRunOptions): DuplexProcess
}

type JsonRpcId = number | string

export type JsonRpcMessage = {
  jsonrpc: '2.0'
  id?: JsonRpcId
  method?: string
  params?: unknown
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}

export type NotificationHandler = (method: string, params: unknown) => void

/**
 * A server-initiated request. The handler's return value is sent back as the
 * result; throwing sends an error. Permission prompts arrive this way, which is
 * why the handler is allowed to be async — it may be waiting on a human.
 */
export type RequestHandler = (method: string, params: unknown) => Promise<unknown>

export interface JsonRpcSessionOptions {
  onNotification?: NotificationHandler
  onRequest?: RequestHandler
  /** Reports protocol-level problems (unparseable lines, orphan responses). */
  onWarning?: (message: string) => void
}

export class JsonRpcError extends Error {
  constructor(
    readonly code: number,
    message: string,
    readonly data?: unknown
  ) {
    super(message)
    this.name = 'JsonRpcError'
  }
}

/**
 * A JSON-RPC 2.0 session over a {@link DuplexProcess}.
 *
 * Pumping is started by {@link start} and runs until the process closes; every
 * in-flight request is rejected on close so a caller can never hang on a dead
 * agent (the failure mode that makes a silent agent look like a slow one).
 */
export class JsonRpcSession {
  private nextId = 1
  private readonly pending = new Map<
    JsonRpcId,
    { resolve: (value: unknown) => void; reject: (err: Error) => void }
  >()
  private pump?: Promise<void>
  private closed = false

  constructor(
    private readonly process: DuplexProcess,
    private readonly options: JsonRpcSessionOptions = {}
  ) {}

  /** Begin reading messages. Resolves when the process's stdout ends. */
  start(): Promise<void> {
    this.pump ??= this.readLoop()
    return this.pump
  }

  /** Send a request and await its response. */
  async request<T = unknown>(method: string, params?: unknown): Promise<T> {
    if (this.closed) throw new Error(`JSON-RPC session is closed (${method})`)
    const id = this.nextId++
    const promise = new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
    })
    this.send({ jsonrpc: '2.0', id, method, params })
    return (await promise) as T
  }

  /** Send a notification (no response expected). */
  notify(method: string, params?: unknown): void {
    if (this.closed) return
    this.send({ jsonrpc: '2.0', method, params })
  }

  /** Stop the session, rejecting anything still in flight. */
  close(reason = 'session closed'): void {
    if (this.closed) return
    this.closed = true
    for (const [, entry] of this.pending) entry.reject(new Error(reason))
    this.pending.clear()
    this.process.kill()
  }

  private send(message: JsonRpcMessage): void {
    this.process.write(JSON.stringify(message))
  }

  private async readLoop(): Promise<void> {
    try {
      for await (const line of this.process.lines()) {
        const trimmed = line.trim()
        if (!trimmed) continue

        let message: JsonRpcMessage
        try {
          message = JSON.parse(trimmed) as JsonRpcMessage
        } catch {
          this.warn(`ignoring unparseable line: ${trimmed.slice(0, 200)}`)
          continue
        }
        await this.dispatch(message)
      }
    } finally {
      // Never leave a caller awaiting a process that has gone away.
      if (!this.closed) {
        this.closed = true
        for (const [, entry] of this.pending) {
          entry.reject(new Error('agent process closed before responding'))
        }
        this.pending.clear()
      }
    }
  }

  private async dispatch(message: JsonRpcMessage): Promise<void> {
    // A response to something we sent.
    if (message.id !== undefined && message.method === undefined) {
      const entry = this.pending.get(message.id)
      if (!entry) {
        this.warn(`response for unknown id ${String(message.id)}`)
        return
      }
      this.pending.delete(message.id)
      if (message.error) {
        entry.reject(new JsonRpcError(message.error.code, message.error.message, message.error.data))
      } else {
        entry.resolve(message.result)
      }
      return
    }

    if (!message.method) {
      this.warn('message with neither method nor id')
      return
    }

    // A server-initiated request — it expects a reply.
    if (message.id !== undefined) {
      if (!this.options.onRequest) {
        this.send({
          jsonrpc: '2.0',
          id: message.id,
          error: { code: -32601, message: `No handler for ${message.method}` }
        })
        return
      }
      try {
        const result = await this.options.onRequest(message.method, message.params)
        this.send({ jsonrpc: '2.0', id: message.id, result })
      } catch (err) {
        this.send({
          jsonrpc: '2.0',
          id: message.id,
          error: { code: -32000, message: err instanceof Error ? err.message : String(err) }
        })
      }
      return
    }

    // A notification.
    this.options.onNotification?.(message.method, message.params)
  }

  private warn(message: string): void {
    ;(this.options.onWarning ?? ((m: string) => console.warn(`[xnet/json-rpc] ${m}`)))(message)
  }
}
