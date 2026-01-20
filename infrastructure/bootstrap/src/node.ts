/**
 * xNet Bootstrap Node
 *
 * libp2p node for initial peer discovery using Kademlia DHT.
 * Clients connect to bootstrap nodes to discover other peers.
 */
import { createLibp2p } from 'libp2p'
import { tcp } from '@libp2p/tcp'
import { webSockets } from '@libp2p/websockets'
import { noise } from '@chainsafe/libp2p-noise'
import { yamux } from '@chainsafe/libp2p-yamux'
import { kadDHT } from '@libp2p/kad-dht'
import { bootstrap } from '@libp2p/bootstrap'
import { identify } from '@libp2p/identify'
import { createServer, IncomingMessage, ServerResponse } from 'http'

// Health check HTTP server
const healthServer = createServer((req: IncomingMessage, res: ServerResponse) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      status: 'healthy',
      uptime: process.uptime(),
      peerId: node?.peerId?.toString() || 'starting',
      peers: node?.getPeers()?.length || 0,
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

let node: Awaited<ReturnType<typeof createLibp2p>> | null = null

async function main() {
  // Get other bootstrap peers from environment
  const otherBootstrapPeers = process.env.BOOTSTRAP_PEERS?.split(',').filter(Boolean) || []

  console.log('Starting xNet Bootstrap Node...')
  if (otherBootstrapPeers.length > 0) {
    console.log('Bootstrap peers:', otherBootstrapPeers)
  }

  node = await createLibp2p({
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

  // Start health check server
  const healthPort = parseInt(process.env.HEALTH_PORT || '4003', 10)
  healthServer.listen(healthPort, () => {
    console.log(`Health check server running on port ${healthPort}`)
  })
}

/**
 * Get Prometheus-format metrics
 */
function getPrometheusMetrics(): string {
  const peers = node?.getPeers()?.length || 0
  return `
# HELP xnet_bootstrap_peers_total Total number of connected peers
# TYPE xnet_bootstrap_peers_total gauge
xnet_bootstrap_peers_total ${peers}

# HELP xnet_bootstrap_uptime_seconds Node uptime in seconds
# TYPE xnet_bootstrap_uptime_seconds gauge
xnet_bootstrap_uptime_seconds ${process.uptime()}
`.trim()
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, shutting down gracefully...')
  await node?.stop()
  healthServer.close(() => {
    console.log('Node stopped')
    process.exit(0)
  })
})

main().catch((err) => {
  console.error('Failed to start bootstrap node:', err)
  process.exit(1)
})
