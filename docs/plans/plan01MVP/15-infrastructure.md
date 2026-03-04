# 15: Infrastructure

> Signaling servers, relay nodes, and bootstrap peers

**Duration:** 3 weeks (can be deferred until P2P features needed)
**Dependencies:** @xnetjs/network working

## Current Status

| Component        | Code        | Tests   | Deployment Config     | Deployed |
| ---------------- | ----------- | ------- | --------------------- | -------- |
| Signaling Server | Complete    | 7 tests | Complete (fly.toml)   | No       |
| Bootstrap Node   | Complete    | -       | Partial (no fly.toml) | No       |
| Relay Node       | Not started | -       | No                    | No       |

**For local development**: Run `cd infrastructure/signaling && pnpm dev` to start the signaling server on `ws://localhost:4000`.

**For production P2P**: Deploy signaling servers, then bootstrap nodes, then relay nodes.

**Note**: The signaling server uses the y-webrtc pub/sub protocol (subscribe/publish/unsubscribe) for compatibility with both Yjs document sync and custom record sync.

## Overview

Infrastructure components enable P2P connections. These are optional for local development but required for production P2P sync.

| Component        | Purpose                         | Priority      |
| ---------------- | ------------------------------- | ------------- |
| Signaling Server | WebRTC connection establishment | P0 (Critical) |
| Bootstrap Nodes  | Initial peer discovery          | P0 (Critical) |
| Relay Nodes      | NAT traversal fallback          | P1 (High)     |
| DePIN Storage    | Decentralized backup            | P2 (Future)   |

## Component 1: Signaling Server

WebSocket server implementing the y-webrtc pub/sub protocol for WebRTC signaling. This protocol is used by both:

- **Yjs document sync** (via y-webrtc) for rich text collaboration
- **Record sync** (via RecordSyncProvider) for event-sourced tabular data

### Protocol

The server implements a simple pub/sub pattern:

| Message Type  | Direction       | Purpose                        |
| ------------- | --------------- | ------------------------------ |
| `subscribe`   | Client → Server | Join topics (rooms)            |
| `unsubscribe` | Client → Server | Leave topics                   |
| `publish`     | Client → Server | Broadcast to topic subscribers |
| `publish`     | Server → Client | Relay message to subscribers   |
| `ping/pong`   | Both            | Keep-alive                     |

### Implementation

```typescript
// infrastructure/signaling/src/server.ts
import { WebSocketServer, WebSocket } from 'ws'
import { createServer } from 'http'

// Topic -> Set of subscribed clients
const topics = new Map<string, Set<WebSocket>>()
// Client -> Set of subscribed topics (for cleanup)
const clientTopics = new Map<WebSocket, Set<string>>()

const httpServer = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(
      JSON.stringify({
        status: 'healthy',
        topics: topics.size,
        clients: clientTopics.size
      })
    )
    return
  }
  res.writeHead(404)
  res.end()
})

const wss = new WebSocketServer({ server: httpServer })

wss.on('connection', (ws) => {
  clientTopics.set(ws, new Set())

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString())

      switch (message.type) {
        case 'subscribe':
          handleSubscribe(ws, message.topics || [])
          break
        case 'unsubscribe':
          handleUnsubscribe(ws, message.topics || [])
          break
        case 'publish':
          handlePublish(ws, message.topic, message.data)
          break
        case 'ping':
          ws.send(JSON.stringify({ type: 'pong' }))
          break
      }
    } catch (e) {
      // Ignore invalid messages
    }
  })

  ws.on('close', () => {
    // Unsubscribe from all topics
    const myTopics = clientTopics.get(ws) || new Set()
    handleUnsubscribe(ws, Array.from(myTopics))
    clientTopics.delete(ws)
  })
})

function handleSubscribe(ws: WebSocket, topicNames: string[]) {
  for (const topic of topicNames) {
    if (!topics.has(topic)) {
      topics.set(topic, new Set())
    }
    topics.get(topic)!.add(ws)
    clientTopics.get(ws)?.add(topic)
  }
}

function handleUnsubscribe(ws: WebSocket, topicNames: string[]) {
  for (const topic of topicNames) {
    topics.get(topic)?.delete(ws)
    if (topics.get(topic)?.size === 0) {
      topics.delete(topic)
    }
    clientTopics.get(ws)?.delete(topic)
  }
}

function handlePublish(sender: WebSocket, topic: string, data: unknown) {
  const subscribers = topics.get(topic)
  if (!subscribers) return

  const message = JSON.stringify({ type: 'publish', topic, data })

  for (const client of subscribers) {
    if (client !== sender && client.readyState === WebSocket.OPEN) {
      client.send(message)
    }
  }
}

const PORT = process.env.PORT || 4000
httpServer.listen(PORT, () => {
  console.log(`Signaling server running on port ${PORT}`)
})
```

### Testing

