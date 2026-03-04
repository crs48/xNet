# 17: Foundation Requirements

> What must be built NOW to enable the global vision

[← Back to Plan Overview](./README.md)

---

## Executive Summary

The architecture is sound for the long-term vision. But **4 weeks of foundation work** before Phase 1 implementation will prevent 3+ months of rework later.

### Critical Foundations

| Foundation                       | Risk if Skipped                              | Effort  |
| -------------------------------- | -------------------------------------------- | ------- |
| **Immutable content addressing** | Can't verify data, no DePIN/IPFS integration | 2 weeks |
| **CRDT snapshots/compaction**    | Load times > 1 min, mobile crashes           | 1 week  |
| **Signed update chain**          | Can't detect forks, no audit trail           | 1 week  |
| **DID resolution protocol**      | Can't scale peer discovery                   | 1 week  |
| **Query federation protocol**    | Queries only work on local data              | 2 weeks |
| **Role-based permissions**       | Permission docs explode at scale             | 1 week  |

---

## 1. Immutable Content Addressing

**Problem:** Documents are identified by path, but we can't verify content integrity or build storage proofs without content addressing.

**What to build:**

```typescript
// Every piece of data gets a content ID
interface ContentChunk {
  data: Uint8Array
  hash: string // BLAKE3 hash of data
  size: number
}

// Documents are Merkle trees of chunks
interface ContentTree {
  rootHash: string // Hash of root node
  chunks: ContentChunk[]
  tree: MerkleNode[]
}

// Content ID format
type ContentId = `cid:blake3:${string}` // e.g., cid:blake3:7d865e...

// Resolution
interface ContentResolver {
  // Get content by hash (location-independent)
  get(cid: ContentId): Promise<Uint8Array>

  // Store content, returns CID
  put(data: Uint8Array): Promise<ContentId>

  // Verify content matches hash
  verify(cid: ContentId, data: Uint8Array): boolean
}
```

**Why this enables the vision:**

- Deduplication across peers
- Proof of storage (provider proves they have data)
- Cross-replica verification
- IPFS/Filecoin integration
- Immutable audit trail

---

## 2. CRDT Snapshots & Compaction

**Problem:** Loading 100k+ CRDT updates takes minutes and GBs of RAM.

**What to build:**

```typescript
interface SnapshotStrategy {
  // When to create snapshots
  triggers: {
    updateCount: 10000 // Every 10k updates
    timeInterval: '24h' // Or every 24 hours
    storagePressure: 0.8 // Or when 80% full
  }

  // Snapshot format
  snapshot: {
    stateVector: Uint8Array // Which updates are included
    compressedState: Uint8Array // Full CRDT state, compressed
    timestamp: number
    signature: Signature // Signed by creator
  }
}

// Storage with snapshots
interface SnapshotAwareStorage {
  // Get latest snapshot + updates since
  loadDocument(id: string): {
    snapshot?: Snapshot
    updatesSinceSnapshot: Update[]
  }

  // Create snapshot (during idle time)
  createSnapshot(id: string): Promise<Snapshot>

  // Prune old updates (keep only since last snapshot)
  compact(id: string): Promise<void>
}
```

**Why this enables the vision:**

- Sub-second document loads at any scale
- Mobile devices don't crash
- Storage stays bounded
- Network sync transfers snapshots, not full history

---

## 3. Signed Update Chain

**Problem:** Can't verify who made changes or detect malicious forks.

**What to build:**

```typescript
interface SignedUpdate {
  // CRDT payload
  update: Uint8Array

  // Chain linkage
  parentHash: string // Hash of previous update (or snapshot)
  updateHash: string // Hash of this update

  // Attribution
  authorDID: string // Who made this change
  signature: Signature // Proves author made it
  timestamp: number // Logical clock, not wall time

  // Ordering
  vectorClock: VectorClock // Causal ordering
}

// Verification
function verifyUpdate(update: SignedUpdate): boolean {
  // 1. Verify signature matches author's public key
  // 2. Verify updateHash matches content
  // 3. Verify parentHash exists in our chain
  // 4. Verify vector clock is valid progression
}

// Fork detection
function detectFork(updates: SignedUpdate[]): Fork | null {
  // Find two updates with same parentHash but different updateHash
  // This indicates a fork (concurrent edits that diverged)
}
```

**Why this enables the vision:**

- Audit trail for compliance
- Fork detection and resolution
- Proof of authorship
- Prevents replay attacks
- Enables consensus mechanisms later

---

## 4. DID Resolution Protocol

**Problem:** No specification for how `did:key:z6Mk...` resolves to network locations.

**What to build:**

