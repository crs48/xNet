/**
 * xNet Signaling Server
 *
 * WebSocket server for WebRTC signaling compatible with y-webrtc.
 * Uses the y-webrtc pub/sub protocol for peer discovery and signaling.
 *
 * Protocol:
 * - Client sends: { type: 'subscribe', topics: ['room1', 'room2'] }
 * - Client sends: { type: 'unsubscribe', topics: ['room1'] }
 * - Client sends: { type: 'publish', topic: 'room1', data: {...} }
 * - Server sends: { type: 'publish', topic: 'room1', data: {...} }
 * - Client sends: { type: 'ping' }
 * - Server sends: { type: 'pong' }
 */
import { WebSocketServer, WebSocket } from 'ws'
import { createServer, IncomingMessage, ServerResponse } from 'http'

// Types
interface Topic {
  subscribers: Set<WebSocket>
}

interface SignalMessage {
  type: 'subscribe' | 'unsubscribe' | 'publish' | 'ping' | 'pong'
  topics?: string[]
  topic?: string
  data?: unknown
}

// State
const topics = new Map<string, Topic>()

// Track subscriptions per client for cleanup
const clientSubscriptions = new WeakMap<WebSocket, Set<string>>()

// Create HTTP server for health checks
const httpServer = createServer((req: IncomingMessage, res: ServerResponse) => {
  // Handle CORS preflight
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(
      JSON.stringify({
        status: 'healthy',
        uptime: process.uptime(),
        topics: topics.size,
        connections: getTotalConnections(),
        version: process.env.VERSION || '0.0.1'
      })
    )
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
  // Initialize client's subscription set
  clientSubscriptions.set(ws, new Set())

  console.log(`New connection from ${req.socket.remoteAddress}`)

  ws.on('message', (rawData) => {
    try {
      const message: SignalMessage = JSON.parse(rawData.toString())

      switch (message.type) {
        case 'subscribe':
          handleSubscribe(ws, message.topics || [])
          break

        case 'unsubscribe':
          handleUnsubscribe(ws, message.topics || [])
          break

        case 'publish':
          if (message.topic) {
            handlePublish(ws, message.topic, message.data)
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
    // Unsubscribe from all topics
    const subs = clientSubscriptions.get(ws)
    if (subs) {
      handleUnsubscribe(ws, Array.from(subs))
    }
    console.log('Connection closed')
  })

  ws.on('error', (err) => {
    console.error('WebSocket error:', err)
  })
})

/**
 * Handle client subscribing to topics
 */
function handleSubscribe(ws: WebSocket, topicNames: string[]) {
  const subs = clientSubscriptions.get(ws)!

  for (const topicName of topicNames) {
    if (!topics.has(topicName)) {
      topics.set(topicName, { subscribers: new Set() })
    }

    const topic = topics.get(topicName)!
    topic.subscribers.add(ws)
    subs.add(topicName)

    console.log(`Client subscribed to ${topicName} (${topic.subscribers.size} subscribers)`)
  }
}

/**
 * Handle client unsubscribing from topics
 */
function handleUnsubscribe(ws: WebSocket, topicNames: string[]) {
  const subs = clientSubscriptions.get(ws)

  for (const topicName of topicNames) {
    const topic = topics.get(topicName)
    if (topic) {
      topic.subscribers.delete(ws)
      subs?.delete(topicName)

      // Clean up empty topics
      if (topic.subscribers.size === 0) {
        topics.delete(topicName)
        console.log(`Topic ${topicName} removed (no subscribers)`)
      }
    }
  }
}

/**
 * Handle publish message - broadcast to all subscribers except sender
 */
function handlePublish(sender: WebSocket, topicName: string, data: unknown) {
  const topic = topics.get(topicName)
  if (!topic) return

  // Log signal details for debugging WebRTC connection issues
  const d = data as Record<string, unknown> | null
  if (d && typeof d === 'object') {
    const signalType = d.type as string
    if (signalType === 'announce') {
      console.log(`[signal] ANNOUNCE from=${d.from} topic=${topicName}`)
    } else if (signalType === 'signal') {
      const signal = d.signal as Record<string, unknown> | undefined
      console.log(
        `[signal] SIGNAL from=${d.from} to=${d.to} signal.type=${signal?.type} token=${d.token} topic=${topicName}`
      )
    }
  }

  const message = JSON.stringify({
    type: 'publish',
    topic: topicName,
    data
  })

  let sent = 0
  topic.subscribers.forEach((client) => {
    if (client !== sender && client.readyState === WebSocket.OPEN) {
      client.send(message)
      sent++
    }
  })

  if (sent > 0) {
    console.log(`[signal] Published to ${topicName}: ${sent} recipients`)
  }
}

/**
 * Get total number of connections
 */
function getTotalConnections(): number {
  return wss.clients.size
}

/**
 * Get Prometheus-format metrics
 */
function getPrometheusMetrics(): string {
  const connections = getTotalConnections()
  let totalSubscriptions = 0
  topics.forEach((topic) => {
    totalSubscriptions += topic.subscribers.size
  })

  return `
# HELP xnet_signaling_topics_total Total number of active topics
# TYPE xnet_signaling_topics_total gauge
xnet_signaling_topics_total ${topics.size}

# HELP xnet_signaling_connections_total Total number of active connections
# TYPE xnet_signaling_connections_total gauge
xnet_signaling_connections_total ${connections}

# HELP xnet_signaling_subscriptions_total Total number of active subscriptions
# TYPE xnet_signaling_subscriptions_total gauge
xnet_signaling_subscriptions_total ${totalSubscriptions}

# HELP xnet_signaling_uptime_seconds Server uptime in seconds
# TYPE xnet_signaling_uptime_seconds gauge
xnet_signaling_uptime_seconds ${process.uptime()}
`.trim()
}

// Start server
const PORT = parseInt(process.env.PORT || '4444', 10)
httpServer.listen(PORT, () => {
  console.log(`xNet Signaling Server running on port ${PORT}`)
  console.log(`Health check: http://localhost:${PORT}/health`)
  console.log(`Metrics: http://localhost:${PORT}/metrics`)
  console.log('')
  console.log('y-webrtc compatible protocol:')
  console.log('  subscribe: { type: "subscribe", topics: ["room1"] }')
  console.log('  publish:   { type: "publish", topic: "room1", data: {...} }')
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
