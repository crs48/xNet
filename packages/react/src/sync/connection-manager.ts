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
}

type RoomHandler = (data: Record<string, unknown>) => void
type StatusHandler = (status: ConnectionStatus) => void

export interface ConnectionManager {
  /** Current connection status */
  readonly status: ConnectionStatus
  /** Connect to the signaling server */
  connect(): void
  /** Disconnect and cleanup */
  disconnect(): void
  /** Subscribe to a room (returns unsubscribe function) */
  joinRoom(room: string, handler: RoomHandler): () => void
  /** Leave a room */
  leaveRoom(room: string): void
  /** Publish a message to a room */
  publish(room: string, data: object): void
  /** Listen for status changes */
  onStatus(handler: StatusHandler): () => void
  /** Number of active room subscriptions */
  readonly roomCount: number
}

export function createConnectionManager(config: ConnectionManagerConfig): ConnectionManager {
  let ws: WebSocket | null = null
  let status: ConnectionStatus = 'disconnected'
  let reconnectAttempts = 0
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let destroyed = false

  const reconnectDelay = config.reconnectDelay ?? 2000
  const maxReconnects = config.maxReconnects ?? Infinity

  const rooms = new Map<string, Set<RoomHandler>>()
  const statusListeners = new Set<StatusHandler>()

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
      }
    } catch (err) {
      log('Failed to parse message:', err)
      // Ignore parse errors
    }
  }

  function doConnect(): void {
    if (destroyed) {
      log('doConnect called but manager is destroyed')
      return
    }

    log('Connecting to:', config.url)
    setStatus('connecting')

    try {
      ws = new WebSocket(config.url)

      ws.onopen = () => {
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
        log('WebSocket closed, code:', event.code, 'reason:', event.reason || '(none)')
        ws = null
        setStatus('disconnected')
        scheduleReconnect()
      }

      ws.onerror = (event) => {
        log('WebSocket error:', event)
        setStatus('error')
      }
    } catch (err) {
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
      doConnect()
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
      doConnect()
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
          send({ type: 'unsubscribe', topics: [room] })
        }
      }
    },

    leaveRoom(room: string): void {
      rooms.delete(room)
      send({ type: 'unsubscribe', topics: [room] })
    },

    publish(room: string, data: object): void {
      log('Publishing to room:', room, 'type:', (data as { type?: string }).type)
      send({ type: 'publish', topic: room, data })
    },

    onStatus(handler: StatusHandler): () => void {
      statusListeners.add(handler)
      return () => statusListeners.delete(handler)
    }
  }
}