```typescript
interface DIDResolution {
  // Resolution result
  interface Resolution {
    did: string
    locations: PeerLocation[]    // Where this identity's data lives
    publicKey: Uint8Array        // For verification
    lastSeen: number             // Freshness
  }

  // Resolution strategies (try in order)
  strategies: [
    'local-cache',      // Check local cache first
    'connected-peers',  // Ask peers we're connected to
    'dht',              // Query DHT
    'bootstrap',        // Ask bootstrap nodes
    'registry',         // Optional: blockchain registry
  ]

  // Bootstrap nodes (hardcoded for initial network)
  bootstrapPeers: [
    '/dns4/bootstrap1.xnet.io/tcp/4001/p2p/12D3KooW...',
    '/dns4/bootstrap2.xnet.io/tcp/4001/p2p/12D3KooW...',
    // ... 10-20 geographically distributed
  ]

  // DHT configuration
  dht: {
    protocol: '/xnet/kad/1.0.0'
    replicationFactor: 20
    refreshInterval: '1h'
  }
}
```

**Why this enables the vision:**

- Global peer discovery
- Decentralized (no single point of failure)
- Scalable to billions of DIDs
- Works offline (local cache)
- Upgradeable (can add better resolution later)

---

## 5. Query Federation Protocol

**Problem:** Queries only work on data the local peer has.

**What to build:**

```typescript
interface FederatedQuery {
  // Query planning
  interface QueryPlan {
    // Break query into sub-queries by data source
    subqueries: {
      source: DataSource       // Which peer/cluster has this data
      query: Query             // What to run there
      estimatedCost: number    // For optimization
    }[]

    // How to combine results
    aggregation: 'union' | 'join' | 'custom'
    customAggregator?: (results: Result[][]) => Result[]
  }

  // Query routing
  interface QueryRouter {
    // Determine which peers have relevant data
    findSources(query: Query): Promise<DataSource[]>

    // Route sub-query to appropriate peer
    route(subquery: Query, source: DataSource): Promise<Result[]>

    // Aggregate results
    aggregate(plan: QueryPlan, results: Result[][]): Result[]
  }

  // Wire protocol
  interface QueryProtocol {
    version: '1.0.0'
    messages: {
      QUERY_REQUEST: { queryId, query, auth }
      QUERY_RESPONSE: { queryId, results, hasMore, cursor }
      QUERY_ERROR: { queryId, error }
    }
  }
}
```

**Why this enables the vision:**

- Query across devices (phone + laptop)
- Query across team (my data + team data)
- Query across federation (my org + partner org)
- Query global namespace (public datasets)
- Enables distributed search engine

---

## 6. Role-Based Permissions

**Problem:** Per-user permission entries don't scale to organizations.

**What to build:**

```typescript
interface RoleBasedPermissions {
  // Groups
  interface Group {
    id: string                    // 'acme-corp/engineers'
    members: DID[]                // Direct members
    memberGroups: string[]        // Nested groups
    managedBy: DID[]              // Who can modify
  }

  // Roles
  interface Role {
    id: string                    // 'editor', 'viewer', 'admin'
    capabilities: Capability[]    // What this role can do
  }

  // Permission assignment (replaces per-user entries)
  interface PermissionGrant {
    principal: DID | GroupId      // User or group
    role: RoleId                  // Role to grant
    scope: ResourceScope          // Where it applies
    conditions?: Condition[]      // Optional constraints
  }

  // Inheritance
  interface PermissionInheritance {
    // Workspace permissions apply to all documents
    workspace: PermissionGrant[]

    // Document can override (restrict or expand)
    document: {
      inherit: boolean            // Default: true
      overrides: PermissionGrant[]
    }
  }
}
```

**Why this enables the vision:**

- Manage 10,000-person org with dozens of groups, not thousands of entries
- Permission changes propagate instantly
- CRDT documents stay small
- Familiar model (RBAC is industry standard)
- Enables enterprise compliance

---

## Implementation Order

### Week 1: Content Addressing

```
Day 1-2: Design content chunk format, hash algorithm choice (BLAKE3)
Day 3-4: Implement ContentResolver interface
Day 5:   Add Merkle tree construction for documents
```

**Deliverables:**

- `@xnetjs/crypto/hashing.ts` - BLAKE3 implementation
- `@xnetjs/core/content.ts` - ContentChunk, ContentTree types
- `docs/CONTENT_ADDRESSING.md` - Specification

### Week 2: Signed Updates + Snapshots

```
Day 1-2: Design SignedUpdate format with vector clocks
Day 3:   Implement update signing and verification
Day 4-5: Design and implement snapshot strategy
```

**Deliverables:**

- `@xnetjs/core/updates.ts` - SignedUpdate type + verification
- `@xnetjs/storage/snapshots.ts` - Snapshot creation/loading
- `docs/UPDATE_SIGNING.md` - Specification

