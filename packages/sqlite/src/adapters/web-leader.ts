/**
 * @xnetjs/sqlite - Web-Locks leader election for multi-tab SQLite (0263)
 *
 * The opfs-sahpool VFS holds EXCLUSIVE sync access handles, so exactly one
 * context can own the durable database. Before this module, a second xNet tab
 * lost the handle race and silently ran on a non-durable `:memory:` database
 * (exploration 0204). The field-standard fix (Notion, LiveStore, wa-sqlite
 * discussion #81) is:
 *
 *  - every tab races for a `navigator.locks` exclusive lock — the holder is
 *    the LEADER and owns the SQLite dedicated worker;
 *  - followers obtain a MessagePort into the leader's SQLite worker via a
 *    SharedWorker router (web-router-worker.ts) and speak the same Comlink
 *    protocol (`SQLiteWorkerHandler.connectPort` already exposes it);
 *  - when the leader tab dies its lock releases, ONE waiting follower is
 *    promoted (its pending lock request resolves), spawns its own worker, and
 *    announces itself; other followers reconnect.
 *
 * Hardening mirrors PowerSync's published lease design: followers track their
 * in-flight calls so leader loss REJECTS them immediately instead of hanging
 * (abort-on-remote-close), and idempotent reads are transparently re-issued
 * against the new leader once the connection is re-established.
 *
 * Everything here takes its primitives (locks, router, clock) by injection so
 * the full state machine is unit-testable in Node.
 */

/** The browser-global Web Lock name every xNet tab races for. */
export const DB_LEADER_LOCK_NAME = 'xnet-sqlite-db-leader'

/** How long a follower keeps retrying for a DB port before giving up. */
const FOLLOWER_CONNECT_TIMEOUT_MS = 15_000
/** Delay between follower port-request retries while the leader boots. */
const FOLLOWER_RETRY_DELAY_MS = 250

/** Thrown into in-flight follower calls when the leader tab goes away. */
export class LeaderLostError extends Error {
  constructor() {
    super(
      'SQLite leader tab closed while this call was in flight. ' +
        'Idempotent reads retry automatically; writes must be re-submitted.'
    )
    this.name = 'LeaderLostError'
  }
}

/** Minimal LockManager surface (test seam for `navigator.locks`). */
export interface LockManagerLike {
  request(
    name: string,
    options: { mode?: 'exclusive'; ifAvailable?: boolean; signal?: AbortSignal },
    callback: (lock: unknown | null) => Promise<unknown> | unknown
  ): Promise<unknown>
}

/** Minimal router-client surface (test seam for the SharedWorker port). */
export interface RouterLike {
  /** Send a message (optionally transferring ports) to the router. */
  post(message: unknown, transfer?: Transferable[]): void
  /** Subscribe to router messages; returns an unsubscribe. */
  onMessage(listener: (message: unknown, ports: readonly MessagePort[]) => void): () => void
}

export type TabRole = 'leader' | 'follower'

/** The resolved role plus a `release()` for graceful leadership handoff. */
export interface TabRoleHandle {
  role: TabRole
  /**
   * Leader: release the held lock so the next waiting tab promotes — call
   * AFTER the worker has closed and its OPFS handles are free, so the new
   * leader's open doesn't race the release (the opfs-retry backoff remains
   * the safety net, not the mechanism). Follower: cancel the pending
   * promotion request (a closed proxy must never be promoted later).
   */
  release(): void
}

/** True when this context has both primitives multi-tab routing needs. */
export function isMultiTabSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof (navigator as { locks?: unknown }).locks !== 'undefined' &&
    typeof (globalThis as { SharedWorker?: unknown }).SharedWorker === 'function'
  )
}

/**
 * Race for the leader lock without blocking.
 *
 * Resolves `{role: 'leader'}` when this tab acquired the lock (held until the
 * tab dies or `release()` is called), or `{role: 'follower'}` when another tab
 * holds it. A follower also enqueues a BLOCKING lock request whose grant is
 * this tab's promotion signal: `onPromoted` fires exactly once, when the
 * previous leader's lock released and this tab won the next grant (it then
 * holds the lock itself).
 */
export function acquireTabRole(
  locks: LockManagerLike,
  onPromoted: () => void,
  lockName: string = DB_LEADER_LOCK_NAME
): Promise<TabRoleHandle> {
  // While a lock is held, `releaseHeld` resolves the callback's promise (the
  // standard Web Locks release idiom); before promotion, aborting cancels the
  // pending request instead.
  const held = { release: null as (() => void) | null }
  const abort = new AbortController()
  const hold = (): Promise<void> =>
    new Promise<void>((resolve) => {
      held.release = resolve
    })
  const release = (): void => {
    if (held.release) held.release()
    else abort.abort()
  }

  return new Promise<TabRoleHandle>((resolve, reject) => {
    locks
      .request(lockName, { mode: 'exclusive', ifAvailable: true }, (lock) => {
        if (lock === null) {
          resolve({ role: 'follower', release })
          // Queue for promotion: pending until the current leader dies.
          void locks
            .request(lockName, { mode: 'exclusive', signal: abort.signal }, () => {
              onPromoted()
              return hold()
            })
            .catch(() => {
              // Aborted before grant — the normal follower close() path.
            })
          return undefined
        }
        resolve({ role: 'leader', release })
        return hold()
      })
      .catch(reject)
  })
}

