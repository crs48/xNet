# 01: Phase 0 - Foundations

> Critical foundations that must be built before Phase 1 implementation

**Duration:** 4 weeks
**Risk if skipped:** 9+ months of rework later

## Overview

These foundations go into `@xnet/core` and are used by all other packages.

| Foundation         | Week | Deliverable                              |
| ------------------ | ---- | ---------------------------------------- |
| Content Addressing | 1    | BLAKE3 hashing, Merkle trees, CID format |
| Snapshots          | 2    | Snapshot strategy, compaction            |
| Signed Updates     | 2    | SignedUpdate type, verification          |
| DID Resolution     | 3    | Resolution protocol, bootstrap strategy  |
| Query Federation   | 4    | Query routing, aggregation               |
| Role Permissions   | 4    | RBAC model, inheritance                  |

---

## Week 1: Content Addressing

### Types to Implement

```typescript
// packages/core/src/content.ts

/**
 * A chunk of content with its hash
 */
export interface ContentChunk {
  data: Uint8Array
  hash: string // BLAKE3 hash
  size: number
}

/**
 * Content ID format: cid:blake3:{hash}
 */
export type ContentId = `cid:blake3:${string}`

/**
 * Merkle tree node for document structure
 */
export interface MerkleNode {
  hash: string
  children?: string[] // Child hashes (for non-leaf nodes)
  data?: Uint8Array // Chunk data (for leaf nodes)
}

/**
 * Complete content tree for a document
 */
export interface ContentTree {
  rootHash: string
  nodes: Map<string, MerkleNode>
}

/**
 * Content resolver interface
 */
export interface ContentResolver {
  /** Get content by CID */
  get(cid: ContentId): Promise<Uint8Array | null>

  /** Store content, returns CID */
  put(data: Uint8Array): Promise<ContentId>

  /** Verify content matches CID */
  verify(cid: ContentId, data: Uint8Array): boolean

  /** Build Merkle tree from chunks */
  buildTree(chunks: ContentChunk[]): ContentTree
}
```

### Implementation

```typescript
// packages/core/src/hashing.ts
import { blake3 } from '@noble/hashes/blake3'

export function hashContent(data: Uint8Array): string {
  const hash = blake3(data)
  return Buffer.from(hash).toString('hex')
}

export function createContentId(hash: string): ContentId {
  return `cid:blake3:${hash}`
}

export function parseContentId(cid: ContentId): string {
  const match = cid.match(/^cid:blake3:([a-f0-9]+)$/)
  if (!match) throw new Error(`Invalid CID: ${cid}`)
  return match[1]
}

export function verifyContent(cid: ContentId, data: Uint8Array): boolean {
  const expectedHash = parseContentId(cid)
  const actualHash = hashContent(data)
  return expectedHash === actualHash
}
```

### Tests

```typescript
// packages/core/src/hashing.test.ts
import { describe, it, expect } from 'vitest'
import { hashContent, createContentId, verifyContent } from './hashing'

describe('Content Addressing', () => {
  it('should hash content deterministically', () => {
    const data = new TextEncoder().encode('hello world')
    const hash1 = hashContent(data)
    const hash2 = hashContent(data)
    expect(hash1).toBe(hash2)
  })

  it('should create valid CID', () => {
    const data = new TextEncoder().encode('test')
    const hash = hashContent(data)
    const cid = createContentId(hash)
    expect(cid).toMatch(/^cid:blake3:[a-f0-9]+$/)
  })

  it('should verify content matches CID', () => {
    const data = new TextEncoder().encode('test data')
    const hash = hashContent(data)
    const cid = createContentId(hash)
    expect(verifyContent(cid, data)).toBe(true)
  })

  it('should reject tampered content', () => {
    const data = new TextEncoder().encode('original')
    const hash = hashContent(data)
    const cid = createContentId(hash)
    const tampered = new TextEncoder().encode('modified')
    expect(verifyContent(cid, tampered)).toBe(false)
  })

  it('should hash 1MB in < 10ms', () => {
    const data = new Uint8Array(1024 * 1024) // 1MB
    const start = performance.now()
    hashContent(data)
    const elapsed = performance.now() - start
    expect(elapsed).toBeLessThan(10)
  })
})
```

---

## Week 2: Snapshots & Signed Updates

### Snapshot Types

