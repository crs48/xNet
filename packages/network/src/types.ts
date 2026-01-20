/**
 * Network types for @xnet/network
 */
import type { Libp2p } from 'libp2p'
import type { PeerId } from '@libp2p/interface'

/**
 * Network node wrapping libp2p
 */
export interface NetworkNode {
  libp2p: Libp2p
  peerId: PeerId
  did: string
}

/**
 * Connection status states
 */
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected'

/**
 * Information about a peer
 */
export interface PeerInfo {
  peerId: string
  did?: string
  multiaddrs: string[]
  latency?: number
  lastSeen: number
}

/**
 * Document sync session
 */
export interface SyncSession {
  docId: string
  peers: Set<string>
  status: 'syncing' | 'synced' | 'error'
  lastSync: number
}

/**
 * Sync protocol message
 */
export interface SyncMessage {
  type: 'sync-request' | 'sync-response' | 'update' | 'awareness'
  docId: string
  payload: Uint8Array
  sender: string
  timestamp: number
}

/**
 * Network configuration
 */
export interface NetworkConfig {
  bootstrapPeers: string[]
  signalingServers: string[]
  enableDHT: boolean
  enableRelay: boolean
}

/**
 * Default network configuration
 */
export const DEFAULT_CONFIG: NetworkConfig = {
  bootstrapPeers: [
    // Placeholder - add real bootstrap peers at deployment
  ],
  signalingServers: ['wss://signaling.xnet.io'],
  enableDHT: true,
  enableRelay: true
}
