# 01: xNet Core Platform

> The foundational SDK and infrastructure for decentralized applications

[← Back to Plan Overview](./README.md)

---

## Overview

xNet is the foundational infrastructure that powers xNotes and future decentralized applications. It must be developed **in parallel** with xNotes, with xNotes serving as the primary driver and validator of xNet's capabilities.

---

## Platform Architecture

```mermaid
graph LR
    subgraph "Application Layer"
        A1[xNotes]
        A2[Future Apps]
    end

    subgraph "xNet SDK Layer"
        S1["@xnet/sdk<br/>(Unified API)"]
    end

    subgraph "Core Modules"
        C1["@xnet/data<br/>CRDT Engine"]
        C2["@xnet/network<br/>P2P Networking"]
        C3["@xnet/identity<br/>DID/SSI"]
        C4["@xnet/storage<br/>Persistence"]
        C5["@xnet/crypto<br/>Encryption"]
        C6["@xnet/query<br/>Query Engine"]
    end

    subgraph "Transport Layer"
        T1[libp2p]
        T2[WebRTC]
        T3[WebSocket]
    end

    subgraph "Storage Backends"
        B1[IndexedDB]
        B2[File System]
        B3[DePIN Network]
    end

    A1 --> S1
    A2 --> S1
    S1 --> C1
    S1 --> C2
    S1 --> C3
    S1 --> C4
    S1 --> C5
    S1 --> C6
    C2 --> T1
    C2 --> T2
    C2 --> T3
    C4 --> B1
    C4 --> B2
    C4 --> B3
```

---

## Package Structure

```
xnet/
├── packages/
│   ├── sdk/                      # @xnet/sdk - Unified API
│   │   ├── src/
│   │   │   ├── client.ts         # Main XNet client
│   │   │   ├── workspace.ts      # Workspace management
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── data/                     # @xnet/data - CRDT & Data Model
│   │   ├── src/
│   │   │   ├── document.ts       # CRDT document wrapper
│   │   │   ├── schema.ts         # JSON-LD schema definitions
│   │   │   ├── types.ts          # Block types (Page, Task, etc.)
│   │   │   ├── operations.ts     # CRDT operations
│   │   │   └── validation.ts     # Schema validation
│   │   └── package.json
│   │
│   ├── network/                  # @xnet/network - P2P Layer
│   │   ├── src/
│   │   │   ├── node.ts           # libp2p node setup
│   │   │   ├── protocols/        # Custom protocols
│   │   │   │   ├── sync.ts       # Document sync protocol
│   │   │   │   ├── presence.ts   # Presence/awareness
│   │   │   │   └── discovery.ts  # Peer discovery
│   │   │   ├── transports/       # Transport adapters
│   │   │   │   ├── webrtc.ts
│   │   │   │   ├── websocket.ts
│   │   │   │   └── webtransport.ts
│   │   │   └── relay.ts          # Relay node support
│   │   └── package.json
│   │
│   ├── identity/                 # @xnet/identity - DID/Auth
│   │   ├── src/
│   │   │   ├── did.ts            # DID generation/resolution
│   │   │   ├── keys.ts           # Key management
│   │   │   ├── ucan.ts           # UCAN tokens
│   │   │   ├── session.ts        # Session management
│   │   │   └── recovery.ts       # Key recovery
│   │   └── package.json
│   │
│   ├── storage/                  # @xnet/storage - Persistence
│   │   ├── src/
│   │   │   ├── adapters/
│   │   │   │   ├── indexeddb.ts  # Browser storage
│   │   │   │   ├── sqlite.ts     # Desktop/mobile
│   │   │   │   └── memory.ts     # Testing
│   │   │   ├── blob.ts           # Binary blob storage
│   │   │   ├── backup.ts         # Export/import
│   │   │   └── sync.ts           # Storage sync
│   │   └── package.json
│   │
│   ├── crypto/                   # @xnet/crypto - Security
│   │   ├── src/
│   │   │   ├── symmetric.ts      # AES-GCM encryption
│   │   │   ├── asymmetric.ts     # X25519/Ed25519
│   │   │   ├── signing.ts        # Digital signatures
│   │   │   ├── hashing.ts        # Content addressing
│   │   │   └── zk.ts             # zk-SNARK helpers (future)
│   │   └── package.json
│   │
│   ├── query/                    # @xnet/query - Query Engine
│   │   ├── src/
│   │   │   ├── parser.ts         # SQL-like query parser
│   │   │   ├── executor.ts       # Local query execution
│   │   │   ├── federation.ts     # Distributed queries
│   │   │   ├── indexing.ts       # Index management
│   │   │   └── fulltext.ts       # Full-text search
│   │   └── package.json
│   │
│   └── vectors/                  # @xnet/vectors - AI/Embeddings
│       ├── src/
│       │   ├── index.ts          # HNSW vector index
│       │   ├── embeddings.ts     # On-device embeddings
│       │   └── similarity.ts     # Similarity search
│       └── package.json
│
├── infrastructure/
│   ├── signaling-server/         # WebRTC signaling
│   ├── relay-node/               # libp2p relay
│   ├── bootstrap-node/           # DHT bootstrap
│   └── storage-node/             # DePIN storage node
│
└── tools/
    ├── cli/                      # xnet CLI tool
    └── devtools/                 # Browser devtools extension
```

