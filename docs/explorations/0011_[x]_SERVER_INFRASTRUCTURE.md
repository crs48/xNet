# Server Infrastructure Exploration

> **Status**: ✅ IMPLEMENTED - The `@xnetjs/hub` package provides the unified server

## Implementation Status

The xNet Hub has been fully implemented at `packages/hub/`:

- [x] **Signaling** - `services/signaling.ts` for WebRTC peer discovery
- [x] **Sync Relay** - `services/relay.ts` and `services/node-relay.ts` for persistent sync
- [x] **Backup** - `services/backup.ts` for encrypted off-device storage
- [x] **Query/Search** - `services/query.ts` and `services/search-indexer.ts`
- [x] **Federation** - `services/federation.ts` for hub-to-hub communication
- [x] **Sharding** - `services/shard-router.ts`, `shard-rebalancer.ts`, `index-shards.ts`
- [x] **Awareness** - `services/awareness.ts` for presence snapshots
- [x] **Files** - `services/files.ts` for file storage
- [x] **Schemas** - `services/schemas.ts` for schema registry
- [x] **Crawl** - `services/crawl.ts` for web crawling
- [x] **Auth** - `auth/ucan.ts` and `auth/capabilities.ts`
- [x] **Storage** - SQLite and memory backends
- [x] **CLI** - `bin/xnet-hub.ts` for running the server

---

> Hosted services for signaling, sync relay, node backup, and large-scale queries

## Original Context

xNet is local-first P2P software -- it works with zero servers. But servers add value as **optional infrastructure** for:

1. **Signaling** -- WebRTC peer discovery when peers aren't on the same LAN
2. **Sync relay** -- Always-on node that keeps data available when user devices sleep
3. **Backup** -- Encrypted off-device storage for durability
4. **Large queries** -- Full-text search, embeddings, and aggregation across datasets too large for a phone

This exploration proposes a unified server ("xNet Hub") that provides all four services in a single deployable unit. The goal: one binary/container that anyone can spin up on a $5/mo VPS, or that we host as a paid service.

---

## Current State

| Component      | Status             | How It Works Today                                                       |
| -------------- | ------------------ | ------------------------------------------------------------------------ |
| Signaling      | Working (dev only) | `infrastructure/signaling/` -- standalone WebSocket pub/sub on port 4444 |
| Sync relay     | Not implemented    | Clients relay Yjs updates through signaling server (no persistence)      |
| Backup         | Not implemented    | `PERSISTENCE_ARCHITECTURE.md` has designs, nothing deployed              |
| Large queries  | Not implemented    | `@xnetjs/query` runs locally only (Lunr.js full-text search)             |
| Bootstrap node | Code exists        | `infrastructure/bootstrap/` -- libp2p DHT node, never deployed           |

---

## Design Principles

| Principle           | Implication                                                                |
| ------------------- | -------------------------------------------------------------------------- |
| **Optional**        | Everything works without the server; it's a durability/convenience upgrade |
| **Self-hostable**   | Single Docker image, `docker run xnet/hub` and done                        |
| **Multi-tenant**    | One server can serve many users (paid service model)                       |
| **Zero-knowledge**  | Server stores encrypted blobs; cannot read user data                       |
| **Protocol-native** | Uses the same sync protocol as P2P -- server is just another peer          |

---

## Architecture

```mermaid
flowchart TB
    subgraph "Client Devices"
        DESKTOP[Desktop<br/>Electron]
        MOBILE[Mobile<br/>Expo]
        WEB[Web<br/>PWA]
    end

    subgraph "xNet Hub (single process)"
        direction TB
        GW[API Gateway<br/>WebSocket + HTTP]

        subgraph "Services"
            SIG[Signaling<br/>y-webrtc pub/sub]
            RELAY[Sync Relay<br/>Yjs persistence]
            BACKUP[Backup Store<br/>Encrypted blobs]
            QUERY[Query Engine<br/>Search + Aggregation]
        end

        subgraph "Storage"
            PG[(PostgreSQL<br/>metadata + FTS)]
            S3[(Object Store<br/>CRDT state + blobs)]
        end

        GW --> SIG
        GW --> RELAY
        GW --> BACKUP
        GW --> QUERY

        RELAY --> PG
        RELAY --> S3
        BACKUP --> S3
        QUERY --> PG
    end

    DESKTOP <-->|WebSocket| GW
    MOBILE <-->|WebSocket| GW
    WEB <-->|WebSocket| GW

    style DESKTOP fill:#e3f2fd
    style MOBILE fill:#e3f2fd
    style WEB fill:#e3f2fd
    style GW fill:#fff3e0
    style SIG fill:#e8f5e9
    style RELAY fill:#e8f5e9
    style BACKUP fill:#e8f5e9
    style QUERY fill:#e8f5e9
    style PG fill:#f3e5f5
    style S3 fill:#f3e5f5
```

---

## Proposal A: Minimal Hub (Node.js Monolith)

**Philosophy**: One TypeScript process, SQLite storage, deploy anywhere.

### Stack

| Layer        | Technology                | Rationale                               |
| ------------ | ------------------------- | --------------------------------------- |
| Runtime      | Node.js 22                | Same language as client packages        |
| WebSocket    | `ws`                      | Already used by signaling server        |
| HTTP         | Hono                      | Lightweight, works on edge runtimes too |
| Database     | SQLite (better-sqlite3)   | Zero-config, single-file, fast          |
| Blob storage | Local filesystem          | Simple; S3 optional via adapter         |
| Auth         | UCAN tokens               | Same as P2P auth -- no new system       |
| Deployment   | Docker / Fly.io / Railway | Single container                        |

### Architecture

