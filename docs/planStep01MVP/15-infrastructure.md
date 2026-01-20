# 15: Infrastructure

> Signaling servers, relay nodes, and bootstrap peers

**Duration:** 3 weeks (can be deferred until P2P features needed)
**Dependencies:** @xnet/network working

## Overview

Infrastructure components enable P2P connections. These are optional for local development but required for production P2P sync.

| Component | Purpose | Priority |
|-----------|---------|----------|
| Signaling Server | WebRTC connection establishment | P0 (Critical) |
| Bootstrap Nodes | Initial peer discovery | P0 (Critical) |
| Relay Nodes | NAT traversal fallback | P1 (High) |
| DePIN Storage | Decentralized backup | P2 (Future) |

## Component 1: Signaling Server

WebSocket server for WebRTC signaling (SDP exchange).

### Implementation

```typescript
// infrastructure/signaling/src/server.ts
import { WebSocketServer, WebSocket } from 'ws'
import { createServer } from 'http'

interface Room {
  clients: Map<string, WebSocket>
}

interface SignalMessage {
  type: 'join' | 'leave' | 'signal' | 'peers'
  room: string
  peerId: string
  targetPeerId?: string
  signal?: unknown
}

const rooms = new Map<string, Room>()

const httpServer = createServer()
const wss = new WebSocketServer({ server: httpServer })

wss.on('connection', (ws) => {
  let currentRoom: string | null = null
  let currentPeerId: string | null = null

  ws.on('message', (data) => {
    try {
      const message: SignalMessage = JSON.parse(data.toString())

      switch (message.type) {
        case 'join':
          handleJoin(ws, message)
          currentRoom = message.room
          currentPeerId = message.peerId
          break

        case 'signal':
          handleSignal(message)
          break

        case 'leave':
          handleLeave(message)
          break
      }
    } catch (e) {
      console.error('Invalid message:', e)
    }
  })

  ws.on('close', () => {
    if (currentRoom && currentPeerId) {
      handleLeave({ type: 'leave', room: currentRoom, peerId: currentPeerId })
    }
  })
})

function handleJoin(ws: WebSocket, message: SignalMessage) {
  const { room, peerId } = message

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

function handleSignal(message: SignalMessage) {
  const { room, peerId, targetPeerId, signal } = message
  const roomData = rooms.get(room)
  if (!roomData || !targetPeerId) return

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

function handleLeave(message: SignalMessage) {
  const { room, peerId } = message
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

const PORT = process.env.PORT || 4000
httpServer.listen(PORT, () => {
  console.log(`Signaling server running on port ${PORT}`)
})
```

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
      listen: [
        '/ip4/0.0.0.0/tcp/4001',
        '/ip4/0.0.0.0/tcp/4002/ws'
      ]
    },
    transports: [
      tcp(),
      webSockets()
    ],
    connectionEncrypters: [noise()],
    streamMuxers: [yamux()],
    peerDiscovery: otherBootstrapPeers.length > 0
      ? [bootstrap({ list: otherBootstrapPeers })]
      : [],
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
      listen: [
        '/ip4/0.0.0.0/tcp/4001',
        '/ip4/0.0.0.0/tcp/4002/ws'
      ]
    },
    transports: [
      tcp(),
      webSockets()
    ],
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
- [ ] Deploy to 3 regions (US-West, US-East, Europe)
- [ ] Configure TLS certificates
- [ ] Set up health checks
- [ ] Monitor WebSocket connections
- [ ] Set up auto-scaling

### Bootstrap Nodes
- [ ] Deploy to 3 regions
- [ ] Configure peer IDs (stable across restarts)
- [ ] Add peers to client config
- [ ] Monitor DHT health
- [ ] Set up alerting

### Relay Nodes
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

| Metric | Alert Threshold |
|--------|-----------------|
| Signaling connections | < 1000 available |
| Bootstrap DHT peers | < 100 peers |
| Relay bandwidth | > 80% capacity |
| P99 latency | > 500ms |
| Error rate | > 1% |

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

| Component | Provider | Specs | Monthly Cost |
|-----------|----------|-------|--------------|
| Signaling (x3) | fly.io | shared-cpu-1x, 256MB | $15 |
| Bootstrap (x3) | fly.io | dedicated-cpu-1x, 1GB | $45 |
| Relay (x3) | fly.io | dedicated-cpu-2x, 2GB | $90 |
| **Total** | | | **$150/month** |

*Costs scale with usage. Above estimates for ~10k users.*

## Future: DePIN Storage

For Phase 2+, consider decentralized storage:

- **IPFS Pinning**: Pin snapshots to IPFS
- **Filecoin**: Long-term archival
- **Custom DePIN**: Incentivized storage network

This is deferred until core functionality is stable.

---

**End of planStep01MVP documentation.**

Return to [README.md](./README.md) for the full implementation order.