The signaling server has 7 unit tests covering:

- Subscribe/unsubscribe
- Publish/broadcast
- Ping/pong keep-alive
- Client cleanup on disconnect
- Health endpoint

Run tests: `cd infrastructure/signaling && pnpm test`

### Browser Demo

A sync demo is available at `infrastructure/signaling/test/sync-demo.html` that demonstrates real-time Yjs document sync between browser tabs.

### Dockerfile

```dockerfile
# infrastructure/signaling/Dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY dist/ ./dist/

EXPOSE 4000

CMD ["node", "dist/server.js"]
```

### Deployment (fly.io)

```toml
# infrastructure/signaling/fly.toml
app = "xnet-signaling"
primary_region = "sjc"

[build]
  dockerfile = "Dockerfile"

[http_service]
  internal_port = 4000
  force_https = true
  auto_stop_machines = false
  auto_start_machines = true
  min_machines_running = 1

[[services]]
  internal_port = 4000
  protocol = "tcp"

  [[services.ports]]
    port = 443
    handlers = ["tls", "http"]

  [[services.ports]]
    port = 80
    handlers = ["http"]

[env]
  NODE_ENV = "production"
```

## Component 2: Bootstrap Nodes

libp2p nodes for initial peer discovery.

### Implementation

```typescript
// infrastructure/bootstrap/src/node.ts
import { createLibp2p } from 'libp2p'
import { tcp } from '@libp2p/tcp'
import { webSockets } from '@libp2p/websockets'
import { noise } from '@chainsafe/libp2p-noise'
import { yamux } from '@chainsafe/libp2p-yamux'
import { kadDHT } from '@libp2p/kad-dht'
import { bootstrap } from '@libp2p/bootstrap'
import { identify } from '@libp2p/identify'

async function main() {
  const otherBootstrapPeers = process.env.BOOTSTRAP_PEERS?.split(',') || []

  const node = await createLibp2p({
    addresses: {
      listen: ['/ip4/0.0.0.0/tcp/4001', '/ip4/0.0.0.0/tcp/4002/ws']
    },
    transports: [tcp(), webSockets()],
    connectionEncrypters: [noise()],
    streamMuxers: [yamux()],
    peerDiscovery: otherBootstrapPeers.length > 0 ? [bootstrap({ list: otherBootstrapPeers })] : [],
    services: {
      identify: identify(),
      dht: kadDHT({
        protocol: '/xnet/kad/1.0.0',
        clientMode: false // Server mode for bootstrap
      })
    }
  })

  await node.start()

  console.log('Bootstrap node started')
  console.log('Peer ID:', node.peerId.toString())
  console.log('Listening on:')
  node.getMultiaddrs().forEach((ma) => {
    console.log(' -', ma.toString())
  })

  // Log peer connections
  node.addEventListener('peer:connect', (event) => {
    console.log('Connected to:', event.detail.toString())
  })

  node.addEventListener('peer:disconnect', (event) => {
    console.log('Disconnected from:', event.detail.toString())
  })
}

main().catch(console.error)
```

### Dockerfile

```dockerfile
# infrastructure/bootstrap/Dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY dist/ ./dist/

EXPOSE 4001 4002

CMD ["node", "dist/node.js"]
```

## Component 3: Relay Nodes

For NAT traversal when direct connections fail.

### Implementation

```typescript
// infrastructure/relay/src/node.ts
import { createLibp2p } from 'libp2p'
import { tcp } from '@libp2p/tcp'
import { webSockets } from '@libp2p/websockets'
import { noise } from '@chainsafe/libp2p-noise'
import { yamux } from '@chainsafe/libp2p-yamux'
import { circuitRelayServer } from '@libp2p/circuit-relay-v2'
import { identify } from '@libp2p/identify'

async function main() {
  const node = await createLibp2p({
    addresses: {
      listen: ['/ip4/0.0.0.0/tcp/4001', '/ip4/0.0.0.0/tcp/4002/ws']
    },
    transports: [tcp(), webSockets()],
    connectionEncrypters: [noise()],
    streamMuxers: [yamux()],
    services: {
      identify: identify(),
      relay: circuitRelayServer({
        reservations: {
          maxReservations: 1000,
          reservationTtl: 60 * 60 * 1000 // 1 hour
        }
      })
    }
  })

  await node.start()

  console.log('Relay node started')
  console.log('Peer ID:', node.peerId.toString())
  console.log('Listening on:')
  node.getMultiaddrs().forEach((ma) => {
    console.log(' -', ma.toString())
  })
}

main().catch(console.error)
```

## Infrastructure Diagram

