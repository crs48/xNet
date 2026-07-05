/**
 * @xnetjs/sqlite - SharedWorker router for multi-tab SQLite (exploration 0263)
 *
 * A deliberately tiny message ferry, NOT a database host: SharedWorkers cannot
 * use OPFS sync access handles, so SQLite itself stays in the leader tab's
 * dedicated worker. This router only (a) remembers which tab is the current
 * leader and (b) ferries `MessagePort`s from the leader to follower tabs — the
 * same role the SharedWorker plays in Notion's and wa-sqlite's (discussion #81)
 * multi-tab architectures.
 *
 * Leadership itself is decided by `navigator.locks` in the tabs (web-leader.ts);
 * the router never elects anyone. When a tab announces `leader-ready` it simply
 * replaces the previous leader registration and followers are told to
 * re-request their DB port.
 *
 * The message handler is exported as a pure function over an explicit state
 * object so it can be unit-tested in Node without a real SharedWorker
 * (mirroring the reader-thread.ts pattern).
 */

/** A follower's request for a DB port, waiting on the leader's response. */
interface PendingPortRequest {
  requesterPort: RouterClientPort
  requestId: string
}

/** The subset of MessagePort the router needs (test seam). */
export interface RouterClientPort {
  postMessage(message: unknown, transfer?: Transferable[]): void
}

/** Messages a tab sends to the router. */
export type RouterInbound =
  | { t: 'leader-ready' }
  | { t: 'request-db-port'; requestId: string }
  | { t: 'db-port'; requestId: string }
  | { t: 'db-port-failed'; requestId: string; error: string }

/** Messages the router sends to a tab. */
export type RouterOutbound =
  | { t: 'mint-db-port'; requestId: string }
  | { t: 'db-port'; requestId: string }
  | { t: 'db-port-failed'; requestId: string; error: string }
  | { t: 'no-leader'; requestId: string }
  | { t: 'leader-changed' }

export interface RouterState {
  leader: RouterClientPort | null
  /** Every connected tab port, for leader-changed broadcasts. */
  clients: Set<RouterClientPort>
  /** Port requests forwarded to the leader, awaiting its minted port. */
  pending: Map<string, PendingPortRequest>
}

export function createRouterState(): RouterState {
  return { leader: null, clients: new Set(), pending: new Map() }
}

/** Register a newly connected tab port. */
export function addRouterClient(state: RouterState, port: RouterClientPort): void {
  state.clients.add(port)
}

/**
 * Dispatch one inbound message. `ports` carries any transferred MessagePorts
 * (the leader's minted DB port rides `db-port` messages).
 */
export function handleRouterMessage(
  state: RouterState,
  sender: RouterClientPort,
  message: RouterInbound,
  ports: readonly Transferable[] = []
): void {
  switch (message.t) {
    case 'leader-ready': {
      const previous = state.leader
      state.leader = sender
      // A leader CHANGE invalidates every follower's existing DB port (the old
      // leader's worker is gone or closing) — tell all OTHER tabs to reconnect.
      // The first announcement is not a change; waiting followers poll anyway.
      if (previous !== null && previous !== sender) {
        for (const client of state.clients) {
          if (client !== sender) {
            safePost(client, { t: 'leader-changed' } satisfies RouterOutbound)
          }
        }
      }
      return
    }

    case 'request-db-port': {
      if (!state.leader) {
        safePost(sender, { t: 'no-leader', requestId: message.requestId } satisfies RouterOutbound)
        return
      }
      state.pending.set(message.requestId, { requesterPort: sender, requestId: message.requestId })
      safePost(state.leader, {
        t: 'mint-db-port',
        requestId: message.requestId
      } satisfies RouterOutbound)
      return
    }

    case 'db-port': {
      const pending = state.pending.get(message.requestId)
      if (!pending) return
      state.pending.delete(message.requestId)
      const [port] = ports
      if (port === undefined) {
        safePost(pending.requesterPort, {
          t: 'db-port-failed',
          requestId: message.requestId,
          error: 'leader response carried no port'
        } satisfies RouterOutbound)
        return
      }
      pending.requesterPort.postMessage(
        { t: 'db-port', requestId: message.requestId } satisfies RouterOutbound,
        [port]
      )
      return
    }

    case 'db-port-failed': {
      const pending = state.pending.get(message.requestId)
      if (!pending) return
      state.pending.delete(message.requestId)
      safePost(pending.requesterPort, {
        t: 'db-port-failed',
        requestId: message.requestId,
        error: message.error
      } satisfies RouterOutbound)
      return
    }
  }
}

/** postMessage to a possibly-dead tab port must never take the router down. */
function safePost(port: RouterClientPort, message: RouterOutbound): void {
  try {
    port.postMessage(message)
  } catch {
    // The tab is gone; navigator.locks handles leadership, and followers
    // re-request ports on leader-changed — nothing to clean up here.
  }
}

/** SharedWorker bootstrap — only runs inside an actual SharedWorker scope. */
function bootstrapRouter(): void {
  const scope = globalThis as unknown as {
    onconnect: ((event: MessageEvent) => void) | null
    SharedWorkerGlobalScope?: unknown
  }
  // `onconnect` only exists on SharedWorkerGlobalScope; importing this module
  // elsewhere (tests, bundle analysis) must be side-effect free.
  if (typeof scope.SharedWorkerGlobalScope === 'undefined') return

  const state = createRouterState()
  scope.onconnect = (event: MessageEvent) => {
    const port = event.ports[0]
    if (!port) return
    addRouterClient(state, port)
    port.onmessage = (msg: MessageEvent) => {
      handleRouterMessage(state, port, msg.data as RouterInbound, msg.ports)
    }
    port.start?.()
  }
}

bootstrapRouter()
