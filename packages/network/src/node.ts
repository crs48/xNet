/**
 * libp2p node setup and management
 */
import { createLibp2p } from 'libp2p'
import { webRTC } from '@libp2p/webrtc'
import { webSockets } from '@libp2p/websockets'
import { bootstrap } from '@libp2p/bootstrap'
import { kadDHT } from '@libp2p/kad-dht'
import { noise } from '@chainsafe/libp2p-noise'
import { yamux } from '@chainsafe/libp2p-yamux'
import { circuitRelayTransport } from '@libp2p/circuit-relay-v2'
import { identify } from '@libp2p/identify'
import type { NetworkNode, NetworkConfig } from './types'
import { DEFAULT_CONFIG } from './types'

/**
 * Options for creating a network node
 */
export interface CreateNodeOptions {
  did: string
  privateKey: Uint8Array
  config?: Partial<NetworkConfig>
}

/**
 * Create a new libp2p network node
 */
export async function createNode(options: CreateNodeOptions): Promise<NetworkNode> {
  const config = { ...DEFAULT_CONFIG, ...options.config }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const services: any = {
    identify: identify()
  }
  if (config.enableDHT) {
    services.dht = kadDHT()
  }

  const libp2p = await createLibp2p({
    transports: [webRTC(), webSockets(), circuitRelayTransport()],
    connectionEncrypters: [noise()],
    streamMuxers: [yamux()],
    peerDiscovery:
      config.bootstrapPeers.length > 0 ? [bootstrap({ list: config.bootstrapPeers })] : [],
    services
  })

  await libp2p.start()

  return {
    libp2p,
    peerId: libp2p.peerId,
    did: options.did
  }
}

/**
 * Stop and cleanup a network node
 */
export async function stopNode(node: NetworkNode): Promise<void> {
  await node.libp2p.stop()
}

/**
 * Get list of connected peer IDs
 */
export function getConnectedPeers(node: NetworkNode): string[] {
  return node.libp2p.getPeers().map((p) => p.toString())
}

/**
 * Connect to a peer by multiaddr
 */
export async function connectToPeer(node: NetworkNode, multiaddr: string): Promise<void> {
  await node.libp2p.dial(multiaddr as unknown as Parameters<typeof node.libp2p.dial>[0])
}

/**
 * Subscribe to peer connection events
 */
export function onPeerConnect(node: NetworkNode, callback: (peerId: string) => void): () => void {
  const handler = (event: CustomEvent) => {
    callback(event.detail.toString())
  }
  node.libp2p.addEventListener('peer:connect', handler as EventListener)
  return () => node.libp2p.removeEventListener('peer:connect', handler as EventListener)
}

/**
 * Subscribe to peer disconnection events
 */
export function onPeerDisconnect(
  node: NetworkNode,
  callback: (peerId: string) => void
): () => void {
  const handler = (event: CustomEvent) => {
    callback(event.detail.toString())
  }
  node.libp2p.addEventListener('peer:disconnect', handler as EventListener)
  return () => node.libp2p.removeEventListener('peer:disconnect', handler as EventListener)
}

/**
 * Get multiaddrs for this node
 */
export function getMultiaddrs(node: NetworkNode): string[] {
  return node.libp2p.getMultiaddrs().map((ma) => ma.toString())
}

/**
 * Check if node is started
 */
export function isStarted(node: NetworkNode): boolean {
  return node.libp2p.status === 'started'
}