```mermaid
flowchart LR
    subgraph "xnet-hub (single process)"
        WS[WebSocket Server<br/>port 4444]
        HTTP[HTTP API<br/>port 4445]

        WS --> SIGMOD[Signaling Module]
        WS --> RELMOD[Relay Module]

        HTTP --> BACKMOD[Backup API]
        HTTP --> QUERYMOD[Query API]
        HTTP --> HEALTH[Health/Metrics]

        SIGMOD --> ROOMS[Room Manager]
        RELMOD --> DOCS[Doc Store<br/>Y.Doc instances]
        DOCS --> SQLITE[(SQLite<br/>crdt_state + metadata)]
        BACKMOD --> BLOBS[(Blob Store<br/>filesystem or S3)]
        QUERYMOD --> FTS[FTS5 Full-Text<br/>+ JSON queries]
    end

    style WS fill:#e8f5e9
    style HTTP fill:#e8f5e9
    style SQLITE fill:#f3e5f5
    style BLOBS fill:#f3e5f5
```

### How It Works

**Signaling** (same as today, unchanged):

```
Client → subscribe(topic) → Server broadcasts to other subscribers
Client → publish(topic, sdp) → Server forwards to topic subscribers
```

**Sync Relay** (server acts as an always-on Yjs peer):

```mermaid
sequenceDiagram
    participant A as Device A
    participant Hub as xNet Hub
    participant B as Device B (offline)

    A->>Hub: subscribe("doc-123")
    Hub->>Hub: Load Y.Doc from SQLite
    Hub->>A: sync-step2 (current state)
    A->>Hub: sync-update (new changes)
    Hub->>Hub: Apply to Y.Doc, persist to SQLite

    Note over B: Device B comes online later
    B->>Hub: subscribe("doc-123")
    Hub->>B: sync-step2 (includes A's changes)
    B->>Hub: sync-step2 (B's offline changes)
    Hub->>Hub: Merge via CRDT
    Hub->>A: sync-update (B's changes)
```

**Backup** (encrypted blob upload):

```
Client → PUT /backup/:docId (encrypted Uint8Array + metadata)
Client → GET /backup/:docId → encrypted blob
Client → GET /backup/list → [{docId, size, updatedAt}]
```

**Query** (server-side search):

```
Client → POST /query { schema, filter, sort, limit }
Client → POST /search { text, limit }
```

### Pros & Cons

| Pros                                                  | Cons                                         |
| ----------------------------------------------------- | -------------------------------------------- |
| Dead simple to deploy (`npx xnet-hub`)                | SQLite limits concurrent writes              |
| Single file database, easy backup                     | No horizontal scaling                        |
| Reuses existing packages (@xnetjs/data, @xnetjs/sync) | Memory-bound by Y.Doc count                  |
| $5/mo VPS is enough for personal use                  | Not suitable for 1000+ users on one instance |
| Same TypeScript, same team skills                     |                                              |

### Cost Estimate

| Tier         | Users  | VPS            | Storage   | Monthly |
| ------------ | ------ | -------------- | --------- | ------- |
| Personal     | 1-5    | $5 (1GB RAM)   | 10GB disk | $5      |
| Team         | 5-50   | $20 (4GB RAM)  | 50GB disk | $25     |
| Organization | 50-500 | $80 (16GB RAM) | 500GB S3  | $100+   |

---

## Proposal B: Scalable Hub (Containerized Microservices)

**Philosophy**: Production-grade from day one, horizontally scalable, cloud-native.

### Stack

| Layer         | Technology                        | Rationale                                    |
| ------------- | --------------------------------- | -------------------------------------------- |
| Orchestration | Docker Compose / K8s              | Standard cloud deployment                    |
| API Gateway   | Caddy or Traefik                  | Auto-TLS, load balancing                     |
| Signaling     | Node.js + Redis pub/sub           | Horizontally scalable rooms                  |
| Sync Relay    | Node.js + PostgreSQL              | ACID durability, CRDT state in bytea columns |
| Backup        | S3-compatible (MinIO self-hosted) | Unlimited blob storage                       |
| Query         | PostgreSQL FTS + pg_vector        | Full-text + semantic search                  |
| Auth          | UCAN verification middleware      | Stateless, no sessions                       |
| Monitoring    | Prometheus + Grafana              | Observability                                |

### Architecture

```mermaid
flowchart TB
    subgraph "Load Balancer"
        LB[Caddy / Traefik<br/>TLS termination]
    end

    subgraph "Stateless Workers (N replicas)"
        W1[Hub Worker 1]
        W2[Hub Worker 2]
        W3[Hub Worker N]
    end

    subgraph "Shared State"
        REDIS[(Redis<br/>pub/sub + sessions)]
        PG[(PostgreSQL<br/>metadata + CRDT + FTS)]
        MINIO[(MinIO / S3<br/>encrypted blobs)]
    end

    subgraph "Observability"
        PROM[Prometheus]
        GRAF[Grafana]
    end

    LB --> W1
    LB --> W2
    LB --> W3

    W1 --> REDIS
    W2 --> REDIS
    W3 --> REDIS

    W1 --> PG
    W2 --> PG
    W3 --> PG

    W1 --> MINIO
    W2 --> MINIO
    W3 --> MINIO

    W1 -.-> PROM
    W2 -.-> PROM
    PROM --> GRAF

    style LB fill:#fff3e0
    style W1 fill:#e8f5e9
    style W2 fill:#e8f5e9
    style W3 fill:#e8f5e9
    style REDIS fill:#f3e5f5
    style PG fill:#f3e5f5
    style MINIO fill:#f3e5f5
```

### Signaling with Redis Pub/Sub