---

## Core Module Specifications

### @xnet/data - CRDT Engine

The data layer manages all document state using CRDTs for conflict-free synchronization.

```mermaid
classDiagram
    class XNetDocument {
        +string id
        +string workspaceId
        +YDoc ydoc
        +Map~string,Block~ blocks
        +create(type, data) Block
        +update(id, changes) void
        +delete(id) void
        +query(filter) Block[]
        +subscribe(callback) Unsubscribe
    }

    class Block {
        +string id
        +string type
        +string parentId
        +string[] childIds
        +any content
        +Permissions permissions
        +number version
        +toJSON() object
    }

    class Schema {
        +validate(block) boolean
        +getType(name) TypeDefinition
        +register(type) void
    }

    class SyncEngine {
        +sync(doc, peers) void
        +merge(local, remote) void
        +getStateVector() Uint8Array
        +applyUpdate(update) void
    }

    XNetDocument --> Block
    XNetDocument --> Schema
    XNetDocument --> SyncEngine
```

**Key Responsibilities:**
- CRDT document lifecycle management
- JSON-LD schema validation
- Block hierarchy and relationships
- Change subscription and notifications

---

### @xnet/network - P2P Layer

Handles all peer-to-peer communication using libp2p and WebRTC.

```mermaid
sequenceDiagram
    participant A as Peer A
    participant S as Signaling Server
    participant B as Peer B

    A->>S: Register (PeerID, WorkspaceID)
    B->>S: Register (PeerID, WorkspaceID)
    S->>A: Peer discovered: B
    S->>B: Peer discovered: A

    A->>S: SDP Offer for B
    S->>B: Forward SDP Offer
    B->>S: SDP Answer for A
    S->>A: Forward SDP Answer

    A->>B: ICE Candidates (direct)
    B->>A: ICE Candidates (direct)

    Note over A,B: WebRTC Connection Established

    A->>B: Sync Request (StateVector)
    B->>A: Sync Response (Updates)
    A->>B: Awareness Update (Cursor, Presence)
    B->>A: Awareness Update (Cursor, Presence)

    Note over A,B: Real-time Collaboration Active
```

**Key Responsibilities:**
- Peer discovery and connection management
- Document synchronization protocol
- Presence and awareness (cursors, online status)
- NAT traversal and relay fallback

---

### @xnet/identity - Self-Sovereign Identity

Manages decentralized identity using DIDs and UCAN tokens.

```mermaid
flowchart TD
    subgraph "Key Generation"
        A[Generate Ed25519 Keypair] --> B[Derive DID:key]
        B --> C[Store in Secure Storage]
    end

    subgraph "Authentication"
        D[Create Challenge] --> E[Sign with Private Key]
        E --> F[Verify Signature]
        F --> G{Valid?}
        G -->|Yes| H[Issue UCAN Token]
        G -->|No| I[Reject]
    end

    subgraph "Authorization (UCAN)"
        H --> J[Encode Capabilities]
        J --> K[Set Expiration]
        K --> L[Sign Token]
        L --> M[Delegate to Peer]
    end

    subgraph "Key Recovery"
        N[Social Recovery] --> O[Shamir Secret Sharing]
        P[Mnemonic Backup] --> Q[BIP39 Seed Phrase]
    end

    C --> D
    M --> R[Access Resource]
```

**Key Responsibilities:**
- DID generation and resolution (did:key method)
- Key pair management and secure storage
- UCAN token creation and verification
- Key recovery mechanisms

---

### @xnet/storage - Persistence

Provides durable storage across platforms with multiple backend adapters.