### Week 3: DID Resolution

```
Day 1-2: Specify resolution protocol and bootstrap strategy
Day 3-4: Implement DHT integration with libp2p
Day 5:   Add caching and fallback strategies
```

**Deliverables:**

- `@xnetjs/network/resolution.ts` - DID resolver
- `@xnetjs/network/bootstrap.ts` - Bootstrap peer list
- `docs/DID_RESOLUTION.md` - Specification

### Week 4: Query Federation + Permissions

```
Day 1-2: Design query federation protocol
Day 3:   Implement query routing
Day 4-5: Implement role-based permission model
```

**Deliverables:**

- `@xnetjs/query/federation.ts` - Query router
- `@xnetjs/core/permissions.ts` - Role-based model
- `docs/QUERY_FEDERATION.md` - Specification
- `docs/PERMISSION_ROLES.md` - Specification

---

## Validation Criteria

Before starting Phase 1 implementation, verify:

### Content Addressing

- [ ] Can hash a 1MB file in < 10ms
- [ ] Can verify content matches CID
- [ ] Can construct Merkle tree for document
- [ ] CID format is compatible with IPFS (optional but nice)

### Snapshots

- [ ] Can create snapshot from 100k updates in < 5s
- [ ] Can load document from snapshot + 1k updates in < 100ms
- [ ] Snapshot size is < 2x raw state size
- [ ] Compaction reduces storage by > 50%

### Signed Updates

- [ ] Can verify 1000 updates/second
- [ ] Can detect fork within 10 updates
- [ ] Vector clocks correctly order concurrent updates
- [ ] Signatures verify across different platforms

### DID Resolution

- [ ] Can resolve DID in < 500ms (warm cache)
- [ ] Can resolve DID in < 5s (cold, via DHT)
- [ ] Works offline with cached data
- [ ] Handles bootstrap node failures gracefully

### Query Federation

- [ ] Can route query to correct peer
- [ ] Can aggregate results from 3+ sources
- [ ] Streaming results work for large result sets
- [ ] Errors from one source don't break entire query

### Permissions

- [ ] Can evaluate permission in < 1ms
- [ ] Group membership resolves transitively
- [ ] Inheritance works correctly
- [ ] UCAN tokens integrate with roles

---

## Risk Mitigation

### If we skip this work

| Skipped Foundation | What Breaks                   | When It Breaks         | Cost to Fix               |
| ------------------ | ----------------------------- | ---------------------- | ------------------------- |
| Content addressing | Can't verify data integrity   | Phase 2 (multi-device) | 2 months redesign         |
| Snapshots          | Mobile unusable, slow loads   | Phase 1 (10k+ docs)    | 1 month + migration       |
| Signed updates     | Can't audit, forks undetected | Phase 2 (teams)        | 2 months + data loss risk |
| DID resolution     | Can't find peers at scale     | Phase 2 (>100 users)   | 1 month                   |
| Query federation   | Queries limited to local      | Phase 2 (teams)        | 2 months                  |
| Role permissions   | Permission docs explode       | Phase 2 (orgs)         | 1 month + migration       |

**Total risk:** 4 weeks now vs. 9+ months later (plus migrations, data loss risk, user frustration)

---

## What's Already Good

The audit found these foundations are already well-designed:

- **DID + UCAN identity model** - Ready to implement
- **Protocol versioning framework** - Message envelopes with versions
- **Storage adapter pattern** - Multi-platform support
- **CRDT + versioning strategy** - Zero-migration architecture
- **Namespace hierarchy** - Clear xnet://DID/workspace/path model
- **Tiered federation model** - P2P → workspace → enterprise → global

These don't need changes - just implementation.

---

## Summary

| Category             | Status            | Action                       |
| -------------------- | ----------------- | ---------------------------- |
| Identity (DID/UCAN)  | ✅ Ready          | Implement as designed        |
| Protocol versioning  | ✅ Ready          | Implement as designed        |
| Storage abstraction  | ✅ Ready          | Implement as designed        |
| Content addressing   | 🔴 Missing        | Design + implement (Week 1)  |
| Snapshots/compaction | 🔴 Missing        | Design + implement (Week 2)  |
| Signed updates       | 🔴 Missing        | Design + implement (Week 2)  |
| DID resolution       | 🟡 Underspecified | Specify + implement (Week 3) |
| Query federation     | 🟡 Underspecified | Specify + implement (Week 4) |
| Role permissions     | 🟡 Underspecified | Specify + implement (Week 4) |

**4 weeks of foundation work enables the entire global vision.**

---

[← Back to Plan Overview](./README.md) | [Previous: Global Data Network](./16-global-data-network.md)