```mermaid
sequenceDiagram
    participant C1 as Client (Worker 1)
    participant W1 as Worker 1
    participant R as Redis
    participant W2 as Worker 2
    participant C2 as Client (Worker 2)

    C1->>W1: subscribe("doc-123")
    W1->>R: SUBSCRIBE xnet:room:doc-123

    C2->>W2: subscribe("doc-123")
    W2->>R: SUBSCRIBE xnet:room:doc-123

    C1->>W1: publish("doc-123", sdp)
    W1->>R: PUBLISH xnet:room:doc-123
    R->>W2: message
    W2->>C2: forward sdp
```

Any number of workers can handle signaling -- Redis coordinates between them.

### Database Schema

```sql
-- Users/identities (DIDs)
CREATE TABLE identities (
    did TEXT PRIMARY KEY,
    public_key BYTEA NOT NULL,
    storage_quota_bytes BIGINT DEFAULT 1073741824, -- 1GB default
    storage_used_bytes BIGINT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Document metadata (not content -- content is encrypted)
CREATE TABLE documents (
    id TEXT PRIMARY KEY,
    owner_did TEXT REFERENCES identities(did),
    schema_iri TEXT,
    crdt_state BYTEA,           -- Yjs encoded state (encrypted)
    state_vector BYTEA,         -- For efficient sync
    size_bytes INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Encrypted backup blobs
CREATE TABLE backups (
    doc_id TEXT REFERENCES documents(id),
    version INTEGER,
    encrypted_blob_key TEXT,    -- S3 key for encrypted data
    size_bytes INTEGER,
    checksum TEXT,              -- BLAKE3 hash of encrypted blob
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (doc_id, version)
);

-- UCAN delegation chain (for access control)
CREATE TABLE delegations (
    cid TEXT PRIMARY KEY,       -- Content ID of UCAN token
    issuer_did TEXT,
    audience_did TEXT,
    resource TEXT,              -- doc ID or workspace pattern
    capabilities TEXT[],        -- ['read', 'write', 'admin']
    expires_at TIMESTAMPTZ,
    revoked BOOLEAN DEFAULT FALSE
);

-- Full-text search (on server-side decrypted metadata only)
-- Note: Only indexes data the user explicitly opts to make searchable
CREATE TABLE search_index (
    doc_id TEXT REFERENCES documents(id),
    title TEXT,
    tags TEXT[],
    searchable_text TEXT,       -- User-controlled: what's indexed
    embedding VECTOR(384),     -- Optional: semantic search
    updated_at TIMESTAMPTZ
);

CREATE INDEX idx_search_fts ON search_index
    USING GIN (to_tsvector('english', searchable_text));
CREATE INDEX idx_search_embedding ON search_index
    USING ivfflat (embedding vector_cosine_ops);
```

### Pros & Cons

| Pros                                          | Cons                             |
| --------------------------------------------- | -------------------------------- |
| Horizontally scalable                         | More complex to deploy           |
| Production-proven stack (Postgres, Redis, S3) | Higher minimum cost ($20+/mo)    |
| Proper observability                          | Requires Docker/K8s knowledge    |
| Handles 10,000+ users                         | Over-engineered for personal use |
| Semantic search via pg_vector                 | More moving parts to maintain    |

### Cost Estimate

| Tier    | Users      | Infrastructure                 | Monthly |
| ------- | ---------- | ------------------------------ | ------- |
| Starter | 1-100      | 1 worker + managed PG + R2     | $25     |
| Growth  | 100-1000   | 3 workers + PG + Redis + S3    | $100    |
| Scale   | 1000-10000 | K8s cluster + managed services | $500+   |

---

## Proposal C: Hybrid (Start Minimal, Scale Up)

**Philosophy**: Ship Proposal A first, migrate to B's backing stores when needed. Same API, swap internals.

### Architecture

```mermaid
flowchart TB
    subgraph "Phase 1: Ship Fast"
        direction LR
        HUB1[xnet-hub<br/>Single Process]
        SQL1[(SQLite)]
        FS1[(Filesystem)]
        HUB1 --> SQL1
        HUB1 --> FS1
    end

    subgraph "Phase 2: Add Persistence"
        direction LR
        HUB2[xnet-hub<br/>Single Process]
        PG2[(PostgreSQL)]
        S3_2[(S3/R2)]
        HUB2 --> PG2
        HUB2 --> S3_2
    end

    subgraph "Phase 3: Scale Out"
        direction LR
        LB3[Load Balancer]
        W3A[Worker]
        W3B[Worker]
        RED3[(Redis)]
        PG3[(PostgreSQL)]
        S3_3[(S3)]
        LB3 --> W3A
        LB3 --> W3B
        W3A --> RED3
        W3B --> RED3
        W3A --> PG3
        W3B --> PG3
        W3A --> S3_3
        W3B --> S3_3
    end

    style HUB1 fill:#e8f5e9
    style SQL1 fill:#f3e5f5
    style FS1 fill:#f3e5f5
    style HUB2 fill:#e8f5e9
    style PG2 fill:#f3e5f5
    style S3_2 fill:#f3e5f5
    style LB3 fill:#fff3e0
    style W3A fill:#e8f5e9
    style W3B fill:#e8f5e9
```

### Storage Adapter Pattern

The key enabler: abstract storage behind interfaces so the hub process doesn't care what's backing it.

