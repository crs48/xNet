/**
 * Network types for @xnet/network
 */
import type { PeerId } from '@libp2p/interface'
import type { Libp2p } from 'libp2p'

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
 * Demo mode limits (sent from hub in handshake)
 */
export interface DemoLimits {
  quotaBytes: number
  maxDocs: number
  maxBlobBytes: number
  evictionTtlMs: number
}

/**
 * Hub handshake message
 */
export interface HubHandshake {
  type: 'handshake'
  /** Package version (e.g., '0.5.0') */
  version: string
  /** Sync protocol version (e.g., 1) */
  protocolVersion?: number
  /** Minimum supported protocol version */
  minProtocolVersion?: number
  /** Feature flags supported by this hub */
  features?: string[]
  hubDid?: string
  isDemo: boolean
  demoLimits?: DemoLimits
}

/**
 * Client handshake message (sent after receiving hub handshake)
 */
export interface ClientHandshake {
  type: 'client-handshake'
  /** Client's DID */
  did: string
  /** Sync protocol version */
  protocolVersion: number
  /** Minimum supported protocol version */
  minProtocolVersion: number
  /** Feature flags supported by this client */
  features: string[]
  /** Package version */
  packageVersion: string
}

/**
 * Version mismatch error response
 */
export interface VersionMismatchError {
  type: 'version-mismatch'
  hubVersion: number
  clientVersion: number
  suggestion: 'upgrade-client' | 'upgrade-hub' | 'incompatible'
  message: string
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
 * Production network configuration
 *
 * Use these settings for deployed applications.
 */
export const PRODUCTION_CONFIG: NetworkConfig = {
  signalingServers: [
    'wss://signal-us-west.xnet.io',
    'wss://signal-us-east.xnet.io',
    'wss://signal-eu.xnet.io'
  ],
  bootstrapPeers: [
    // Add peer IDs after deploying bootstrap nodes
    // '/dns4/bootstrap-us-west.xnet.io/tcp/4001/p2p/12D3KooW...',
    // '/dns4/bootstrap-us-east.xnet.io/tcp/4001/p2p/12D3KooW...',
    // '/dns4/bootstrap-eu.xnet.io/tcp/4001/p2p/12D3KooW...'
  ],
  enableDHT: true,
  enableRelay: true
}

/**
 * Development network configuration
 *
 * Use these settings for local development.
 */
export const DEVELOPMENT_CONFIG: NetworkConfig = {
  signalingServers: ['ws://localhost:4000'],
  bootstrapPeers: [],
  enableDHT: false,
  enableRelay: false
}

/**
 * Default network configuration
 *
 * Uses development config in development, production config otherwise.
 */
export const DEFAULT_CONFIG: NetworkConfig =
  process.env.NODE_ENV === 'production' ? PRODUCTION_CONFIG : DEVELOPMENT_CONFIG
