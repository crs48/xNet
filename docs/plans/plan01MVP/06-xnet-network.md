# 06: @xnet/network

> libp2p networking, WebRTC transport, P2P sync

**Duration:** 3 weeks
**Dependencies:** @xnet/crypto, @xnet/identity, @xnet/data

## Overview

This package handles peer-to-peer networking using libp2p with WebRTC transport for browsers.

## Package Setup

```bash
cd packages/network
pnpm add @libp2p/webrtc @libp2p/websockets @libp2p/bootstrap @libp2p/kad-dht
pnpm add @libp2p/peer-id @chainsafe/libp2p-noise @chainsafe/libp2p-yamux
pnpm add libp2p @multiformats/multiaddr it-pipe uint8arrays
pnpm add y-webrtc
pnpm add -D vitest typescript tsup
pnpm add @xnet/crypto@workspace:* @xnet/identity@workspace:* @xnet/data@workspace:* @xnet/core@workspace:*
```

## Directory Structure

```
packages/network/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts              # Public exports
│   ├── types.ts              # Network types
│   ├── node.ts               # libp2p node setup
│   ├── node.test.ts
│   ├── transports/
│   │   ├── webrtc.ts         # WebRTC transport
│   │   └── websocket.ts      # WebSocket transport
│   ├── protocols/
│   │   ├── sync.ts           # Document sync protocol
│   │   ├── sync.test.ts
│   │   ├── discovery.ts      # Peer discovery
│   │   └── messages.ts       # Protocol messages
│   ├── providers/
│   │   ├── ywebrtc.ts        # y-webrtc integration
│   │   └── custom.ts         # Custom sync provider
│   └── resolution/
│       ├── did.ts            # DID resolution
│       └── dht.ts            # DHT integration
└── README.md
```

## Implementation

### Types (types.ts)

```typescript
import type { Libp2p } from 'libp2p'
import type { PeerId } from '@libp2p/interface'
import type { SignedUpdate } from '@xnet/core'
import type { XDocument } from '@xnet/data'

export interface NetworkNode {
  libp2p: Libp2p
  peerId: PeerId
  did: string
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected'

export interface PeerInfo {
  peerId: string
  did?: string
  multiaddrs: string[]
  latency?: number
  lastSeen: number
}

export interface SyncSession {
  docId: string
  peers: Set<string>
  status: 'syncing' | 'synced' | 'error'
  lastSync: number
}

export interface SyncMessage {
  type: 'sync-request' | 'sync-response' | 'update' | 'awareness'
  docId: string
  payload: Uint8Array
  sender: string
  timestamp: number
}

export interface NetworkConfig {
  bootstrapPeers: string[]
  signalingServers: string[]
  enableDHT: boolean
  enableRelay: boolean
}

export const DEFAULT_CONFIG: NetworkConfig = {
  bootstrapPeers: [
    // Placeholder - add real bootstrap peers at deployment
  ],
  signalingServers: ['wss://signaling.xnet.io'],
  enableDHT: true,
  enableRelay: true
}
```

### Node Setup (node.ts)

```typescript
import { createLibp2p, type Libp2p } from 'libp2p'
import { webRTC } from '@libp2p/webrtc'
import { webSockets } from '@libp2p/websockets'
import { bootstrap } from '@libp2p/bootstrap'
import { kadDHT } from '@libp2p/kad-dht'
import { noise } from '@chainsafe/libp2p-noise'
import { yamux } from '@chainsafe/libp2p-yamux'
import { circuitRelayTransport } from '@libp2p/circuit-relay-v2'
import type { NetworkNode, NetworkConfig } from './types'
import { DEFAULT_CONFIG } from './types'

export interface CreateNodeOptions {
  did: string
  privateKey: Uint8Array
  config?: Partial<NetworkConfig>
}

export async function createNode(options: CreateNodeOptions): Promise<NetworkNode> {
  const config = { ...DEFAULT_CONFIG, ...options.config }

  const libp2p = await createLibp2p({
    transports: [webRTC(), webSockets(), circuitRelayTransport()],
    connectionEncrypters: [noise()],
    streamMuxers: [yamux()],
    peerDiscovery:
      config.bootstrapPeers.length > 0 ? [bootstrap({ list: config.bootstrapPeers })] : [],
    services: {
      dht: config.enableDHT ? kadDHT() : undefined
    }
  })

  await libp2p.start()

  return {
    libp2p,
    peerId: libp2p.peerId,
    did: options.did
  }
}

export async function stopNode(node: NetworkNode): Promise<void> {
  await node.libp2p.stop()
}

export function getConnectedPeers(node: NetworkNode): string[] {
  return node.libp2p.getPeers().map((p) => p.toString())
}

export async function connectToPeer(node: NetworkNode, multiaddr: string): Promise<void> {
  const ma = multiaddr
  await node.libp2p.dial(ma as any)
}

export function onPeerConnect(node: NetworkNode, callback: (peerId: string) => void): () => void {
  const handler = (event: any) => {
    callback(event.detail.toString())
  }
  node.libp2p.addEventListener('peer:connect', handler)
  return () => node.libp2p.removeEventListener('peer:connect', handler)
}

export function onPeerDisconnect(
  node: NetworkNode,
  callback: (peerId: string) => void
): () => void {
  const handler = (event: any) => {
    callback(event.detail.toString())
  }
  node.libp2p.addEventListener('peer:disconnect', handler)
  return () => node.libp2p.removeEventListener('peer:disconnect', handler)
}
```

