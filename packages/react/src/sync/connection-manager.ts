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
  /** Reconnect delay in ms (default: 2000) */
  reconnectDelay?: number
  /** Max reconnect attempts (default: Infinity) */
  maxReconnects?: number
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
  let reconnectAttempts = 0
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let destroyed = false
  let connectInProgress = false

  const reconnectDelay = config.reconnectDelay ?? 2000
  const maxReconnects = config.maxReconnects ?? Infinity

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

  async function doConnect(): Promise<void> {
    if (destroyed) {
      log('doConnect called but manager is destroyed')
      return
    }
    if (connectInProgress) {
      log('doConnect called but connection already in progress')
      return
    }

    connectInProgress = true
    log('Connecting to:', config.url)
    setStatus('connecting')

    try {
      const token = await resolveAuthToken()
      ws = new WebSocket(config.url, buildProtocols(token))

      ws.onopen = () => {
        connectInProgress = false
        log('WebSocket connected')
        setStatus('connected')
        reconnectAttempts = 0

        // Re-subscribe to all rooms
        if (rooms.size > 0) {
          const roomList = Array.from(rooms.keys())
          log('Re-subscribing to', roomList.length, 'room(s):', roomList)
          send({ type: 'subscribe', topics: roomList })
        }
      }

      ws.onmessage = handleMessage

      ws.onclose = (event) => {
        connectInProgress = false
        log('WebSocket closed, code:', event.code, 'reason:', event.reason || '(none)')
        ws = null
        setStatus('disconnected')
        scheduleReconnect()
      }

      ws.onerror = (event) => {
        connectInProgress = false
        log('WebSocket error:', event)
        setStatus('error')
      }
    } catch (err) {
      connectInProgress = false
      log('Failed to create WebSocket:', err)
      setStatus('error')
      scheduleReconnect()
    }
  }

  function scheduleReconnect(): void {
    if (destroyed || reconnectAttempts >= maxReconnects) return
    if (reconnectTimer) return

    reconnectAttempts++
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      void doConnect()
    }, reconnectDelay)
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
      if (reconnectTimer) {
        clearTimeout(reconnectTimer)
        reconnectTimer = null
      }
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