| Backend | Platform | Durability | Use Case |
|---------|----------|------------|----------|
| SQLite | Desktop/Mobile | High | Primary storage |
| OPFS | Web (Modern) | Medium | Better than IndexedDB |
| IndexedDB | Web (Legacy) | Low | Fallback |
| Memory | Testing | None | Unit tests |

**See also:** [Persistence Architecture](../PERSISTENCE_ARCHITECTURE.md)

---

### @xnet/crypto - Encryption

Handles all cryptographic operations for security.

| Operation | Algorithm | Use Case |
|-----------|-----------|----------|
| Symmetric Encryption | AES-256-GCM | Document content |
| Asymmetric Encryption | X25519 | Key exchange |
| Digital Signatures | Ed25519 | Authentication |
| Hashing | BLAKE3 | Content addressing |
| Key Derivation | Argon2id | Password-based keys |

---

### @xnet/query - Query Engine

SQL-like query interface over CRDT documents.

**Supported Operations:**
- Filter by property values
- Full-text search
- Sorting and pagination
- Aggregate functions
- Federated queries across peers (future)

---

### @xnet/vectors - AI/Embeddings

On-device vector search for semantic capabilities.

| Feature | Implementation |
|---------|----------------|
| Vector Index | HNSW algorithm |
| Embeddings | TensorFlow.js / MiniLM |
| Similarity | Cosine distance |

---

## Infrastructure Components

```mermaid
graph TB
    subgraph "User Devices"
        U1[Browser PWA]
        U2[Desktop App]
        U3[Mobile App]
    end

    subgraph "Signaling Layer"
        S1[Signaling Server 1]
        S2[Signaling Server 2]
        S3[Signaling Server N]
    end

    subgraph "Relay Layer"
        R1[Relay Node 1]
        R2[Relay Node 2]
        R3[Relay Node N]
    end

    subgraph "Bootstrap Layer"
        B1[Bootstrap Node 1]
        B2[Bootstrap Node 2]
    end

    subgraph "Storage Layer (DePIN)"
        D1[Storage Node 1]
        D2[Storage Node 2]
        D3[Storage Node N]
    end

    U1 <--> S1
    U2 <--> S2
    U3 <--> S3

    U1 <-.-> R1
    U2 <-.-> R2

    U1 --> B1
    U2 --> B2

    U1 -.-> D1
    U2 -.-> D2
    U3 -.-> D3

    S1 <--> S2
    S2 <--> S3
    R1 <--> R2
    R2 <--> R3
    D1 <--> D2
    D2 <--> D3
```

### Component Descriptions

| Component | Purpose | Technology |
|-----------|---------|------------|
| **Signaling Server** | WebRTC connection establishment | Node.js + WebSocket |
| **Relay Node** | NAT traversal for restricted networks | libp2p circuit relay |
| **Bootstrap Node** | Initial peer discovery | libp2p Kademlia DHT |
| **Storage Node** | Blob storage and backup (DePIN) | IPFS-compatible |

---

## SDK Usage Example

```typescript
import { XNet } from '@xnet/sdk';

// Initialize xNet client
const xnet = new XNet({
  identity: await XNet.createIdentity(), // or load existing
  storage: 'indexeddb',
  signaling: ['wss://signal1.xnet.io', 'wss://signal2.xnet.io'],
});

// Create or join a workspace
const workspace = await xnet.workspace.create({
  name: 'My Team Workspace',
  encryption: 'e2e', // end-to-end encrypted
});

// Create a document
const doc = await workspace.document.create({
  type: 'Page',
  content: {
    title: 'Welcome',
    body: { type: 'doc', content: [] },
  },
});

// Subscribe to real-time updates
doc.subscribe((changes) => {
  console.log('Document updated:', changes);
});

// Invite collaborators
const invite = await workspace.createInvite({
  permissions: ['read', 'write'],
  expiresIn: '7d',
});
console.log('Share this link:', invite.url);

// Query documents
const pages = await workspace.query({
  type: 'Page',
  where: { 'content.title': { $contains: 'Welcome' } },
  orderBy: { updatedAt: 'desc' },
  limit: 10,
});
```

---

## Next Steps

- [Development Timeline](./02-development-timeline.md) - When to build each package
- [Phase 1: Wiki & Tasks](./03-phase-1-wiki-tasks.md) - First xNotes features
- [Appendix: Code Samples](./08-appendix-code-samples.md) - Detailed implementations

---

[← Back to Plan Overview](./README.md) | [Next: Development Timeline →](./02-development-timeline.md)