### Sync Protocol (protocols/sync.ts)

```typescript
import { pipe } from 'it-pipe'
import * as lp from 'it-length-prefixed'
import { encode, decode } from '@msgpack/msgpack'
import type { NetworkNode, SyncMessage } from '../types'
import type { SignedUpdate } from '@xnet/core'
import type { XDocument } from '@xnet/data'
import { getDocumentState, getStateVector, applySignedUpdate } from '@xnet/data'
import * as Y from 'yjs'

const SYNC_PROTOCOL = '/xnet/sync/1.0.0'

export interface SyncProtocol {
  /** Register document for sync */
  register(doc: XDocument): void

  /** Unregister document */
  unregister(docId: string): void

  /** Request sync with peer */
  requestSync(docId: string, peerId: string): Promise<void>

  /** Handle incoming sync messages */
  onMessage(callback: (msg: SyncMessage) => void): () => void
}

export function createSyncProtocol(node: NetworkNode): SyncProtocol {
  const documents = new Map<string, XDocument>()
  const messageCallbacks = new Set<(msg: SyncMessage) => void>()

  // Handle incoming streams
  node.libp2p.handle(SYNC_PROTOCOL, async ({ stream, connection }) => {
    const peerId = connection.remotePeer.toString()

    await pipe(
      stream.source,
      lp.decode,
      async function* (source) {
        for await (const data of source) {
          const msg = decode(data.subarray()) as SyncMessage

          // Notify callbacks
          messageCallbacks.forEach((cb) => cb(msg))

          // Handle sync request
          if (msg.type === 'sync-request') {
            const doc = documents.get(msg.docId)
            if (doc) {
              const state = getDocumentState(doc)
              yield encode({
                type: 'sync-response',
                docId: msg.docId,
                payload: state,
                sender: node.did,
                timestamp: Date.now()
              } satisfies SyncMessage)
            }
          }
        }
      },
      lp.encode,
      stream.sink
    )
  })

  return {
    register(doc: XDocument): void {
      documents.set(doc.id, doc)
    },

    unregister(docId: string): void {
      documents.delete(docId)
    },

    async requestSync(docId: string, peerId: string): Promise<void> {
      const doc = documents.get(docId)
      if (!doc) throw new Error(`Document ${docId} not registered`)

      const stream = await node.libp2p.dialProtocol(peerId as any, SYNC_PROTOCOL)

      const stateVector = getStateVector(doc)

      await pipe(
        [
          encode({
            type: 'sync-request',
            docId,
            payload: stateVector,
            sender: node.did,
            timestamp: Date.now()
          } satisfies SyncMessage)
        ],
        lp.encode,
        stream.sink
      )

      // Read response
      await pipe(stream.source, lp.decode, async function (source) {
        for await (const data of source) {
          const msg = decode(data.subarray()) as SyncMessage
          if (msg.type === 'sync-response') {
            Y.applyUpdate(doc.ydoc, msg.payload)
          }
        }
      })
    },

    onMessage(callback: (msg: SyncMessage) => void): () => void {
      messageCallbacks.add(callback)
      return () => messageCallbacks.delete(callback)
    }
  }
}
```

### y-webrtc Integration (providers/ywebrtc.ts)