```typescript
// Storage adapters -- swap implementations without changing hub code
interface HubStorage {
  // CRDT state
  getDocState(docId: string): Promise<Uint8Array | null>
  setDocState(docId: string, state: Uint8Array): Promise<void>
  getStateVector(docId: string): Promise<Uint8Array | null>

  // Backup blobs
  putBlob(key: string, data: Uint8Array): Promise<void>
  getBlob(key: string): Promise<Uint8Array | null>
  listBlobs(prefix: string): Promise<BlobMeta[]>

  // Metadata & search
  setMeta(docId: string, meta: DocMeta): Promise<void>
  search(query: SearchQuery): Promise<SearchResult[]>
}

// Phase 1: SQLite + filesystem
class SQLiteHubStorage implements HubStorage {
  /* ... */
}

// Phase 2: PostgreSQL + S3
class PostgresHubStorage implements HubStorage {
  /* ... */
}
```

### Room Manager Pattern (for signaling scaling)

```typescript
interface RoomBroadcaster {
  subscribe(room: string, ws: WebSocket): void
  unsubscribe(room: string, ws: WebSocket): void
  publish(room: string, data: Uint8Array, sender: WebSocket): void
}

// Phase 1: In-memory (single process)
class LocalRoomBroadcaster implements RoomBroadcaster {
  /* ... */
}

// Phase 3: Redis pub/sub (multi-process)
class RedisRoomBroadcaster implements RoomBroadcaster {
  /* ... */
}
```

---

## Authentication & Authorization