```typescript
// packages/core/src/snapshots.ts

export interface SnapshotTriggers {
  updateCount: number // e.g., 10000
  timeInterval: number // e.g., 24 * 60 * 60 * 1000 (24h)
  storagePressure: number // e.g., 0.8 (80%)
}

export interface Snapshot {
  id: string
  documentId: string
  stateVector: Uint8Array // Which updates are included
  compressedState: Uint8Array // Full CRDT state, compressed
  timestamp: number
  creatorDID: string
  signature: Uint8Array
  contentId: ContentId // CID of the snapshot
}

export interface DocumentLoad {
  snapshot?: Snapshot
  updatesSinceSnapshot: SignedUpdate[]
}

export function shouldCreateSnapshot(
  updateCount: number,
  lastSnapshotTime: number,
  storageUsed: number,
  storageTotal: number,
  triggers: SnapshotTriggers
): boolean {
  if (updateCount >= triggers.updateCount) return true
  if (Date.now() - lastSnapshotTime >= triggers.timeInterval) return true
  if (storageUsed / storageTotal >= triggers.storagePressure) return true
  return false
}
```

### Signed Update Types

```typescript
// packages/core/src/updates.ts

export interface VectorClock {
  [peerId: string]: number
}

export interface SignedUpdate {
  // CRDT payload
  update: Uint8Array

  // Chain linkage
  parentHash: string // Hash of previous update (or snapshot)
  updateHash: string // Hash of this update

  // Attribution
  authorDID: string
  signature: Uint8Array
  timestamp: number // Logical clock

  // Ordering
  vectorClock: VectorClock
}

export interface Fork {
  commonAncestor: string
  branch1: SignedUpdate[]
  branch2: SignedUpdate[]
}
```

### Update Verification

```typescript
// packages/core/src/verification.ts

export interface UpdateVerifier {
  /** Verify update signature and chain linkage */
  verify(update: SignedUpdate, publicKey: Uint8Array): boolean

  /** Detect forks in update chain */
  detectFork(updates: SignedUpdate[]): Fork | null

  /** Check vector clock progression */
  isValidProgression(prev: VectorClock, next: VectorClock, authorId: string): boolean
}

export function verifyUpdateChain(
  updates: SignedUpdate[],
  getPublicKey: (did: string) => Promise<Uint8Array>
): Promise<{ valid: boolean; errors: string[] }> {
  // Implementation in @xnet/crypto
}
```

### Tests

```typescript
// packages/core/src/snapshots.test.ts
import { describe, it, expect } from 'vitest'
import { shouldCreateSnapshot } from './snapshots'

describe('Snapshots', () => {
  const triggers = {
    updateCount: 10000,
    timeInterval: 24 * 60 * 60 * 1000,
    storagePressure: 0.8
  }

  it('should trigger on update count', () => {
    expect(shouldCreateSnapshot(10000, Date.now(), 0, 100, triggers)).toBe(true)
    expect(shouldCreateSnapshot(9999, Date.now(), 0, 100, triggers)).toBe(false)
  })

  it('should trigger on time interval', () => {
    const old = Date.now() - 25 * 60 * 60 * 1000 // 25 hours ago
    expect(shouldCreateSnapshot(0, old, 0, 100, triggers)).toBe(true)
  })

  it('should trigger on storage pressure', () => {
    expect(shouldCreateSnapshot(0, Date.now(), 85, 100, triggers)).toBe(true)
    expect(shouldCreateSnapshot(0, Date.now(), 70, 100, triggers)).toBe(false)
  })
})
```

---

## Week 3: DID Resolution

### Types

```typescript
// packages/core/src/resolution.ts

export interface PeerLocation {
  multiaddr: string // e.g., '/ip4/1.2.3.4/tcp/4001/p2p/12D3...'
  lastSeen: number
  latency?: number
}

export interface DIDResolution {
  did: string
  publicKey: Uint8Array
  locations: PeerLocation[]
  lastUpdated: number
}

export type ResolutionStrategy = 'local-cache' | 'connected-peers' | 'dht' | 'bootstrap'

export interface DIDResolver {
  /** Resolve DID to locations and public key */
  resolve(did: string): Promise<DIDResolution | null>

  /** Publish own location */
  publish(did: string, locations: PeerLocation[]): Promise<void>

  /** Check cache without network */
  getCached(did: string): DIDResolution | null
}

export const BOOTSTRAP_PEERS = [
  '/dns4/bootstrap1.xnet.io/tcp/4001/p2p/12D3KooW...',
  '/dns4/bootstrap2.xnet.io/tcp/4001/p2p/12D3KooW...'
  // Placeholder - real peers added at deployment
] as const

export const DHT_CONFIG = {
  protocol: '/xnet/kad/1.0.0',
  replicationFactor: 20,
  refreshInterval: 60 * 60 * 1000 // 1 hour
} as const
```

