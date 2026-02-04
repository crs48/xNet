/**
 * DID resolution over the hub network.
 */

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

export interface DIDResolverConfig {
  hubUrl: string
  cacheTtlMs?: number
  getAuthToken?: () => Promise<string>
}

type CacheEntry = {
  record: DIDResolution
  fetchedAt: number
}

const toHubHttpUrl = (hubUrl: string): string =>
  hubUrl.replace('wss://', 'https://').replace('ws://', 'http://')

const fromBase64 = (value: string): Uint8Array => {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(value, 'base64'))
  }
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

const mapLocationsToEndpoints = (locations: PeerLocation[]) =>
  locations.map((location, index) => ({
    type: 'libp2p',
    address: location.multiaddr,
    priority: index
  }))

const mapEndpointsToLocations = (endpoints: Array<{ address: string }>, lastSeen: number) =>
  endpoints.map((endpoint) => ({
    multiaddr: endpoint.address,
    lastSeen
  }))

/**
 * Create a DID resolver for the hub.
 */
export function createDIDResolver(config: DIDResolverConfig): DIDResolver {
  const cache = new Map<string, CacheEntry>()
  const cacheTtlMs = config.cacheTtlMs ?? 60_000

  return {
    async resolve(did: string): Promise<DIDResolution | null> {
      const cached = cache.get(did)
      if (cached && Date.now() - cached.fetchedAt < cacheTtlMs) {
        return cached.record
      }

      try {
        const hubHttpUrl = toHubHttpUrl(config.hubUrl)
        const res = await fetch(`${hubHttpUrl}/dids/${encodeURIComponent(did)}`)
        if (!res.ok) return null

        const record = (await res.json()) as {
          did: string
          publicKeyB64?: string
          endpoints: Array<{ address: string }>
          lastSeen: number
        }

        const resolution: DIDResolution = {
          did: record.did,
          publicKey: record.publicKeyB64 ? fromBase64(record.publicKeyB64) : new Uint8Array(),
          locations: mapEndpointsToLocations(record.endpoints ?? [], record.lastSeen),
          lastUpdated: record.lastSeen
        }

        cache.set(did, { record: resolution, fetchedAt: Date.now() })
        return resolution
      } catch {
        return null
      }
    },

    async publish(did: string, locations: PeerLocation[]): Promise<void> {
      const hubHttpUrl = toHubHttpUrl(config.hubUrl)
      const token = config.getAuthToken ? await config.getAuthToken() : ''

      await fetch(`${hubHttpUrl}/dids/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          did,
          publicKeyB64: '',
          endpoints: mapLocationsToEndpoints(locations)
        })
      })
    },

    getCached(did: string): DIDResolution | null {
      return cache.get(did)?.record ?? null
    },

    clearCache(): void {
      cache.clear()
    }
  }
}