```typescript
import { WebrtcProvider } from 'y-webrtc'
import type { XDocument } from '@xnet/data'

export interface YWebRTCOptions {
  signalingServers: string[]
  password?: string
  maxConns?: number
}

export interface YWebRTCProvider {
  provider: WebrtcProvider
  destroy: () => void
}

export function createYWebRTCProvider(
  doc: XDocument,
  roomName: string,
  options: YWebRTCOptions
): YWebRTCProvider {
  const provider = new WebrtcProvider(roomName, doc.ydoc, {
    signaling: options.signalingServers,
    password: options.password,
    maxConns: options.maxConns ?? 20
  })

  return {
    provider,
    destroy: () => provider.destroy()
  }
}

export function getConnectedPeers(provider: YWebRTCProvider): number {
  return provider.provider.connected ? 1 : 0 // Simplified
}

export function onPeersChange(
  provider: YWebRTCProvider,
  callback: (peers: string[]) => void
): () => void {
  const handler = () => {
    // Would get actual peer list
    callback([])
  }
  provider.provider.on('peers', handler)
  return () => provider.provider.off('peers', handler)
}
```

### DID Resolution (resolution/did.ts)

```typescript
import type { NetworkNode, PeerInfo } from '../types'
import type { DIDResolution, ResolutionStrategy, PeerLocation } from '@xnet/core'

export interface DIDResolver {
  resolve(did: string): Promise<DIDResolution | null>
  publish(did: string, locations: PeerLocation[]): Promise<void>
  getCached(did: string): DIDResolution | null
}

export function createDIDResolver(node: NetworkNode): DIDResolver {
  const cache = new Map<string, DIDResolution>()

  return {
    async resolve(did: string): Promise<DIDResolution | null> {
      // Check cache first
      const cached = cache.get(did)
      if (cached && Date.now() - cached.lastUpdated < 60000) {
        return cached
      }

      // Try connected peers
      const peers = node.libp2p.getPeers()
      for (const peer of peers) {
        // Would query peer for DID info
        // Simplified: return null for now
      }

      // Try DHT
      // const dht = node.libp2p.services.dht
      // Would query DHT

      return null
    },

    async publish(did: string, locations: PeerLocation[]): Promise<void> {
      // Publish to DHT
      // const dht = node.libp2p.services.dht
      // Would put to DHT

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
    }
  }
}
```

### Tests (node.test.ts)

```typescript
import { describe, it, expect, afterEach } from 'vitest'
import { createNode, stopNode, getConnectedPeers } from './node'
import { generateIdentity } from '@xnet/identity'

describe('NetworkNode', () => {
  const nodes: any[] = []

  afterEach(async () => {
    for (const node of nodes) {
      await stopNode(node)
    }
    nodes.length = 0
  })

  it('should create node', async () => {
    const { identity, privateKey } = generateIdentity()
    const node = await createNode({
      did: identity.did,
      privateKey,
      config: { bootstrapPeers: [], enableDHT: false, signalingServers: [], enableRelay: false }
    })
    nodes.push(node)

    expect(node.peerId).toBeDefined()
    expect(node.did).toBe(identity.did)
  })

  it('should report no connected peers initially', async () => {
    const { identity, privateKey } = generateIdentity()
    const node = await createNode({
      did: identity.did,
      privateKey,
      config: { bootstrapPeers: [], enableDHT: false, signalingServers: [], enableRelay: false }
    })
    nodes.push(node)

    const peers = getConnectedPeers(node)
    expect(peers).toHaveLength(0)
  })
})
```

### Public Exports (index.ts)

```typescript
// Types
export type {
  NetworkNode,
  ConnectionStatus,
  PeerInfo,
  SyncSession,
  SyncMessage,
  NetworkConfig
} from './types'
export { DEFAULT_CONFIG } from './types'

// Node operations
export {
  createNode,
  stopNode,
  getConnectedPeers,
  connectToPeer,
  onPeerConnect,
  onPeerDisconnect,
  type CreateNodeOptions
} from './node'

// Sync protocol
export { createSyncProtocol, type SyncProtocol } from './protocols/sync'

// y-webrtc provider
export {
  createYWebRTCProvider,
  getConnectedPeers as getYWebRTCPeers,
  onPeersChange,
  type YWebRTCOptions,
  type YWebRTCProvider
} from './providers/ywebrtc'

// DID resolution
export { createDIDResolver, type DIDResolver } from './resolution/did'
```

## Validation Checklist

- [ ] Node starts and stops cleanly
- [ ] Peer connection events fire correctly
- [ ] Sync protocol exchanges state
- [ ] y-webrtc provider connects
- [ ] DID resolver uses cache
- [ ] All tests pass

## Next Step

Proceed to [07-xnet-query.md](./07-xnet-query.md)