```
                    ┌─────────────────────┐
                    │   Load Balancer     │
                    │   (Cloudflare)      │
                    └──────────┬──────────┘
                               │
         ┌─────────────────────┼─────────────────────┐
         │                     │                     │
         ▼                     ▼                     ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│  Signaling #1   │  │  Signaling #2   │  │  Signaling #3   │
│  (US West)      │  │  (US East)      │  │  (Europe)       │
│  fly.io         │  │  fly.io         │  │  fly.io         │
└─────────────────┘  └─────────────────┘  └─────────────────┘

         ┌─────────────────────┼─────────────────────┐
         │                     │                     │
         ▼                     ▼                     ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│  Bootstrap #1   │  │  Bootstrap #2   │  │  Bootstrap #3   │
│  (US West)      │  │  (US East)      │  │  (Europe)       │
└─────────────────┘  └─────────────────┘  └─────────────────┘

         ┌─────────────────────┼─────────────────────┐
         │                     │                     │
         ▼                     ▼                     ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│    Relay #1     │  │    Relay #2     │  │    Relay #3     │
│  (US West)      │  │  (US East)      │  │  (Europe)       │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

## Deployment Checklist

### Signaling Servers

- [x] Implement server code (`infrastructure/signaling/src/server.ts`)
- [x] Implement y-webrtc pub/sub protocol (subscribe/publish/unsubscribe)
- [x] Add unit tests (7 tests)
- [x] Add browser sync demo
- [x] Create Dockerfile
- [x] Create fly.toml deployment config
- [x] Add health check endpoint (`/health`)
- [ ] Deploy to 3 regions (US-West, US-East, Europe)
- [ ] Configure TLS certificates
- [ ] Monitor WebSocket connections
- [ ] Set up auto-scaling

### Bootstrap Nodes

- [x] Implement node code (`infrastructure/bootstrap/src/node.ts`)
- [x] Create Dockerfile
- [ ] Create fly.toml deployment config
- [ ] Deploy to 3 regions
- [ ] Configure peer IDs (stable across restarts)
- [ ] Add peers to client config
- [ ] Monitor DHT health
- [ ] Set up alerting

### Relay Nodes

- [ ] Implement relay node code
- [ ] Create Dockerfile
- [ ] Create fly.toml deployment config
- [ ] Deploy to 3 regions
- [ ] Configure reservation limits
- [ ] Monitor bandwidth usage
- [ ] Set up rate limiting

## Configuration for Clients

```typescript
// packages/network/src/config.ts
export const PRODUCTION_CONFIG = {
  signalingServers: [
    'wss://signal-us-west.xnet.io',
    'wss://signal-us-east.xnet.io',
    'wss://signal-eu.xnet.io'
  ],
  bootstrapPeers: [
    '/dns4/bootstrap-us-west.xnet.io/tcp/4001/p2p/12D3KooW...',
    '/dns4/bootstrap-us-east.xnet.io/tcp/4001/p2p/12D3KooW...',
    '/dns4/bootstrap-eu.xnet.io/tcp/4001/p2p/12D3KooW...'
  ],
  relayPeers: [
    '/dns4/relay-us-west.xnet.io/tcp/4001/p2p/12D3KooW...',
    '/dns4/relay-us-east.xnet.io/tcp/4001/p2p/12D3KooW...',
    '/dns4/relay-eu.xnet.io/tcp/4001/p2p/12D3KooW...'
  ]
}

export const DEVELOPMENT_CONFIG = {
  signalingServers: ['ws://localhost:4000'],
  bootstrapPeers: [],
  relayPeers: []
}
```

## Monitoring

### Metrics to Track

| Metric                | Alert Threshold  |
| --------------------- | ---------------- |
| Signaling connections | < 1000 available |
| Bootstrap DHT peers   | < 100 peers      |
| Relay bandwidth       | > 80% capacity   |
| P99 latency           | > 500ms          |
| Error rate            | > 1%             |

### Health Check Endpoints

```typescript
// All infrastructure nodes
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    connections: getCurrentConnections(),
    version: process.env.VERSION
  })
})

app.get('/metrics', (req, res) => {
  res.set('Content-Type', 'text/plain')
  res.send(getPrometheusMetrics())
})
```

## Cost Estimates

| Component      | Provider | Specs                 | Monthly Cost   |
| -------------- | -------- | --------------------- | -------------- |
| Signaling (x3) | fly.io   | shared-cpu-1x, 256MB  | $15            |
| Bootstrap (x3) | fly.io   | dedicated-cpu-1x, 1GB | $45            |
| Relay (x3)     | fly.io   | dedicated-cpu-2x, 2GB | $90            |
| **Total**      |          |                       | **$150/month** |

_Costs scale with usage. Above estimates for ~10k users._

## Future: DePIN Storage

For Phase 2+, consider decentralized storage:

- **IPFS Pinning**: Pin snapshots to IPFS
- **Filecoin**: Long-term archival
- **Custom DePIN**: Incentivized storage network

This is deferred until core functionality is stable.

---

**End of plan01MVP documentation.**

Return to [README.md](./README.md) for the full implementation order.
