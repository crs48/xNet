/**
 * xNet Signaling Server
 *
 * WebSocket server for WebRTC signaling (SDP exchange).
 * Peers connect to rooms to discover and signal each other.
 */
import { WebSocketServer, WebSocket } from 'ws'
import { createServer, IncomingMessage, ServerResponse } from 'http'

// Types
interface Room {
  clients: Map<string, WebSocket>
}

interface SignalMessage {
  type: 'join' | 'leave' | 'signal' | 'peers' | 'ping' | 'pong'
  room?: string
  peerId?: string
  targetPeerId?: string
  signal?: unknown
}

// State
const rooms = new Map<string, Room>()

// Create HTTP server for health checks
const httpServer = createServer((req: IncomingMessage, res: ServerResponse) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      status: 'healthy',
      uptime: process.uptime(),
      rooms: rooms.size,
      connections: getTotalConnections(),
      version: process.env.VERSION || '0.0.1'
    }))
    return
  }

  if (req.url === '/metrics') {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end(getPrometheusMetrics())
    return
  }

  res.writeHead(404)
  res.end('Not found')
})

// Create WebSocket server
const wss = new WebSocketServer({ server: httpServer })

wss.on('connection', (ws, req) => {
  let currentRoom: string | null = null
  let currentPeerId: string | null = null

  console.log(`New connection from ${req.socket.remoteAddress}`)

  ws.on('message', (data) => {
    try {
      const message: SignalMessage = JSON.parse(data.toString())

      switch (message.type) {
        case 'join':
          if (message.room && message.peerId) {
            handleJoin(ws, message.room, message.peerId)
            currentRoom = message.room
            currentPeerId = message.peerId
          }
          break

        case 'signal':
          if (message.room && message.peerId && message.targetPeerId && message.signal) {
            handleSignal(message.room, message.peerId, message.targetPeerId, message.signal)
          }
          break

        case 'leave':
          if (currentRoom && currentPeerId) {
            handleLeave(currentRoom, currentPeerId)
            currentRoom = null
            currentPeerId = null
          }
          break

        case 'ping':
          ws.send(JSON.stringify({ type: 'pong' }))
          break
      }
    } catch (e) {
      console.error('Invalid message:', e)
    }
  })

  ws.on('close', () => {
    if (currentRoom && currentPeerId) {
      handleLeave(currentRoom, currentPeerId)
    }
    console.log(`Connection closed: ${currentPeerId || 'unknown'}`)
  })

  ws.on('error', (err) => {
    console.error('WebSocket error:', err)
  })
})

/**
 * Handle peer joining a room
 */
function handleJoin(ws: WebSocket, room: string, peerId: string) {
  if (!rooms.has(room)) {
    rooms.set(room, { clients: new Map() })
  }

  const roomData = rooms.get(room)!
  roomData.clients.set(peerId, ws)

  // Notify new peer of existing peers
  const existingPeers = Array.from(roomData.clients.keys()).filter(id => id !== peerId)
  ws.send(JSON.stringify({
    type: 'peers',
    room,
    peers: existingPeers
  }))

  // Notify existing peers of new peer
  roomData.clients.forEach((client, id) => {
    if (id !== peerId && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({
        type: 'join',
        room,
        peerId
      }))
    }
  })

  console.log(`Peer ${peerId} joined room ${room} (${roomData.clients.size} peers)`)
}

/**
 * Handle signaling message relay
 */
function handleSignal(room: string, peerId: string, targetPeerId: string, signal: unknown) {
  const roomData = rooms.get(room)
  if (!roomData) return

  const targetClient = roomData.clients.get(targetPeerId)
  if (targetClient && targetClient.readyState === WebSocket.OPEN) {
    targetClient.send(JSON.stringify({
      type: 'signal',
      room,
      peerId, // Sender
      signal
    }))
  }
}

/**
 * Handle peer leaving a room
 */
function handleLeave(room: string, peerId: string) {
  const roomData = rooms.get(room)
  if (!roomData) return

  roomData.clients.delete(peerId)

  // Notify remaining peers
  roomData.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({
        type: 'leave',
        room,
        peerId
      }))
    }
  })

  // Clean up empty rooms
  if (roomData.clients.size === 0) {
    rooms.delete(room)
  }

  console.log(`Peer ${peerId} left room ${room}`)
}

/**
 * Get total number of connections
 */
function getTotalConnections(): number {
  let total = 0
  rooms.forEach(room => {
    total += room.clients.size
  })
  return total
}

/**
 * Get Prometheus-format metrics
 */
function getPrometheusMetrics(): string {
  const connections = getTotalConnections()
  return `
# HELP xnet_signaling_rooms_total Total number of active rooms
# TYPE xnet_signaling_rooms_total gauge
xnet_signaling_rooms_total ${rooms.size}

# HELP xnet_signaling_connections_total Total number of active connections
# TYPE xnet_signaling_connections_total gauge
xnet_signaling_connections_total ${connections}

# HELP xnet_signaling_uptime_seconds Server uptime in seconds
# TYPE xnet_signaling_uptime_seconds gauge
xnet_signaling_uptime_seconds ${process.uptime()}
`.trim()
}

// Start server
const PORT = parseInt(process.env.PORT || '4000', 10)
httpServer.listen(PORT, () => {
  console.log(`xNet Signaling Server running on port ${PORT}`)
  console.log(`Health check: http://localhost:${PORT}/health`)
  console.log(`Metrics: http://localhost:${PORT}/metrics`)
})

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully...')
  wss.close(() => {
    httpServer.close(() => {
      console.log('Server closed')
      process.exit(0)
    })
  })
})
