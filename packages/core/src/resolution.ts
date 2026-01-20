/**
 * DID resolution types for xNet peer discovery
 */

/**
 * Location of a peer on the network
 */
export interface PeerLocation {
  multiaddr: string // e.g., '/ip4/1.2.3.4/tcp/4001/p2p/12D3...'
  lastSeen: number
  latency?: number
}

/**
 * Result of resolving a DID
 */
export interface DIDResolution {
  did: string
  publicKey: Uint8Array
  locations: PeerLocation[]
  lastUpdated: number
}

/**
 * Strategy for resolving DIDs
 */
export type ResolutionStrategy = 'local-cache' | 'connected-peers' | 'dht' | 'bootstrap'

/**
 * Interface for DID resolution
 */
export interface DIDResolver {
  /** Resolve DID to locations and public key */
  resolve(did: string): Promise<DIDResolution | null>

  /** Publish own location */
  publish(did: string, locations: PeerLocation[]): Promise<void>

  /** Check cache without network */
  getCached(did: string): DIDResolution | null
}

/**
 * Bootstrap peers for initial network discovery
 */
export const BOOTSTRAP_PEERS = [
  '/dns4/bootstrap1.xnet.io/tcp/4001/p2p/12D3KooWBootstrap1',
  '/dns4/bootstrap2.xnet.io/tcp/4001/p2p/12D3KooWBootstrap2'
  // Real peers added at deployment
] as const

/**
 * DHT configuration for peer discovery
 */
export const DHT_CONFIG = {
  protocol: '/xnet/kad/1.0.0',
  replicationFactor: 20,
  refreshInterval: 60 * 60 * 1000 // 1 hour
} as const

/**
 * Resolution cache configuration
 */
export const RESOLUTION_CACHE_CONFIG = {
  maxEntries: 1000,
  ttl: 5 * 60 * 1000, // 5 minutes
  staleWhileRevalidate: 60 * 60 * 1000 // 1 hour
} as const

/**
 * Parse a DID to extract the method and identifier
 */
export function parseDID(did: string): { method: string; identifier: string } | null {
  const match = did.match(/^did:([a-z]+):(.+)$/)
  if (!match) return null
  return { method: match[1], identifier: match[2] }
}

/**
 * Check if a DID is valid
 */
export function isValidDID(did: string): boolean {
  return parseDID(did) !== null
}

/**
 * Check if a location is still considered fresh
 */
export function isLocationFresh(location: PeerLocation, maxAge: number = 5 * 60 * 1000): boolean {
  return Date.now() - location.lastSeen < maxAge
}
