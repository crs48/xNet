# @xnet/network

P2P networking with libp2p and WebRTC.

## Installation

```bash
pnpm add @xnet/network
```

## Usage

```typescript
import { createNode } from '@xnet/network'

// Create network node
const node = await createNode({
  did: identity.did,
  privateKey: keyBundle.signingKey
})

// Start networking
await node.libp2p.start()

// Connect to peer
await node.libp2p.dial(peerMultiaddr)
```

## Features

- libp2p for P2P networking
- WebRTC for browser connectivity
- CRDT sync protocol
- Peer discovery