All proposals use UCAN tokens (already part of xNet's identity system). The server never needs passwords or sessions.

```mermaid
sequenceDiagram
    participant Client
    participant Hub as xNet Hub
    participant UCAN as UCAN Verifier

    Client->>Client: Create UCAN token<br/>(signed with Ed25519 key)
    Client->>Hub: WebSocket + Bearer UCAN
    Hub->>UCAN: Verify signature + delegation chain
    UCAN->>Hub: {did, capabilities, expiry}
    Hub->>Hub: Check capabilities vs requested action
    Hub->>Client: Connected (or 403)
```

### Capability Model

```typescript
type HubCapability =
  | 'hub/signaling' // Join signaling rooms
  | 'hub/relay/*' // Relay any doc
  | `hub/relay/${string}` // Relay specific doc
  | 'hub/backup/*' // Backup any doc
  | `hub/backup/${string}` // Backup specific doc
  | 'hub/query' // Run queries
  | 'hub/admin' // Server administration

// Example UCAN for a team member:
// Issuer: did:key:z6MkTeamAdmin...
// Audience: did:key:z6MkTeamMember...
// Capabilities: ['hub/relay/workspace-abc/*', 'hub/backup/workspace-abc/*']
// Expiry: 30 days
```

---

## Sync Relay Deep Dive

The relay is the most valuable server feature. It makes xNet work like a "cloud app" without sacrificing local-first principles.

### How the Relay Differs from Pure Signaling

|                                     | Signaling Only      | Signaling + Relay |
| ----------------------------------- | ------------------- | ----------------- |
| Peers must be online simultaneously | Yes                 | No                |
| Data persists on server             | No                  | Yes (encrypted)   |
| Works with 1 device                 | No (needs 2+ peers) | Yes               |
| Bandwidth usage                     | Peer-to-peer        | Through server    |
| Latency                             | Depends on peers    | Consistent        |

### Relay as a Yjs Peer

The relay is literally a Yjs peer that never goes offline. It uses the same sync protocol as any other peer:

```typescript
class SyncRelayService {
  private docs = new Map<string, Y.Doc>()

  async handleSubscribe(ws: WebSocket, docId: string, ucan: UCAN) {
    // Verify UCAN grants relay access to this doc
    if (!hasCapability(ucan, `hub/relay/${docId}`)) {
      ws.close(4003, 'Insufficient capabilities')
      return
    }

    // Load or create Y.Doc
    let doc = this.docs.get(docId)
    if (!doc) {
      doc = new Y.Doc()
      const stored = await this.storage.getDocState(docId)
      if (stored) {
        Y.applyUpdate(doc, stored)
      }
      this.docs.set(docId, doc)
    }

    // Send current state to client
    const sv = Y.encodeStateVector(doc)
    ws.send(encodeSyncStep1(sv))

    // Listen for updates from client
    ws.on('message', (msg) => {
      const update = decodeSyncMessage(msg)
      Y.applyUpdate(doc, update)

      // Persist (debounced)
      this.persistDebounced(docId, doc)

      // Broadcast to other subscribers
      this.broadcast(docId, update, ws)
    })

    // Listen for local changes (from other peers)
    const handler = (update: Uint8Array) => {
      ws.send(encodeSyncUpdate(update))
    }
    doc.on('update', handler)
    ws.on('close', () => doc.off('update', handler))
  }

  private persistDebounced = debounce(async (docId: string, doc: Y.Doc) => {
    const state = Y.encodeStateAsUpdate(doc)
    await this.storage.setDocState(docId, state)
  }, 1000)
}
```

### Memory Management

Y.Doc instances in memory can be expensive. Strategy for managing thousands of docs:

```mermaid
flowchart LR
    subgraph "Hot (in memory)"
        D1[Doc A<br/>3 peers connected]
        D2[Doc B<br/>1 peer connected]
    end

    subgraph "Warm (LRU cache)"
        D3[Doc C<br/>accessed 2min ago]
        D4[Doc D<br/>accessed 5min ago]
    end

    subgraph "Cold (disk only)"
        D5[Doc E<br/>last access: 2 days]
        D6[Doc F<br/>last access: 1 week]
    end

    D2 -->|no peers for 5min| D3
    D4 -->|evicted from LRU| D5

    style D1 fill:#e8f5e9
    style D2 fill:#e8f5e9
    style D3 fill:#fff3e0
    style D4 fill:#fff3e0
    style D5 fill:#f3e5f5
    style D6 fill:#f3e5f5
```

```typescript
class DocPool {
  private hot = new Map<string, Y.Doc>() // Active connections
  private warm = new LRU<string, Y.Doc>(1000) // Recently used
  private cold: HubStorage // Persistent store

  async get(docId: string): Promise<Y.Doc> {
    // Check hot
    if (this.hot.has(docId)) return this.hot.get(docId)!

    // Check warm
    const cached = this.warm.get(docId)
    if (cached) {
      this.hot.set(docId, cached)
      this.warm.delete(docId)
      return cached
    }

    // Load from cold
    const doc = new Y.Doc()
    const state = await this.cold.getDocState(docId)
    if (state) Y.applyUpdate(doc, state)
    this.hot.set(docId, doc)
    return doc
  }

  release(docId: string) {
    const doc = this.hot.get(docId)
    if (doc) {
      this.hot.delete(docId)
      this.warm.set(docId, doc)
    }
  }
}
```

---

## Query Engine Deep Dive

Server-side queries solve two problems:

1. **Search across all your data** without loading everything into browser memory
2. **Semantic search** via embeddings (too compute-heavy for mobile)

### Query Protocol

```typescript
// Client sends query over WebSocket or HTTP
interface HubQuery {
  // Schema filter
  schema?: string // e.g., 'xnet://xnet.dev/Task'

  // Property filters
  where?: Filter[]

  // Full-text search
  search?: string

  // Semantic search (requires embeddings)
  semantic?: {
    text: string
    threshold: number // 0-1 similarity
  }

  // Pagination
  limit?: number
  offset?: number

  // Sorting
  sort?: { field: string; direction: 'asc' | 'desc' }[]
}

interface HubQueryResult {
  items: NodeState[]
  total: number
  took_ms: number
}
```

### Privacy Model for Server Queries

The server can only query data the user explicitly indexes. Three modes:

| Mode              | What's Indexed                       | Use Case                              |
| ----------------- | ------------------------------------ | ------------------------------------- |
| **Metadata only** | Title, schema, tags, dates           | Basic search without exposing content |
| **Full text**     | All text content (encrypted at rest) | Full-text search                      |
| **Semantic**      | Embeddings of content                | "Find similar documents"              |

The user controls what gets indexed via their sync config:

```typescript
interface HubSyncConfig {
  // Which docs to relay (always encrypted CRDT state)
  relay: {
    workspaces: string[] // or '*' for all
  }

  // Which docs to make queryable (requires server-side decryption)
  index: {
    mode: 'none' | 'metadata' | 'fulltext' | 'semantic'
    workspaces: string[]
    schemas: string[] // Only index certain types
  }
}
```

---

## Deployment Options

### Option 1: Fly.io (Recommended for Hosted Service)

```toml
# fly.toml
[build]
  dockerfile = "Dockerfile"

[env]
  NODE_ENV = "production"
  STORAGE_BACKEND = "postgres"  # or "sqlite" for single-machine

[http_service]
  internal_port = 4445
  force_https = true

[[services]]
  protocol = "tcp"
  internal_port = 4444
  [[services.ports]]
    port = 443
    handlers = ["tls", "http"]

[mounts]
  source = "xnet_data"
  destination = "/data"

# Postgres managed by Fly
# fly postgres create --name xnet-db

# S3 via Tigris (Fly's S3-compatible storage)
# fly storage create
```

### Option 2: Docker Compose (Self-Hosted)

```yaml
# docker-compose.yml
version: '3.8'

services:
  hub:
    image: xnet/hub:latest
    ports:
      - '4444:4444' # WebSocket (signaling + relay)
      - '4445:4445' # HTTP API
    environment:
      - STORAGE_BACKEND=postgres
      - DATABASE_URL=postgres://xnet:pass@postgres:5432/xnet
      - S3_ENDPOINT=http://minio:9000
      - S3_BUCKET=xnet-backups
      - S3_ACCESS_KEY=minioadmin
      - S3_SECRET_KEY=minioadmin
    depends_on:
      - postgres
      - minio

  postgres:
    image: pgvector/pgvector:pg16
    volumes:
      - pg_data:/var/lib/postgresql/data
    environment:
      - POSTGRES_DB=xnet
      - POSTGRES_USER=xnet
      - POSTGRES_PASSWORD=pass

  minio:
    image: minio/minio
    command: server /data --console-address ":9001"
    volumes:
      - minio_data:/data
    environment:
      - MINIO_ROOT_USER=minioadmin
      - MINIO_ROOT_PASSWORD=minioadmin

  caddy:
    image: caddy:2
    ports:
      - '80:80'
      - '443:443'
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile

volumes:
  pg_data:
  minio_data:
```

### Option 3: Single Binary (npx / Homebrew)

For personal use -- no Docker needed:

```bash
# Install globally
npm install -g @xnetjs/hub

# Run with SQLite (zero config)
xnet-hub

# Or with options
xnet-hub --port 4444 --data ~/.xnet-hub --storage sqlite

# Or via npx (no install)
npx @xnetjs/hub
```

---

## Package Structure (in monorepo)

```
packages/
  hub/                          # @xnetjs/hub
    src/
      index.ts                  # Entry point, CLI
      server.ts                 # HTTP + WebSocket server
      services/
        signaling.ts            # Room-based pub/sub
        relay.ts                # Yjs doc persistence
        backup.ts               # Encrypted blob store
        query.ts                # Server-side query engine
      storage/
        interface.ts            # HubStorage interface
        sqlite.ts               # SQLite adapter (Phase 1)
        postgres.ts             # PostgreSQL adapter (Phase 2)
        s3.ts                   # S3/R2/MinIO blob adapter
      auth/
        ucan.ts                 # UCAN verification
        capabilities.ts         # Capability definitions
      pool/
        doc-pool.ts             # Y.Doc memory management
    Dockerfile
    docker-compose.yml
    fly.toml
    package.json
```

---

## Monetization Model

### Free Tier (Self-Hosted)

- All code is open source (MIT)
- Run your own hub on any VPS
- No limits, no phone-home

### Paid Tiers (Hosted by us)

| Tier           | Price       | Relay Docs | Backup    | Query                | Support   |
| -------------- | ----------- | ---------- | --------- | -------------------- | --------- |
| **Free**       | $0          | 10 docs    | 100MB     | Metadata only        | Community |
| **Personal**   | $5/mo       | 1,000 docs | 5GB       | Full-text            | Email     |
| **Team**       | $15/mo/seat | Unlimited  | 50GB      | Full-text + semantic | Priority  |
| **Enterprise** | Custom      | Unlimited  | Unlimited | Custom models        | Dedicated |

### Revenue Mechanics

Like Mastodon/Matrix: we run the "official" instance, but anyone can run their own. Revenue comes from convenience, not lock-in.

```mermaid
flowchart LR
    subgraph "Open Source"
        CODE[xnet/hub<br/>MIT License]
    end

    subgraph "Self-Hosted (Free)"
        VPS1[Alice's VPS<br/>$5/mo DigitalOcean]
        VPS2[Bob's RPi<br/>Free]
        VPS3[Corp's K8s<br/>Their infra]
    end

    subgraph "Hosted (Paid)"
        OFFICIAL[hub.xnet.io<br/>Managed by us]
    end

    CODE --> VPS1
    CODE --> VPS2
    CODE --> VPS3
    CODE --> OFFICIAL

    style CODE fill:#e8f5e9
    style VPS1 fill:#e3f2fd
    style VPS2 fill:#e3f2fd
    style VPS3 fill:#e3f2fd
    style OFFICIAL fill:#fff3e0
```

---

## Implementation Roadmap

### Phase 1: Unified Hub MVP (2-3 weeks)

- [ ] Create `packages/hub` with Hono + ws
- [ ] Port signaling from `infrastructure/signaling/` into hub
- [ ] Add Yjs sync relay with SQLite persistence
- [ ] Add backup blob endpoint (filesystem)
- [ ] UCAN auth middleware
- [ ] Dockerfile + fly.toml
- [ ] CLI: `npx @xnetjs/hub`
- [ ] Health/metrics endpoints

### Phase 2: Client Integration (1-2 weeks)

- [ ] Update `@xnetjs/react` useDocument to connect to hub relay
- [ ] Add backup sync to `@xnetjs/storage`
- [ ] Hub connection config in XNetProvider
- [ ] Sync status UI (connected to hub, peer count)

### Phase 3: Query Engine (1-2 weeks)

- [ ] Server-side NodeStore query execution
- [ ] Full-text search via SQLite FTS5
- [ ] Query API (HTTP + WebSocket)
- [ ] Client-side `useQuery` with hub fallback

### Phase 4: Production Hardening (2 weeks)

- [ ] PostgreSQL storage adapter
- [ ] S3 blob storage adapter
- [ ] Redis room broadcaster
- [ ] Rate limiting per DID
- [ ] Storage quota enforcement
- [ ] Docker Compose for self-hosting
- [ ] Monitoring dashboard

### Phase 5: Semantic Search (future)

- [ ] Embedding generation (on-device or server)
- [ ] pg_vector similarity search
- [ ] "Find similar" UI in apps

---

## Recommendation

**Start with Proposal C (Hybrid)**:

1. **Ship Proposal A first** -- single-process Node.js hub with SQLite. This covers 90% of users (personal + small teams) and can be deployed in a day.

2. **Add Postgres/S3 adapters when needed** -- same hub code, swap the storage backend via env var. No API changes.

3. **Scale to multi-worker only if we actually get thousands of paying users** -- premature optimization otherwise.

The key insight: the storage adapter pattern means we never rewrite the hub -- we just swap backends. Ship fast, scale later.

### First Commit Should Include

1. `packages/hub/` with signaling + relay + backup
2. SQLite storage (zero-config default)
3. UCAN auth
4. Dockerfile
5. `npx @xnetjs/hub` CLI
6. Move `infrastructure/signaling/` logic into hub (deprecate standalone)

This gives us a deployable product on day one that replaces the existing signaling server while adding relay and backup.

---

## Future Hub Capabilities (Beyond Phase 1)

Phase 1 covers signaling, Yjs sync relay, encrypted backup, FTS5 search, and UCAN auth. Below are additional capabilities the hub could provide, organized by timeline. Each connects to existing code in the monorepo.

### Short-Term (Build Alongside Phase 1)

#### 1. NodeChange Sync Relay (Event-Sourced Structured Data)

The hub currently only relays Yjs CRDT updates (rich text). Structured data uses a separate event-sourced system (`NodeStore` + Lamport clocks + LWW), and these `NodeChange` events have no server relay. Without this, structured data (tasks, database rows, relations) only syncs when both peers are online simultaneously.

```mermaid
sequenceDiagram
    participant A as Device A
    participant Hub
    participant B as Device B (offline)

    A->>Hub: NodeChange (Task.status = "done")
    Hub->>Hub: Append to node_changes table<br/>Track Lamport clock
    Note over B: Comes online later
    B->>Hub: requestChanges(sinceTimestamp)
    Hub->>B: [NodeChange batch]
    B->>B: applyRemoteChanges()
```

**Connects to:**

- `NodeStore.applyRemoteChange()` in `packages/data/src/store/store.ts:387-409`
- `NodeStorageAdapter.appendChange()` / `getAllChanges()` in `packages/data/src/store/types.ts:128-132`
- `SyncProvider.broadcast()` / `requestChanges()` in `packages/sync/src/provider.ts:88-98`

**Gap:** The `NodeStorageAdapter` has no `getChangesSince(lamportTime)` — only `getAllChanges()`. A delta-sync protocol needs a "since" query. Add a `changes_log` table with Lamport ordering on the hub.

#### 2. File/Blob Storage (Content-Addressed)

The `FileRef` property type (`packages/data/src/schema/properties/file.ts:10-18`) already defines CID, name, mimeType, size — but there's no upload/download infrastructure. Files cannot sync between devices today.

The hub can provide content-addressed file hosting: `PUT /files/:cid` (upload), `GET /files/:cid` (download), UCAN-gated. Reuses the existing backup filesystem blob store. The `ContentStore` interface in `packages/core/src/content.ts:40-46` (`get(cid)`, `store(content)`, `verify(cid, content)`) already defines the right abstraction.

#### 3. Schema Registry Service

The `SchemaRegistry` (`packages/data/src/schema/registry.ts:58-83`) is local-only. When Client A creates a node with schema `xnet://did:key:z6MkAlice.../Recipe`, Client B cannot resolve that schema definition. The hub can serve published schemas via HTTP:

```
GET  /schemas/:iri  → SchemaDefinition JSON
POST /schemas       → Publish new schema (UCAN: issuer = schema DID owner)
GET  /schemas?search=recipe → Discover community schemas
```

A simple `schemas` table in SQLite (IRI, version, definition JSON, publisher DID) is sufficient.

#### 4. Awareness/Presence Persistence

The hub already relays awareness messages (currently pass-through, `03-sync-relay.md` line 309). Upgrading to persist last-known presence per DID gives "who was last editing this document" without requiring the peer to be online. Useful for collaborative UX (avatars, "last seen editing 2h ago").

**Connects to:** `UserPresence`, `CursorPosition`, `SelectionRange` types in `packages/data/src/sync/awareness.ts`.

#### 5. DID Resolution & Peer Discovery

The `DIDResolver` in `packages/network/src/resolution/did.ts:33-43` is a stub (returns null for all resolution). The hub can maintain a DID-to-endpoint mapping so clients can find each other after IP changes:

```
POST /dids/register { did, multiaddrs, lastSeen }
GET  /dids/:did → { multiaddrs, lastSeen, publicKey }
```

Also fills the empty `NetworkConfig.bootstrapPeers` (`packages/network/src/types.ts:74-79`) — the hub IS the bootstrap node.

---

### Medium-Term (Phase 2-3, After Core Hub Works)

#### 6. Server-Side Vector/Semantic Search

The `@xnetjs/vectors` package loads `Xenova/all-MiniLM-L6-v2` (384-dim) in-browser — slow and memory-intensive on mobile. The hub can pre-compute embeddings for indexed documents and serve vector search. Use `sqlite-vss` or an in-process HNSW index.

**Connects to:**

- `EmbeddingModel` interface in `packages/vectors/src/embedding.ts:26-35`
- `SemanticSearch.indexDocument()` / `.search()` in `packages/vectors/src/search.ts`
- `HybridSearch` in `packages/vectors/src/hybrid.ts` (combines vector + keyword)

#### 7. Formula/Rollup Computation

The formula engine (`packages/formula/src/`) is fully implemented with math, string, date, logic, and array functions. But rollups (TODO at `packages/data/src/schema/properties/index.ts:48`) require fetching related nodes via `relation` properties. When a relation points to thousands of items, only the hub has them all loaded.

The hub can evaluate formulas on its full NodeStore snapshot: `GET /compute/:docId/:propertyId` or as a WebSocket subscription that pushes recomputed values when dependencies change.

#### 8. TURN/Circuit Relay for NAT Traversal

`packages/network/src/node.ts` already configures `circuitRelayTransport()` (line 11, 40) but has no actual relay server. The hub can act as a libp2p circuit relay (TURN equivalent), allowing peers behind symmetric NATs to connect when WebRTC direct connections fail. Critical for mobile users behind carrier-grade NAT.

#### 9. Federated Query Execution

The `FederatedQueryRouter` in `packages/query/src/federation/router.ts:43-45` throws `'Remote query not implemented'`. The hub is the natural execution point: clients send queries to their hub, and hubs can optionally route to peer hubs for cross-organization search.

```mermaid
flowchart LR
    Client -->|query| HubA
    HubA -->|federated query| HubB
    HubA -->|federated query| HubC
    HubB -->|results| HubA
    HubC -->|results| HubA
    HubA -->|merged results| Client
```

#### 10. Webhook/Event Notifications

Allow users to register webhooks for specific events (node created, property changed, document edited). The `NodeChangeEvent` / `NodeChangeListener` types (`packages/data/src/store/types.ts:268-280`) already define the event system. The hub can forward these as HTTP webhooks for integrations (Slack, CI/CD, ERP connectors).

```typescript
// Example webhook registration
POST /webhooks {
  url: "https://hooks.slack.com/...",
  events: ["node.created", "property.changed"],
  filter: { schemaIri: "xnet://xnet.dev/Task", property: "status" }
}
```

#### 11. Conflict Audit Trail

The `MergeConflict` type (`packages/data/src/store/types.ts:189-197`) is only kept in-memory (`NodeStore.getRecentConflicts()` returns last 100). The hub can persist ALL conflicts for compliance and debugging. VISION.md explicitly calls out "Full audit trail of every change (who, what, when)" for enterprise use.

#### 12. Peer Reputation Aggregation

The `PeerScorer` (`packages/network/src/security/peer-scorer.ts`) only scores from one client's perspective. The hub can aggregate reports from all connected clients to build network-wide reputation. Malicious peers blocked by multiple clients get globally flagged via the `AutoBlocker` (`packages/network/src/security/auto-blocker.ts`).

---

### Long-Term (Architectural, Requires Research)

#### 13. Distributed Search Index (Decentralized Google)

VISION.md's primary macro-scale goal (lines 150-198): "A Google-scale search engine with no central operator." Multiple hubs participate in a distributed index where each hub indexes a portion of the namespace. Requires:

- DHT-based index routing (which hub holds which shard?)
- Incentive mechanisms for crawlers
- Ranking algorithm governance
- Inter-hub query protocol (builds on #9)

#### 14. Federated Social Graph

VISION.md's "Federated Social Network" (lines 199-240): posts live in user namespaces, social graph is portable, algorithms are transparent. Hubs aggregate and cache feeds from followed users across the network. Requires:

- ActivityPub-like federation protocol
- Feed aggregation at scale
- Spam prevention without centralized moderation
- Public namespace resolution across hubs

#### 15. Key Recovery & Social Verification

`@xnetjs/identity` has no recovery mechanism. If a user loses their device, DID keys are gone forever (`BrowserPasskeyStorage` in `packages/identity/src/passkey.ts` is device-bound). The hub can store encrypted key recovery shards (Shamir's Secret Sharing). Trusted contacts authorize recovery via UCAN delegations. Requires:

- Threshold cryptography
- Social recovery UX (N-of-M contacts)
- Secure shard storage (encrypted at rest, per-shard access control)

#### 16. Canvas Spatial Sharding

The canvas package (`packages/canvas/src/store.ts`) uses a Y.Map for all nodes. With 10,000+ items, syncing the full map to every client is wasteful. The hub can serve spatial subscriptions based on viewport — only syncing visible regions. Requires:

- Spatial subscription protocol (viewport → doc sub-regions)
- Incremental Yjs sub-doc sync
- Viewport-aware eviction in the DocPool
- Integration with `SpatialIndex` R-tree (`packages/canvas/src/spatial/index.ts`)

#### 17. Economic Layer / Incentivized Storage

Hub operators earn tokens for providing storage, compute (embeddings, formula evaluation), and relay. Users pay with tokens or earn them by contributing (crawling, indexing). VISION.md's "Economic Layer" (roadmap: 2028-01 to 2028-06). Makes the network self-sustaining. Requires:

- Token design (likely lightweight, not blockchain-heavy)
- Proof-of-storage/compute verification
- Pricing mechanisms
- Anti-abuse / Sybil resistance

#### 18. Inter-Hub Federation Protocol

Hub-to-hub protocol for routing sync, queries, and schema resolution across organizational boundaries. An enterprise hub can selectively federate with partner hubs without full data replication. VISION.md shows "Selective sync" and "Federation" as Phase 3. Requires:

- Selective replication (which changes cross boundaries?)
- Access control delegation across trust boundaries
- Conflict resolution across hubs (Lamport vs wall-clock?)
- Hub identity (hub has its own DID, signed by operator)

---

### Capability Summary

| #   | Capability                      | Timeline | Effort | Primary Package                         |
| --- | ------------------------------- | -------- | ------ | --------------------------------------- |
| 1   | NodeChange Sync Relay           | Short    | Low    | `@xnetjs/data`, `@xnetjs/sync`          |
| 2   | File/Blob Storage (CID)         | Short    | Low    | `@xnetjs/data`, `@xnetjs/core`          |
| 3   | Schema Registry                 | Short    | Low    | `@xnetjs/data` (SchemaRegistry)         |
| 4   | Awareness/Presence Persistence  | Short    | Low    | `@xnetjs/data/sync/awareness`           |
| 5   | DID Resolution / Peer Discovery | Short    | Medium | `@xnetjs/network`                       |
| 6   | Server-Side Vector Search       | Medium   | Medium | `@xnetjs/vectors`                       |
| 7   | Formula/Rollup Computation      | Medium   | Medium | `@xnetjs/formula`, `@xnetjs/data`       |
| 8   | TURN/Circuit Relay              | Medium   | Medium | `@xnetjs/network` (libp2p)              |
| 9   | Federated Query Execution       | Medium   | Medium | `@xnetjs/query` (federation/)           |
| 10  | Webhook/Event Notifications     | Medium   | Low    | `@xnetjs/data` (NodeChangeEvent)        |
| 11  | Conflict Audit Trail            | Medium   | Low    | `@xnetjs/data` (MergeConflict)          |
| 12  | Peer Reputation Aggregation     | Medium   | Medium | `@xnetjs/network/security`              |
| 13  | Distributed Search Index        | Long     | High   | `@xnetjs/query`, Vision                 |
| 14  | Federated Social Graph          | Long     | High   | Vision, schemas                         |
| 15  | Key Recovery / Social Verify    | Long     | High   | `@xnetjs/identity`                      |
| 16  | Canvas Spatial Sharding         | Long     | High   | `@xnetjs/canvas`                        |
| 17  | Economic Layer                  | Long     | V.High | Vision, all packages                    |
| 18  | Inter-Hub Federation            | Long     | High   | `@xnetjs/query`, `@xnetjs/sync`, Vision |

### Priority Recommendation

For the Phase 1 hub implementation, consider adding **#1 (NodeChange Sync)** and **#2 (File/Blob Storage)** — both are low-effort and fill critical gaps that make the hub useful for more than just rich text documents. Schema Registry (#3) is also trivial to add since it's just another HTTP endpoint + SQLite table.

After Phase 1, the highest-impact additions are **#6 (Vector Search)** and **#8 (TURN Relay)** — they solve real pain points (search quality and connectivity) that users hit immediately.
