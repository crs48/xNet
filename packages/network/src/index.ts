/**
 * @xnet/network - libp2p networking, WebRTC transport, P2P sync
 */

// Types
export type {
  NetworkNode,
  ConnectionStatus,
  PeerInfo,
  SyncSession,
  SyncMessage,
  NetworkConfig
} from './types'
export { DEFAULT_CONFIG, PRODUCTION_CONFIG, DEVELOPMENT_CONFIG } from './types'

// Node operations
export {
  createNode,
  stopNode,
  getConnectedPeers,
  connectToPeer,
  onPeerConnect,
  onPeerDisconnect,
  getMultiaddrs,
  isStarted,
  type CreateNodeOptions
} from './node'

// Sync protocol
export { createSyncProtocol, type SyncProtocol } from './protocols/sync'

// y-webrtc provider
export {
  createYWebRTCProvider,
  getConnectedPeers as getYWebRTCPeers,
  onPeersChange,
  isConnected,
  type YWebRTCOptions,
  type YWebRTCProvider
} from './providers/ywebrtc'

// DID resolution
export { createDIDResolver, type DIDResolver } from './resolution/did'
