/**
 * Connection Manager - Multiplexed WebSocket connection for all tracked Nodes
 *
 * Instead of one WebSocket per Node (current WebSocketSyncProvider approach),
 * the Connection Manager maintains a single WebSocket subscribed to multiple
 * rooms. This reduces connection count from O(N) to O(1).
 *
 * The signaling protocol supports multi-room subscriptions:
 *   { type: "subscribe", topics: ["xnet-doc-abc", "xnet-doc-def"] }
 */

import { capped, exponential, fixed, jittered, limitAttempts } from '@xnetjs/core'
import { createReconnectScheduler } from './reconnect-scheduler'

// Debug logging - enable via localStorage.setItem('xnet:sync:debug', 'true')
function log(...args: unknown[]): void {
  if (typeof localStorage !== 'undefined' && localStorage.getItem('xnet:sync:debug') === 'true') {
    console.log('[ConnectionManager]', ...args)
  }
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

export interface ConnectionManagerConfig {
  /** Signaling/hub WebSocket URL */
  url: string
  /** Base reconnect delay in ms (default: 2000); grows exponentially per attempt. */
  reconnectDelay?: number
  /**
   * Cap on the exponentially-backed-off reconnect delay (default: 30000).
   * Backoff is `min(reconnectDelay * 2^(attempt-1), maxReconnectDelay)`.
   */
  maxReconnectDelay?: number
  /** Max reconnect attempts (default: Infinity) */
  maxReconnects?: number
  /**
   * Backoff after a policy-violation close (WebSocket code 1008, e.g. the hub's
   * "Rate limit exceeded"): a longer, jittered delay so we don't tight-loop or
   * stampede the hub that just asked us to stop (default: 15000). Jitter adds
   * up to 50% on top (exploration 0206).
   */
  rateLimitBackoffMs?: number
  /**
   * Max time to wait for the WebSocket handshake to open before treating the
   * attempt as failed and backing off (default: 10000). A browser WebSocket has
   * no built-in connect timeout, so a stalled handshake can otherwise hang for
   * tens of seconds (exploration 0188). Set to 0 to disable.
   */
  connectTimeout?: number
  /**
   * Timeout for the FIRST handshake attempt (default: min(connectTimeout,
   * 6000)). A healthy hub handshake completes in well under a second, so the
   * first attempt fails fast and retries instead of pinning the "connecting"
   * indicator for the full connectTimeout on a stalled cold dial; subsequent
   * attempts use the full connectTimeout since the network is evidently slow
   * (exploration 0204). Set to 0 to disable bounding the first attempt.
   */
  initialConnectTimeout?: number
  /** UCAN token for hub auth */
  ucanToken?: string
  /** Async UCAN token provider (preferred for rotation) */
  getUCANToken?: () => Promise<string>
}

type RoomHandler = (data: Record<string, unknown>) => void
type StatusHandler = (status: ConnectionStatus) => void

export interface RoomJoinResult {
  /** Unsubscribe function */
  unsubscribe: () => void
  /** Promise that resolves when server confirms subscription */
  ready: Promise<void>
}

export interface ConnectionManager {
  /** Current connection status */
  readonly status: ConnectionStatus
  /** Connect to the signaling server */
  connect(): void
  /** Disconnect and cleanup */
  disconnect(): void
  /** Subscribe to a room (returns unsubscribe function) */
  joinRoom(room: string, handler: RoomHandler): () => void
  /** Subscribe to a room with confirmation (returns cleanup and ready promise) */
  joinRoomAsync(room: string, handler: RoomHandler): RoomJoinResult
  /** Leave a room */
  leaveRoom(room: string): void
  /** Publish a message to a room */
  publish(room: string, data: object): void
  /** Send a raw message on the WebSocket */
  sendRaw(message: object): void
  /** Listen for non-room messages */
  onMessage(handler: (message: Record<string, unknown>) => void): () => void
  /** Listen for status changes */
  onStatus(handler: StatusHandler): () => void
  /** Number of active room subscriptions */
  readonly roomCount: number
}

export interface MultiHubConnectionManagerConfig {
  /** Hub connections to orchestrate as one logical transport. */
  hubs: readonly ConnectionManagerConfig[]
}

export function createConnectionManager(config: ConnectionManagerConfig): ConnectionManager {
  let ws: WebSocket | null = null
  let status: ConnectionStatus = 'disconnected'
  let connectTimer: ReturnType<typeof setTimeout> | null = null
  let destroyed = false
  let connectInProgress = false
  // Set when the last close was a policy violation (code 1008) — the next
  // reconnect uses the longer, jittered rate-limit backoff (exploration 0206).
  let policyViolation = false

  const reconnectDelay = config.reconnectDelay ?? 2000
  const maxReconnectDelay = config.maxReconnectDelay ?? 30000
  const rateLimitBackoffMs = config.rateLimitBackoffMs ?? 15000
  const maxReconnects = config.maxReconnects ?? Infinity
  const connectTimeout = config.connectTimeout ?? 10000
  const initialConnectTimeout =
    config.initialConnectTimeout ?? (connectTimeout > 0 ? Math.min(connectTimeout, 6000) : 0)

  // Exponential backoff capped at maxReconnectDelay; the first retry keeps the
  // base delay so a persistently unreachable hub isn't dialed every
  // reconnectDelay ms (exploration 0204).
  const reconnectPolicy = limitAttempts(
    capped(exponential(reconnectDelay), maxReconnectDelay),
    maxReconnects
  )
  // Policy/rate-limit close (1008): the hub explicitly asked us to stop. Back
  // off hard with up to 50% jitter so we neither tight-loop nor stampede on a
  // reconnect that would just re-flood (exploration 0206).
  const rateLimitPolicy = limitAttempts(jittered(fixed(rateLimitBackoffMs)), maxReconnects)

  const reconnectScheduler = createReconnectScheduler({
    policy: () => (policyViolation ? rateLimitPolicy : reconnectPolicy),
    onRetry: () => void doConnect()
  })

  function clearConnectTimer(): void {
    if (connectTimer) {
      clearTimeout(connectTimer)
      connectTimer = null
    }
  }

  /** Detach handlers and close a socket we're abandoning (e.g. on timeout). */
  function abandonSocket(socket: WebSocket | null): void {
    if (!socket) return
    socket.onopen = null
    socket.onmessage = null
    socket.onclose = null
    socket.onerror = null
    try {
      socket.close()
    } catch {
      // already closing/closed
    }
  }

  /** Fired when the handshake stalls past connectTimeout — tear down and back off. */
  function onConnectTimeout(): void {
    connectTimer = null
    if (status !== 'connecting') return
    log('WebSocket connect timeout after', connectTimeout, 'ms')
    connectInProgress = false
    const stalled = ws
    ws = null
    abandonSocket(stalled)
    setStatus('error')
    scheduleReconnect()
  }

  /**
   * Bound the handshake: a browser WebSocket has no connect timeout, so a
   * stalled (not refused) handshake would otherwise hang indefinitely
   * (exploration 0188). The first attempt uses the shorter
   * initialConnectTimeout so a stalled cold dial fails fast and retries
   * rather than pinning "connecting" for the full timeout (exploration 0204).
   * Set the relevant timeout to 0 to disable.
   */
  function armConnectTimeout(): void {
    const timeout = reconnectScheduler.attempts === 0 ? initialConnectTimeout : connectTimeout
    if (timeout <= 0 || !Number.isFinite(timeout)) return
    connectTimer = setTimeout(onConnectTimeout, timeout)
  }

  const rooms = new Map<string, Set<RoomHandler>>()
  const statusListeners = new Set<StatusHandler>()
  const messageListeners = new Set<(message: Record<string, unknown>) => void>()
  // Track pending subscription confirmations
  const pendingSubscriptions = new Map<
    string,
    { resolve: () => void; reject: (err: Error) => void }
  >()

  function setStatus(s: ConnectionStatus): void {
    log('Status changed:', status, '->', s)
    status = s
    for (const handler of statusListeners) {
      try {
        handler(s)
      } catch {
        // Listener errors don't break the manager
      }
    }
  }

  function send(msg: object): void {
    if (ws?.readyState === WebSocket.OPEN) {
      log('Sending:', msg)
      ws.send(JSON.stringify(msg))
    } else {
      log('Cannot send, WebSocket not open. readyState:', ws?.readyState)
    }
  }

  function handleMessage(event: MessageEvent): void {
    try {
      const msg = JSON.parse(event.data as string)

      if (msg.type === 'pong') return // Ignore keepalive responses

      log('Received message:', msg.type, msg.topic ? `topic=${msg.topic}` : '')

      // Handle subscription confirmation from server
      if (msg.type === 'subscribed' && Array.isArray(msg.topics)) {
        for (const topic of msg.topics as string[]) {
          const pending = pendingSubscriptions.get(topic)
          if (pending) {
            log('Subscription confirmed for room:', topic)
            pending.resolve()
            pendingSubscriptions.delete(topic)
          }
        }
        return
      }

      if (msg.type === 'publish' && msg.topic) {
        const handlers = rooms.get(msg.topic)
        if (handlers) {
          log('Dispatching to', handlers.size, 'handler(s) for room:', msg.topic)
          for (const handler of handlers) {
            try {
              handler(msg.data)
            } catch (err) {
              log('Handler error:', err)
              // Handler errors don't break the message loop
            }
          }
        } else {
          log('No handlers for room:', msg.topic)
        }
        return
      }

      if (msg && typeof msg === 'object') {
        for (const handler of messageListeners) {
          try {
            handler(msg as Record<string, unknown>)
          } catch {
            // Listener errors don't break the message loop
          }
        }
      }
    } catch (err) {
      log('Failed to parse message:', err)
      // Ignore parse errors
    }
  }

  async function resolveAuthToken(): Promise<string> {
    let token = config.ucanToken ?? ''
    if (!token && config.getUCANToken) {
      try {
        token = await config.getUCANToken()
      } catch {
        token = ''
      }
    }
    return token
  }

  function buildProtocols(token: string): string[] {
    const protocols = ['xnet-sync.v1']
    if (token && !/[\s,]/.test(token)) {
      protocols.push(`xnet-auth.${token}`)
    }
    return protocols
  }

  /** Whether a real hub URL is configured. An empty URL means "offline". */
  function hubConfigured(): boolean {
    return Boolean(config.url) && config.url.trim().length > 0
  }

  /** Guards for doConnect: destroyed, already connecting, or no hub configured. */
  function shouldSkipConnect(): boolean {
    if (destroyed) {
      log('doConnect called but manager is destroyed')
      return true
    }
    if (connectInProgress) {
      log('doConnect called but connection already in progress')
      return true
    }
    if (!hubConfigured()) {
      // No hub configured — stay offline (local-first) without opening a socket
      // or logging a browser connection error (exploration 0188).
      log('No hub URL configured — staying offline')
      return true
    }
    return false
  }

  async function doConnect(): Promise<void> {
    if (shouldSkipConnect()) return

    connectInProgress = true
    log('Connecting to:', config.url)
    setStatus('connecting')

    try {
      const token = await resolveAuthToken()
      ws = new WebSocket(config.url, buildProtocols(token))
      armConnectTimeout()

      ws.onopen = () => {
        clearConnectTimer()
        connectInProgress = false
        log('WebSocket connected')
        setStatus('connected')
        reconnectScheduler.reset()
        policyViolation = false

        // Re-subscribe to all rooms
        if (rooms.size > 0) {
          const roomList = Array.from(rooms.keys())
          log('Re-subscribing to', roomList.length, 'room(s):', roomList)
          send({ type: 'subscribe', topics: roomList })
        }
      }

      ws.onmessage = handleMessage

      ws.onclose = (event) => {
        clearConnectTimer()
        connectInProgress = false
        log('WebSocket closed, code:', event.code, 'reason:', event.reason || '(none)')
        ws = null
        // 1008 = policy violation (the hub's rate-limit close, or auth). Don't
        // tight-loop reconnect-and-reflood; back off hard with jitter (0206).
        policyViolation = event.code === 1008
        setStatus('disconnected')
        scheduleReconnect()
      }

      ws.onerror = (event) => {
        clearConnectTimer()
        connectInProgress = false
        log('WebSocket error:', event)
        setStatus('error')
      }
    } catch (err) {
      clearConnectTimer()
      connectInProgress = false
      log('Failed to create WebSocket:', err)
      setStatus('error')
      scheduleReconnect()
    }
  }

  function scheduleReconnect(): void {
    if (destroyed) return
    if (reconnectScheduler.schedule()) {
      // The 1008 flag is consumed by the retry it selected a policy for.
      policyViolation = false
    }
  }

  return {
    get status() {
      return status
    },
    get roomCount() {
      return rooms.size
    },

    connect() {
      destroyed = false
      void doConnect()
    },

    disconnect() {
      destroyed = true
      clearConnectTimer()
      reconnectScheduler.cancel()
      if (ws) {
        // Unsubscribe from all rooms before closing
        if (rooms.size > 0) {
          send({ type: 'unsubscribe', topics: Array.from(rooms.keys()) })
        }
        ws.close(1000, 'Client disconnect')
        ws = null
      }
      setStatus('disconnected')
    },

    joinRoom(room: string, handler: RoomHandler): () => void {
      log('Joining room:', room)
      let handlers = rooms.get(room)
      if (!handlers) {
        handlers = new Set()
        rooms.set(room, handlers)
        // Subscribe on the wire if connected
        log('New room subscription, sending subscribe message')
        send({ type: 'subscribe', topics: [room] })
      }
      handlers.add(handler)
      log('Room', room, 'now has', handlers.size, 'handler(s)')

      return () => {
        log('Leaving room:', room)
        handlers!.delete(handler)
        if (handlers!.size === 0) {
          rooms.delete(room)
          pendingSubscriptions.delete(room)
          send({ type: 'unsubscribe', topics: [room] })
        }
      }
    },

    joinRoomAsync(room: string, handler: RoomHandler): RoomJoinResult {
      log('Joining room async:', room)
      let handlers = rooms.get(room)
      const isNewRoom = !handlers

      if (!handlers) {
        handlers = new Set()
        rooms.set(room, handlers)
      }
      handlers.add(handler)
      log('Room', room, 'now has', handlers.size, 'handler(s)')

      // Create ready promise
      let ready: Promise<void>
      if (isNewRoom && status === 'connected') {
        // Subscribe on the wire - wait for confirmation
        log('New room subscription (async), sending subscribe message')
        ready = new Promise<void>((resolve, _reject) => {
          pendingSubscriptions.set(room, { resolve, reject: () => resolve() }) // Use resolve for reject to avoid blocking

          send({ type: 'subscribe', topics: [room] })

          // Timeout after 5 seconds - resolve anyway to avoid blocking
          setTimeout(() => {
            if (pendingSubscriptions.has(room)) {
              pendingSubscriptions.delete(room)
              log('Subscription confirmation timeout for room:', room, '- proceeding anyway')
              resolve()
            }
          }, 5000)
        })
      } else {
        // Room already exists or not connected - immediately ready
        // When reconnecting, rooms will be re-subscribed automatically
        if (isNewRoom) {
          log('New room added but not connected, will subscribe when connected')
        }
        ready = Promise.resolve()
      }

      const unsubscribe = () => {
        log('Leaving room:', room)
        handlers!.delete(handler)
        if (handlers!.size === 0) {
          rooms.delete(room)
          pendingSubscriptions.delete(room)
          send({ type: 'unsubscribe', topics: [room] })
        }
      }

      return { unsubscribe, ready }
    },

    leaveRoom(room: string): void {
      rooms.delete(room)
      send({ type: 'unsubscribe', topics: [room] })
    },

    publish(room: string, data: object): void {
      log('Publishing to room:', room, 'type:', (data as { type?: string }).type)
      send({ type: 'publish', topic: room, data })
    },

    sendRaw(message: object): void {
      send(message)
    },

    onMessage(handler: (message: Record<string, unknown>) => void): () => void {
      messageListeners.add(handler)
      return () => messageListeners.delete(handler)
    },

    onStatus(handler: StatusHandler): () => void {
      statusListeners.add(handler)
      return () => statusListeners.delete(handler)
    }
  }
}

export function createMultiHubConnectionManager(
  config: MultiHubConnectionManagerConfig
): ConnectionManager {
  const managers = dedupeHubConfigs(config.hubs).map((hub) => createConnectionManager(hub))
  const statusListeners = new Set<StatusHandler>()
  const messageListeners = new Set<(message: Record<string, unknown>) => void>()
  const rooms = new Map<
    string,
    {
      handlers: Set<RoomHandler>
      ready: Promise<void>
      unsubscribe: () => void
    }
  >()
  let status = aggregateConnectionStatus(managers.map((manager) => manager.status))

  managers.forEach((manager) => {
    manager.onStatus(() => {
      emitAggregateStatus()
    })

    manager.onMessage((message) => {
      for (const handler of messageListeners) {
        try {
          handler(message)
        } catch {
          // Listener errors don't break the message loop.
        }
      }
    })
  })

  function emitAggregateStatus(): void {
    const nextStatus = aggregateConnectionStatus(managers.map((manager) => manager.status))
    if (nextStatus === status) return
    status = nextStatus

    for (const handler of statusListeners) {
      try {
        handler(nextStatus)
      } catch {
        // Listener errors don't break aggregate status updates.
      }
    }
  }

  function ensureRoom(room: string): { ready: Promise<void>; unsubscribe: () => void } {
    const existing = rooms.get(room)
    if (existing) {
      return {
        ready: existing.ready,
        unsubscribe: existing.unsubscribe
      }
    }

    const handlers = new Set<RoomHandler>()
    const dispatch = (data: Record<string, unknown>): void => {
      for (const handler of handlers) {
        try {
          handler(data)
        } catch {
          // Handler errors don't break other room subscribers.
        }
      }
    }
    const subscriptions = managers.map((manager) => manager.joinRoomAsync(room, dispatch))
    const ready = Promise.all(subscriptions.map((subscription) => subscription.ready)).then(
      () => undefined
    )
    const unsubscribe = (): void => {
      for (const subscription of subscriptions) {
        subscription.unsubscribe()
      }
      rooms.delete(room)
    }

    rooms.set(room, {
      handlers,
      ready,
      unsubscribe
    })

    return { ready, unsubscribe }
  }

  return {
    get status() {
      return status
    },
    get roomCount() {
      return rooms.size
    },

    connect() {
      for (const manager of managers) {
        manager.connect()
      }
      emitAggregateStatus()
    },

    disconnect() {
      for (const manager of managers) {
        manager.disconnect()
      }
      emitAggregateStatus()
    },

    joinRoom(room, handler) {
      const { unsubscribe } = ensureRoom(room)
      const current = rooms.get(room)
      current?.handlers.add(handler)

      return () => {
        const latest = rooms.get(room)
        if (!latest) return
        latest.handlers.delete(handler)
        if (latest.handlers.size === 0) {
          unsubscribe()
        }
      }
    },

    joinRoomAsync(room, handler) {
      const { ready, unsubscribe } = ensureRoom(room)
      const current = rooms.get(room)
      current?.handlers.add(handler)

      return {
        ready,
        unsubscribe: () => {
          const latest = rooms.get(room)
          if (!latest) return
          latest.handlers.delete(handler)
          if (latest.handlers.size === 0) {
            unsubscribe()
          }
        }
      }
    },

    leaveRoom(room) {
      const current = rooms.get(room)
      current?.unsubscribe()
    },

    publish(room, data) {
      for (const manager of managers) {
        manager.publish(room, data)
      }
    },

    sendRaw(message) {
      for (const manager of managers) {
        manager.sendRaw(message)
      }
    },

    onMessage(handler) {
      messageListeners.add(handler)
      return () => messageListeners.delete(handler)
    },

    onStatus(handler) {
      statusListeners.add(handler)
      return () => statusListeners.delete(handler)
    }
  }
}

function dedupeHubConfigs(configs: readonly ConnectionManagerConfig[]): ConnectionManagerConfig[] {
  const seen = new Set<string>()
  return configs.filter((config) => {
    if (!config.url || seen.has(config.url)) return false
    seen.add(config.url)
    return true
  })
}

function aggregateConnectionStatus(statuses: readonly ConnectionStatus[]): ConnectionStatus {
  if (statuses.includes('connected')) return 'connected'
  if (statuses.includes('connecting')) return 'connecting'
  if (statuses.length > 0 && statuses.every((status) => status === 'error')) return 'error'
  if (statuses.includes('error')) return 'error'
  return 'disconnected'
}
