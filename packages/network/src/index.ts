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

// Security
export {
  // Limits
  type ConnectionLimits,
  DEFAULT_LIMITS,
  STRICT_LIMITS,
  RELAXED_LIMITS,
  // Tracker
  type ConnectionInfo,
  type ConnectionStats,
  ConnectionTracker,
  // Gater
  type ConnectionGater,
  DefaultConnectionGater,
  // Rate limiter
  TokenBucket,
  SyncRateLimiter,
  ProtocolRateLimiter,
  // Logging
  type SecurityEventType,
  type SecuritySeverity,
  type SecurityAction,
  type SecurityEventData,
  type SecurityLoggerConfig,
  SecurityLogger,
  getSecurityLogger,
  configureSecurityLogger,
  logSecurityEvent,
  // Peer Scorer
  type PeerMetrics,
  type PeerScore,
  type ScoreThresholds,
  type ScoreWeights,
  PeerScorer,
  DEFAULT_THRESHOLDS,
  DEFAULT_WEIGHTS,
  // Auto Blocker
  type BlockInfo,
  type BlockThresholds,
  AutoBlocker,
  DEFAULT_BLOCK_THRESHOLDS,
  // Access List
  type DenyEntry,
  type AllowEntry,
  type WorkspaceAccessConfig,
  PeerAccessControl
} from './security'
