/**
 * DID resolution over the network
 */
import type { NetworkNode } from '../types'
import type { DIDResolution, PeerLocation } from '@xnet/core'

/**
 * DID resolver interface
 */
export interface DIDResolver {
  resolve(did: string): Promise<DIDResolution | null>
  publish(did: string, locations: PeerLocation[]): Promise<void>
  getCached(did: string): DIDResolution | null
  clearCache(): void
}

/**
 * Create a DID resolver for the network
 */
export function createDIDResolver(node: NetworkNode): DIDResolver {
  const cache = new Map<string, DIDResolution>()
  const CACHE_TTL = 60000 // 1 minute

  return {
    async resolve(did: string): Promise<DIDResolution | null> {
      // Check cache first
      const cached = cache.get(did)
      if (cached && Date.now() - cached.lastUpdated < CACHE_TTL) {
        return cached
      }

      // Try connected peers
      const peers = node.libp2p.getPeers()
      for (const _peer of peers) {
        // Would query peer for DID info via a resolution protocol
        // Simplified: return null for now
      }

      // Try DHT if available
      // const dht = node.libp2p.services.dht
      // Would query DHT for DID resolution record

      return null
    },

    async publish(did: string, locations: PeerLocation[]): Promise<void> {
      // Publish to DHT
      // const dht = node.libp2p.services.dht
      // Would put resolution record to DHT

      // Update local cache
      const resolution: DIDResolution = {
        did,
        publicKey: new Uint8Array(), // Would include actual key
        locations,
        lastUpdated: Date.now()
      }
      cache.set(did, resolution)
    },

    getCached(did: string): DIDResolution | null {
      return cache.get(did) ?? null
    },

    clearCache(): void {
      cache.clear()
    }
  }
}