---

## Week 4: Query Federation & Permissions

### Query Federation Types

```typescript
// packages/core/src/federation.ts

export interface DataSource {
  type: 'local' | 'peer' | 'cluster'
  id: string
  estimatedLatency: number
}

export interface SubQuery {
  source: DataSource
  query: Query
  estimatedCost: number
}

export interface QueryPlan {
  subqueries: SubQuery[]
  aggregation: 'union' | 'join' | 'custom'
  customAggregator?: (results: unknown[][]) => unknown[]
}

export interface QueryRouter {
  /** Find which sources have relevant data */
  findSources(query: Query): Promise<DataSource[]>

  /** Route query to source */
  route(query: Query, source: DataSource): Promise<unknown[]>

  /** Aggregate results from multiple sources */
  aggregate(plan: QueryPlan, results: unknown[][]): unknown[]
}

// Wire protocol messages
export interface QueryRequest {
  queryId: string
  query: Query
  auth: string // UCAN token
}

export interface QueryResponse {
  queryId: string
  results: unknown[]
  hasMore: boolean
  cursor?: string
}
```

### Permission Types

```typescript
// packages/core/src/permissions.ts

export interface Group {
  id: string // e.g., 'acme-corp/engineers'
  members: string[] // DIDs of direct members
  memberGroups: string[] // Nested group IDs
  managedBy: string[] // DIDs who can modify
}

export interface Role {
  id: string // e.g., 'editor', 'viewer', 'admin'
  capabilities: Capability[]
}

export type Capability = 'read' | 'write' | 'delete' | 'share' | 'admin'

export interface PermissionGrant {
  principal: string // DID or group ID
  role: string // Role ID
  scope: ResourceScope
  conditions?: Condition[]
}

export interface ResourceScope {
  type: 'workspace' | 'document' | 'block'
  id: string
}

export interface Condition {
  type: 'time' | 'ip' | 'device'
  value: unknown
}

export interface PermissionEvaluator {
  /** Check if DID has capability on resource */
  hasCapability(did: string, capability: Capability, resource: ResourceScope): Promise<boolean>

  /** Resolve group membership (including nested) */
  resolveGroups(did: string): Promise<string[]>

  /** Get effective permissions for DID */
  getPermissions(did: string, resource: ResourceScope): Promise<Capability[]>
}
```

---

## Validation Criteria

Before proceeding to Phase 1, verify:

### Content Addressing

- [ ] Hash 1MB file in < 10ms
- [ ] Verify content matches CID
- [ ] Construct Merkle tree for document
- [ ] All hashing tests pass

### Snapshots

- [ ] Create snapshot from 100k updates in < 5s
- [ ] Load document from snapshot + 1k updates in < 100ms
- [ ] Snapshot size < 2x raw state
- [ ] Compaction reduces storage by > 50%

### Signed Updates

- [ ] Verify 1000 updates/second
- [ ] Detect fork within 10 updates
- [ ] Vector clocks order concurrent updates
- [ ] Signatures verify cross-platform

### DID Resolution

- [ ] Resolve DID in < 500ms (warm cache)
- [ ] Resolve DID in < 5s (cold, via DHT)
- [ ] Works offline with cached data
- [ ] Handles bootstrap node failures

### Query Federation

- [ ] Route query to correct peer
- [ ] Aggregate results from 3+ sources
- [ ] Streaming works for large results
- [ ] One source error doesn't break query

### Permissions

- [ ] Evaluate permission in < 1ms
- [ ] Group membership resolves transitively
- [ ] Inheritance works correctly
- [ ] UCAN tokens integrate with roles

## Deliverables

After Week 4, you should have:

```
packages/core/src/
├── index.ts           # Public exports
├── content.ts         # Content addressing types
├── hashing.ts         # BLAKE3 implementation
├── hashing.test.ts    # Hashing tests
├── snapshots.ts       # Snapshot types and logic
├── snapshots.test.ts  # Snapshot tests
├── updates.ts         # SignedUpdate types
├── verification.ts    # Update verification
├── resolution.ts      # DID resolution types
├── federation.ts      # Query federation types
├── permissions.ts     # Permission types
└── permissions.test.ts
```

## Next Step

Proceed to [02-xnet-crypto.md](./02-xnet-crypto.md)