/**
 * Leader-side router registration: announce leadership and serve follower
 * port-mint requests with `mintPort` (which wires a fresh MessagePort into the
 * SQLite worker via `connectPort`). Returns an unsubscribe.
 */
export function serveLeaderPorts(
  router: RouterLike,
  mintPort: () => Promise<MessagePort>
): () => void {
  const unsubscribe = router.onMessage((message) => {
    const msg = message as { t?: string; requestId?: string }
    if (msg.t !== 'mint-db-port' || typeof msg.requestId !== 'string') return
    void mintPort()
      .then((port) => {
        router.post({ t: 'db-port', requestId: msg.requestId }, [port])
      })
      .catch((err) => {
        router.post({
          t: 'db-port-failed',
          requestId: msg.requestId,
          error: err instanceof Error ? err.message : String(err)
        })
      })
  })
  router.post({ t: 'leader-ready' })
  return unsubscribe
}

/**
 * Follower-side port acquisition: request a DB port from the router, retrying
 * while the leader is still booting (`no-leader` / no response), until
 * `timeoutMs` elapses.
 */
export async function requestDbPort(
  router: RouterLike,
  options?: { timeoutMs?: number; retryDelayMs?: number }
): Promise<MessagePort> {
  const timeoutMs = options?.timeoutMs ?? FOLLOWER_CONNECT_TIMEOUT_MS
  const retryDelayMs = options?.retryDelayMs ?? FOLLOWER_RETRY_DELAY_MS
  const deadline = Date.now() + timeoutMs
  let attempt = 0

  for (;;) {
    attempt += 1
    const requestId = `port-${attempt}-${Math.random().toString(36).slice(2)}`
    const result = await new Promise<MessagePort | 'retry' | 'failed'>((resolve) => {
      const timer = setTimeout(() => {
        cleanup()
        resolve('retry')
      }, retryDelayMs * 4)
      const cleanup = router.onMessage((message, ports) => {
        const msg = message as { t?: string; requestId?: string; error?: string }
        if (msg.requestId !== requestId) return
        clearTimeout(timer)
        cleanup()
        if (msg.t === 'db-port' && ports[0]) resolve(ports[0])
        else if (msg.t === 'no-leader') resolve('retry')
        else resolve('failed')
      })
      router.post({ t: 'request-db-port', requestId })
    })

    if (result !== 'retry' && result !== 'failed') {
      return result
    }
    if (result === 'failed' || Date.now() + retryDelayMs > deadline) {
      throw new Error('Timed out waiting for the SQLite leader tab to share a database port')
    }
    await new Promise((r) => setTimeout(r, retryDelayMs))
  }
}

/**
 * Tracks a follower's in-flight RPCs so leader loss rejects them immediately
 * (PowerSync's abort-on-remote-close), and re-issues idempotent reads once the
 * proxy reports the connection is re-established.
 */
export class FollowerCallGuard {
  private readonly pending = new Set<(err: Error) => void>()
  private lost = false

  /**
   * Run `op`, racing it against leader loss. `retry` (reads only — they're
   * idempotent) re-runs the op once via `whenReconnected` after a loss.
   */
  async run<T>(op: () => Promise<T>, opts: { retry?: () => Promise<T> } = {}): Promise<T> {
    if (this.lost && !opts.retry) throw new LeaderLostError()

    let rejectPending!: (err: Error) => void
    const lossSignal = new Promise<never>((_, reject) => {
      rejectPending = reject
      this.pending.add(reject)
    })

    try {
      return await Promise.race([op(), lossSignal])
    } catch (err) {
      if (err instanceof LeaderLostError && opts.retry) {
        return opts.retry()
      }
      throw err
    } finally {
      this.pending.delete(rejectPending)
    }
  }

  /** Reject every in-flight call. Safe to call more than once. */
  markLeaderLost(): void {
    this.lost = true
    for (const reject of this.pending) {
      reject(new LeaderLostError())
    }
    this.pending.clear()
  }

  /** The connection was re-established (this tab promoted or re-attached). */
  markReconnected(): void {
    this.lost = false
  }
}

/** Wrap a real SharedWorker port as a {@link RouterLike}. */
export function wrapRouterPort(port: MessagePort): RouterLike {
  const listeners = new Set<(message: unknown, ports: readonly MessagePort[]) => void>()
  port.onmessage = (event: MessageEvent) => {
    for (const listener of [...listeners]) {
      listener(event.data, event.ports)
    }
  }
  port.start?.()
  return {
    post(message, transfer) {
      if (transfer && transfer.length > 0) port.postMessage(message, transfer)
      else port.postMessage(message)
    },
    onMessage(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    }
  }
}

/** Create the router client backed by the shared router worker, or null. */
export function connectRouter(): RouterLike | null {
  if (!isMultiTabSupported()) return null
  try {
    const worker = new SharedWorker(new URL('./web-router-worker.js', import.meta.url), {
      type: 'module',
      name: 'xnet-sqlite-router'
    })
    return wrapRouterPort(worker.port)
  } catch (err) {
    console.warn('[WebSQLiteLeader] SharedWorker router unavailable:', err)
    return null
  }
}
