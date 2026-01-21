# Architecture Tradeoffs

Decisions made during development with rationale and future optimization paths.

---

## 1. Tabular Data Storage: JSON Properties vs. Normalized Columns

**Date:** January 2026  
**Decision:** Store record properties as JSON blob in SQLite

### Options Considered

| Option             | Description                          | Pros                                                 | Cons                                                  |
| ------------------ | ------------------------------------ | ---------------------------------------------------- | ----------------------------------------------------- |
| **JSON blob**      | `properties JSON NOT NULL`           | Schema-less, simple CRUD, no migrations              | Slower queries via `json_extract()`, limited indexing |
| **EAV**            | Separate `record_values` table       | Can index specific properties, type-specific columns | Complex queries, more JOINs, more storage             |
| **Hybrid**         | JSON + generated columns             | Flexibility + indexed access where needed            | SQLite generated column limitations                   |
| **Dynamic schema** | Per-database tables with ALTER TABLE | Full SQL power, most efficient                       | DDL at runtime, migration complexity, sync issues     |

### Decision: JSON Blob

```sql
CREATE TABLE record_items (
  id TEXT PRIMARY KEY,
  database_id TEXT NOT NULL,
  properties JSON NOT NULL,
  created_at INTEGER,
  updated_at INTEGER
);
```

### Rationale

1. **MVP simplicity** - JSON is good enough for <10k items per database
2. **Defer optimization** - Add materialized views when we see real bottlenecks
3. **Sync-friendly** - JSON blob syncs easily, no schema coordination needed
4. **SQLite is fast** - `json_extract()` on 10k rows is still <10ms

### Future Optimization Paths

| Trigger                                 | Solution                                                                                         |
| --------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Frequent filtering by specific property | Add partial index: `CREATE INDEX idx ON record_items(json_extract(properties, '$.prop_status'))` |
| Calendar/timeline views slow            | Materialized view with date columns extracted                                                    |
| Cross-database relations                | Separate `record_relations` table with proper indexes                                            |
| >100k items in one database             | Consider EAV or dynamic schema migration                                                         |

---

## 2. CRDT Strategy: Yjs for Rich Text, Event Sourcing for Records

**Date:** January 2026  
**Decision:** Use different sync strategies for different data types

### Options Considered

| Option                            | Description                                   | Pros                               | Cons                                     |
| --------------------------------- | --------------------------------------------- | ---------------------------------- | ---------------------------------------- |
| **Yjs for everything**            | Embed records in Y.Map structures             | Single sync mechanism, proven CRDT | Poor fit for tabular data, scales poorly |
| **Event sourcing for everything** | Append-only log with LWW                      | Simple, uniform                    | Loses Yjs rich text benefits             |
| **Hybrid**                        | Yjs for rich text, event sourcing for records | Best tool for each job             | Two sync mechanisms to maintain          |

### Decision: Hybrid

- **Rich text documents:** Yjs (Y.Doc with Y.XmlFragment)
- **Tabular records:** Event-sourced append-only log with LWW conflict resolution

### Rationale

1. **Different conflict semantics** - Rich text needs character-level CRDT; tabular data is fine with field-level LWW
2. **Different scale patterns** - Documents are <100KB; databases can have millions of items
3. **Yjs overhead** - Storing 10k records as nested Y.Maps creates excessive metadata
4. **Simpler mental model** - Records sync like database replication, documents sync like collaborative editing

### Implementation

```typescript
// Rich text: Yjs CRDT
const doc = new Y.Doc()
const content = doc.getXmlFragment('content')

// Records: Event-sourced operations
interface UpdateItemOperation {
  type: 'update-item'
  itemId: ItemId
  changes: Record<PropertyId, PropertyValue>
  timestamp: number // LWW uses this
  authorDID: DID
}
```

---

## 3. Signaling Protocol: y-webrtc Compatible

**Date:** January 2026  
**Decision:** Make our signaling server compatible with y-webrtc's protocol

### Options Considered

| Option                | Description                        | Pros                        | Cons                                  |
| --------------------- | ---------------------------------- | --------------------------- | ------------------------------------- |
| **Custom protocol**   | Our own join/leave/signal messages | Full control                | Incompatible with y-webrtc, more code |
| **y-webrtc protocol** | subscribe/publish/unsubscribe      | Works with existing library | Locked into their design              |
| **Both**              | Support both protocols             | Maximum compatibility       | More complexity                       |

### Decision: y-webrtc Protocol

```typescript
// Server handles these message types:
{ type: 'subscribe', topics: ['room1'] }
{ type: 'publish', topic: 'room1', data: {...} }
{ type: 'unsubscribe', topics: ['room1'] }
```

### Rationale

1. **y-webrtc already works** - Battle-tested WebRTC + Yjs integration
2. **No custom client code** - Use the library as-is
3. **Can extend later** - Add custom messages alongside if needed

### Future Considerations

- May need custom protocol for record sync (non-Yjs data)
- Could add authentication layer on top of pub/sub

---

## 4. P2P Sync: WebRTC via Signaling Server

**Date:** January 2026  
**Decision:** Use WebRTC with centralized signaling, not pure DHT

### Options Considered

| Option                 | Description                           | Pros                               | Cons                                        |
| ---------------------- | ------------------------------------- | ---------------------------------- | ------------------------------------------- |
| **Pure DHT**           | Kademlia for peer discovery           | Fully decentralized                | Slow discovery, NAT issues                  |
| **Signaling + WebRTC** | Central signaling, P2P data           | Fast discovery, direct connections | Signaling server is single point of failure |
| **Hybrid**             | Signaling for speed, DHT for fallback | Best of both                       | More complexity                             |

### Decision: Signaling + WebRTC (with future DHT)

### Rationale

1. **Speed** - Signaling server finds peers in <100ms; DHT can take seconds
2. **Reliability** - WebRTC handles NAT traversal well with STUN/TURN
3. **Simplicity** - One moving part to start
4. **Decentralization later** - DHT can be added for resilience

### Infrastructure

- 3 signaling servers (US-West, US-East, EU) for redundancy
- TURN servers for NAT traversal fallback
- Bootstrap nodes for DHT (future)

---

## 5. Storage Adapter: Platform-Specific Implementations

**Date:** January 2026  
**Decision:** SQLite for native, IndexedDB/OPFS for web

### Options Considered

| Option                   | Description                       | Pros                          | Cons                           |
| ------------------------ | --------------------------------- | ----------------------------- | ------------------------------ |
| **IndexedDB everywhere** | Browser API, polyfilled on native | Single implementation         | Poor durability, eviction risk |
| **SQLite everywhere**    | sql.js/wa-sqlite for web          | Consistent behavior           | WASM overhead in browser       |
| **Platform-specific**    | SQLite native, IDB/OPFS web       | Best performance per platform | Multiple implementations       |

### Decision: Platform-Specific

| Platform                 | Storage            | Durability |
| ------------------------ | ------------------ | ---------- |
| Desktop (Electron/Tauri) | SQLite             | HIGH       |
| Mobile (iOS/Android)     | SQLite             | HIGH       |
| Web (modern)             | OPFS + SQLite WASM | MEDIUM     |
| Web (legacy)             | IndexedDB          | LOW        |

### Rationale

1. **Native SQLite is unbeatable** - ACID, crash-safe, fast
2. **Web storage is risky** - Browser can evict data anytime
3. **Abstract via StorageAdapter** - Same API, different implementations

### Mitigation for Web

- Request persistent storage
- Show warnings about data durability
- Encourage P2P sync to other devices
- Easy export/import for backups

---

## 6. Transaction Batching: Logical Atomicity via Batch Metadata

**Date:** January 2026  
**Decision:** Add optional batch fields to Change<T> for grouping related changes

### Options Considered

| Option               | Description                         | Pros                        | Cons                                    |
| -------------------- | ----------------------------------- | --------------------------- | --------------------------------------- |
| **No transactions**  | Each change is independent          | Simplest                    | Multi-node operations have no atomicity |
| **Nested CRDTs**     | Use Yjs transactions                | Native CRDT support         | Doesn't work for event-sourced data     |
| **Batch metadata**   | Add batchId/index/size to Change<T> | Backward compatible, simple | Not true ACID (eventual consistency)    |
| **Blockchain-style** | Merkle root of batch                | Cryptographically atomic    | Complex, overkill for now               |

### Decision: Batch Metadata

```typescript
interface Change<T> {
  // ... existing fields ...

  // Optional batch metadata
  batchId?: string // Groups changes together
  batchIndex?: number // Order within batch (0, 1, 2...)
  batchSize?: number // Total changes in batch
}
```

### Rationale

1. **Backward compatible** - Old changes without batch fields still work
2. **Undo/redo friendly** - Group related changes for atomic undo
3. **Audit trail clarity** - "User moved task" is one batch, not 3 separate changes
4. **Blockchain-ready** - Batches map naturally to transactions when we add consensus

### Usage

```typescript
// Move task between projects (3 related changes as one transaction)
const result = await store.transaction([
  { type: 'update', nodeId: task.id, options: { properties: { projectId: newProject.id } } },
  { type: 'update', nodeId: oldProject.id, options: { properties: { taskIds: [...] } } },
  { type: 'update', nodeId: newProject.id, options: { properties: { taskIds: [...] } } },
])

// All changes share same batchId and Lamport timestamp
console.log(result.batchId) // "batch-m3x7k-a9b2c"
console.log(result.changes.map(c => c.batchIndex)) // [0, 1, 2]
```

### Semantics

- **Same Lamport timestamp** - All changes in a batch share one timestamp
- **Ordered** - batchIndex defines order within the batch
- **Logical atomicity** - UI/undo treats batch as single operation
- **Eventual consistency** - Not ACID; peers may see partial batches temporarily

### Future Considerations

- Receivers could wait for all batchSize changes before committing
- Blockchain integration: batch hash becomes transaction ID
- Conflict resolution could consider batch boundaries

---

## 7. Ordering: Lamport Timestamps vs Vector Clocks

**Date:** January 2026  
**Decision:** Use Lamport timestamps with author DID for total ordering

### Options Considered

| Option             | Description                            | Pros                                       | Cons                                  |
| ------------------ | -------------------------------------- | ------------------------------------------ | ------------------------------------- |
| **Vector clocks**  | Map of {nodeId → counter} per change   | Detects concurrent events, causal ordering | Size grows with participants, complex |
| **Lamport clocks** | Single integer, max(local, received)+1 | Constant size, simple, total ordering      | Cannot detect concurrency             |
| **Hybrid Logical** | Lamport + physical time                | Bounded drift, better ordering             | More complex, clock sync issues       |

### Decision: Lamport + Author DID

```typescript
interface Change<T> {
  clock: number // Lamport timestamp
  authorDID: string // Tie-breaker for same clock
  // ...
}
// Ordering: (clock ASC, authorDID ASC)
```

### Rationale

1. **CRDTs don't need concurrency detection** - They need deterministic merge order
2. **Constant size** - Single integer vs map that grows with every participant
3. **No coordination** - Just `max(local, received) + 1`
4. **Deterministic tie-breaking** - Author DID provides total order when clocks match

---

## 8. Data Model: Minimal Universal Node

**Date:** January 2026  
**Decision:** Node has only 4 universal fields; everything else is schema-defined

### Options Considered

| Option                | Description                              | Pros                    | Cons                                   |
| --------------------- | ---------------------------------------- | ----------------------- | -------------------------------------- |
| **Feature-rich base** | Many built-in fields (updatedAt, parent) | Less schema boilerplate | Assumptions may not fit all use cases  |
| **Minimal base**      | Only essential provenance fields         | Maximum flexibility     | Common patterns need schema repetition |

### Decision: Minimal Base

```typescript
interface Node {
  id: string // Unique identifier
  schemaId: string // What type of node
  createdAt: number // Provenance
  createdBy: string // Provenance (DID)
  // Everything else via schema.properties
}
```

### Rationale

1. **P2P provenance is essential** - Must know who created what, when
2. **Everything else varies** - Not all nodes need updatedAt, parentId, etc.
3. **Clean JSON-LD export** - No internal clutter in exported data
4. **Schema flexibility** - User-defined types aren't constrained by base assumptions

---

## 9. Schemas: Code-First with TypeScript Inference

**Date:** January 2026  
**Decision:** Use `defineSchema()` with inference instead of code generation

### Options Considered

| Option              | Description                         | Pros                              | Cons                             |
| ------------------- | ----------------------------------- | --------------------------------- | -------------------------------- |
| **Code generation** | JSON schema → TypeScript types      | Full control over generated types | Build step required, sync issues |
| **Code-first**      | TypeScript → inferred types         | No build step, co-located         | Less control over exact types    |
| **Runtime only**    | No static types, runtime validation | Simplest                          | No IDE support, runtime errors   |

### Decision: Code-First

```typescript
const TaskSchema = defineSchema({
  name: 'Task',
  namespace: 'myapp://',
  properties: {
    title: text({ required: true }),
    status: select({ options: [...] as const })
  }
})

// Types inferred automatically
type Task = InferNode<typeof TaskSchema>
// { id, schemaId, title: string, status: 'todo' | 'done', ... }
```

### Rationale

1. **TypeScript inference is "good enough"** - Covers 95% of use cases
2. **No build step** - Schemas work immediately
3. **Co-located validation** - Schema and runtime checks in one place
4. **IDE support** - Autocomplete, type errors without generators

---

## 10. Append-Only Log with Materialization

**Date:** January 2026  
**Decision:** Never delete from the change log; append tombstones, materialize current state

### Options Considered

| Option             | Description                         | Pros                          | Cons                        |
| ------------------ | ----------------------------------- | ----------------------------- | --------------------------- |
| **Mutable state**  | Update/delete records directly      | Simpler reads, less storage   | No history, complex sync    |
| **Append-only**    | Only add changes, materialize views | Full audit trail, simple sync | More storage, complex reads |
| **Event sourcing** | Append-only with snapshots          | History + read performance    | More complexity             |

### Decision: Append-Only with Materialization

```
Change Log (append-only):
  [t1] CREATE node-1 {title: "Draft"}
  [t2] UPDATE node-1 {title: "Final"}
  [t3] DELETE node-1  (tombstone)

Materialized View (computed):
  node-1: DELETED (hidden from queries)
```

### Rationale

1. **Sync is trivial** - Just replicate the log
2. **Complete audit trail** - Who changed what, when
3. **Easy undo** - Reverse changes from the log
4. **Conflict resolution** - Timestamps determine winner

### Future: Compaction

- Old changes can be compacted into snapshots
- Tombstones can be GC'd after retention period
- Per-node "snapshot at clock X" reduces replay cost

---

## 11. Identity: DID:key Only

**Date:** January 2026  
**Decision:** Support only `did:key` method, not did:web, did:ion, etc.

### Options Considered

| Option               | Description                        | Pros                            | Cons                             |
| -------------------- | ---------------------------------- | ------------------------------- | -------------------------------- |
| **Multiple methods** | did:key, did:web, did:ion, etc.    | Maximum interop                 | Complex resolution, dependencies |
| **did:key only**     | Self-certifying key-based identity | Offline, simple, self-contained | Key rotation = identity change   |
| **did:web**          | DNS-based identity                 | Human-readable                  | Requires DNS, not offline        |

### Decision: did:key Only

```typescript
// Identity IS the public key
const did = 'did:key:z6Mkf5rGMoatrSj1f4CyvuHBeXJELe9RPdzo2PKGNCKVtZxP'

// No resolution needed - key is embedded in the DID
const publicKey = extractPublicKey(did)
```

### Rationale

1. **Self-certifying** - The key IS the identity, no lookup needed
2. **Offline-first** - Works without any network
3. **Simple implementation** - No DID resolution infrastructure
4. **Future extensible** - Can add other methods later

### Tradeoff Acknowledged

- Key compromise = identity compromise (no rotation without new identity)
- Mitigation: UCAN delegation allows revoking sub-keys

---

## 12. Authorization: UCAN over JWT/OAuth

**Date:** January 2026  
**Decision:** Use UCAN tokens for authorization, not traditional JWT/OAuth

### Options Considered

| Option    | Description                   | Pros                      | Cons                                |
| --------- | ----------------------------- | ------------------------- | ----------------------------------- |
| **JWT**   | Server-signed tokens          | Well understood, tooling  | Requires auth server, no delegation |
| **OAuth** | Delegated authorization flows | Standard, SSO support     | Complex, centralized                |
| **UCAN**  | User-signed capability tokens | P2P, delegatable, offline | Newer, less tooling                 |

### Decision: UCAN

```typescript
// Alice grants Bob read access to her documents
const ucan = await createUCAN({
  issuer: aliceKey,
  audience: bobDID,
  capabilities: [
    {
      with: 'xnet://alice.did/documents/*',
      can: 'read'
    }
  ],
  expiration: Date.now() + 86400000
})

// Bob can further delegate to Carol (if allowed)
const delegated = await delegateUCAN(ucan, {
  audience: carolDID,
  capabilities: [
    /* subset of Bob's capabilities */
  ]
})
```

### Rationale

1. **P2P compatible** - No central auth server needed
2. **Delegatable** - Users can grant others specific rights
3. **Self-contained** - Token carries proof of authorization chain
4. **Capability-based** - Fine-grained "can do X on resource Y"

### Tradeoff Acknowledged

- Token size grows with delegation chain
- No established revocation (must use expiration + blocklists)

---

## 13. Cryptography: BLAKE3 and Ed25519

**Date:** January 2026  
**Decision:** BLAKE3 for hashing, Ed25519 for signatures

### Options Considered

**Hashing:**

| Option      | Description          | Pros                          | Cons                      |
| ----------- | -------------------- | ----------------------------- | ------------------------- |
| **SHA-256** | NIST standard        | Universal support, compliance | Slower                    |
| **BLAKE3**  | Modern hash function | 10x faster, parallelizable    | Newer, less battle-tested |

**Signing:**

| Option      | Description       | Pros                         | Cons                  |
| ----------- | ----------------- | ---------------------------- | --------------------- |
| **RSA**     | Classic algorithm | Universal, key size options  | Large keys/signatures |
| **ECDSA**   | Elliptic curve    | Smaller than RSA             | Requires random nonce |
| **Ed25519** | Edwards curve     | Fast, deterministic, compact | Single key size       |

### Decision: BLAKE3 + Ed25519

```typescript
import { blake3 } from '@xnet/crypto'
import { sign, verify } from '@xnet/crypto'

const hash = blake3(content) // 32 bytes
const signature = sign(hash, privateKey) // 64 bytes
const valid = verify(hash, signature, publicKey)
```

### Rationale

1. **Performance** - BLAKE3 is 10x faster than SHA-256; Ed25519 signs 1000+/sec
2. **Compact** - 32-byte hashes, 64-byte signatures, 32-byte keys
3. **Deterministic** - Ed25519 doesn't need random nonces (no RNG bugs)
4. **DID:key native** - Ed25519 is the default for did:key

### Tradeoff Acknowledged

- Not NIST/FIPS approved (matters for some compliance)
- Single algorithm (no "algorithm agility")

---

## 14. Telemetry: Opt-In with Progressive Tiers

**Date:** January 2026  
**Decision:** Zero telemetry by default; explicit opt-in with 5 progressive tiers

### Options Considered

| Option            | Description                      | Pros                      | Cons                         |
| ----------------- | -------------------------------- | ------------------------- | ---------------------------- |
| **Opt-out**       | Collect by default, allow off    | More data for improvement | Privacy concerns, trust loss |
| **Opt-in**        | Off by default, explicit consent | Maximum trust             | Much less data               |
| **Tiered opt-in** | Multiple levels of sharing       | User controls granularity | More complex UI              |

### Decision: Tiered Opt-In

```
Tier 0: OFF (default) - No data collection
Tier 1: ANONYMOUS     - Crash reports only (no identifiers)
Tier 2: BASIC         - Anonymous usage patterns (bucketed)
Tier 3: STANDARD      - Session-level analytics (pseudonymous)
Tier 4: FULL          - Detailed diagnostics (support cases)
```

### Rationale

1. **User sovereignty** - Decentralized infrastructure demands user control
2. **Trust building** - Earn data access through transparency
3. **GDPR-friendly** - Consent is explicit and granular
4. **Inspectable** - Users can see exactly what's collected per tier

### Tradeoff Acknowledged

- Users rarely opt-in → much less improvement data
- Harder to diagnose issues without telemetry

---

## 15. Privacy: P3A-Style Bucketed Reporting

**Date:** January 2026  
**Decision:** Report bucketed ranges, not exact values

### Options Considered

| Option           | Description                 | Pros                 | Cons                    |
| ---------------- | --------------------------- | -------------------- | ----------------------- |
| **Exact values** | Report actual counts/times  | Precise analytics    | Privacy risk            |
| **Bucketed**     | Report ranges (e.g., "1-5") | Privacy-preserving   | Less precise            |
| **Differential** | Add noise to values         | Mathematical privacy | Complex, less intuitive |

### Decision: Bucketing (Brave P3A-inspired)

```typescript
// Instead of: { documentsCreated: 7 }
// Report:     { documentsCreated: "6-10" }

const buckets = {
  documents: [0, 1, '2-5', '6-10', '11-25', '26-50', '51+'],
  peers: [0, 1, '2-3', '4-7', '8-15', '16+']
}

// Random delay before sending (1-24 hours)
// Prevents timing correlation
```

### Rationale

1. **No exact behavior revealed** - Can't identify specific users
2. **Still useful for trends** - Know if feature is popular
3. **Simple to implement** - No cryptographic complexity
4. **Plausible deniability** - Users in same bucket are indistinguishable

---

## 16. Network Security: Local-First Peer Scoring

**Date:** January 2026  
**Decision:** Each node protects itself with local rate limiting and peer scoring

### Options Considered

| Option                 | Description                      | Pros                     | Cons                    |
| ---------------------- | -------------------------------- | ------------------------ | ----------------------- |
| **Centralized**        | Firewall/WAF at signaling server | Single enforcement point | Single point of failure |
| **Reputation service** | Shared blocklist across network  | Coordinated defense      | Centralization, gaming  |
| **Local-first**        | Each peer scores and throttles   | Decentralized, resilient | No shared intelligence  |

### Decision: Local-First (GossipSub-inspired)

```typescript
interface PeerScore {
  peerId: string
  score: number // -100 to +100
  messageRate: number // Messages per minute
  invalidMessages: number
  lastSeen: number
}

// Behaviors affect score:
// - Valid sync messages: +1
// - Invalid/malformed: -10
// - Excessive rate: -5
// - Connection stability: +/- based on uptime

// Actions based on score:
// score < -50: disconnect, temp block
// score < 0: throttle, deprioritize
// score > 50: trust for relay
```

### Rationale

1. **No central authority** - Fits decentralized architecture
2. **Works offline** - Local decisions, no lookup needed
3. **Progressive enforcement** - Throttle before block
4. **Inspired by proven system** - libp2p GossipSub v1.1

### Future: Shared Reputation

- Optional: publish bad peer proofs to network
- Peers can choose whether to trust others' assessments

---

## 17. React API: Schema-First Hooks with FlatNode

**Date:** January 2026  
**Decision:** Hooks take Schema parameter; return flattened properties

### Options Considered

**Hook signature:**

| Option           | Description                    | Pros             | Cons           |
| ---------------- | ------------------------------ | ---------------- | -------------- |
| **Generic CRUD** | `useNode(id)` returns any type | Simple API       | No type safety |
| **Schema-first** | `useQuery(TaskSchema)` infers  | Full type safety | More verbose   |

**Property access:**

| Option        | Description               | Pros                 | Cons                   |
| ------------- | ------------------------- | -------------------- | ---------------------- |
| **Nested**    | `node.properties.title`   | Explicit structure   | Verbose, needs casting |
| **Flattened** | `data.title` via FlatNode | Clean, direct access | Name collision risk    |

### Decision: Schema-First + FlatNode

```typescript
// Schema provides type inference
const { data: tasks } = useQuery(TaskSchema)
//      ^-- tasks: FlatNode<TaskSchema>[]

// Properties flattened to top level
tasks[0].title // string (typed!)
tasks[0].status // 'todo' | 'done' (typed!)

// Instead of:
tasks[0].properties.title as string // old pattern
```

### Rationale

1. **Type safety is worth verbosity** - Catch errors at compile time
2. **IDE autocomplete** - Schema types flow through
3. **Cleaner components** - `task.title` not `task.properties.title`
4. **Collision handled** - Reserved fields (id, schemaId) preserved

---

## 18. Computed Properties: Read-Time Evaluation

**Date:** January 2026  
**Decision:** Formula/rollup properties computed on read, never stored

### Options Considered

| Option        | Description                       | Pros                         | Cons                          |
| ------------- | --------------------------------- | ---------------------------- | ----------------------------- |
| **Stored**    | Compute and persist value         | Fast reads                   | Sync complexity, stale data   |
| **Read-time** | Compute on every access           | Always fresh, no sync issues | Slower reads, repeated work   |
| **Cached**    | Compute + cache with invalidation | Balance of both              | Cache invalidation complexity |

### Decision: Read-Time

```typescript
// Schema definition
const ProjectSchema = defineSchema({
  properties: {
    tasks: relation({ target: TaskSchema }),
    // Computed at read time, not stored
    taskCount: rollup({ relation: 'tasks', aggregate: 'count' }),
    progress: formula({
      compute: (node) => node.completedTasks / node.taskCount
    })
  }
})

// Every read computes fresh
const project = await store.get(projectId)
console.log(project.taskCount) // Computed now
console.log(project.progress) // Computed now
```

### Rationale

1. **No sync complexity** - Computed values don't need to sync
2. **Always consistent** - Can't have stale rollup counts
3. **Simpler model** - Only real data in the change log
4. **Optimization later** - Add caching when we see bottlenecks

### Future: Materialized Views

- For expensive computations, add optional caching
- Invalidate on relevant change events
- User-controlled: `{ cache: true, ttl: 60000 }`

---

## Template for Future Decisions

```markdown
## N. [Decision Title]

**Date:** [When decided]  
**Decision:** [One-line summary]

### Options Considered

| Option | Description | Pros | Cons |
| ------ | ----------- | ---- | ---- |
| ...    | ...         | ...  | ...  |

### Decision: [Chosen option]

### Rationale

1. ...
2. ...

### Future Optimization Paths

- ...
```

---

_Last updated: January 2026_

---

## Summary Table

| #   | Category      | Decision                    | Key Tradeoff                            |
| --- | ------------- | --------------------------- | --------------------------------------- |
| 1   | Storage       | JSON blob for properties    | Flexibility over query performance      |
| 2   | Sync          | Hybrid Yjs + event sourcing | Best tool per data type over uniformity |
| 3   | Protocol      | y-webrtc compatible         | Compatibility over control              |
| 4   | P2P           | WebRTC via signaling        | Speed over full decentralization        |
| 5   | Storage       | Platform-specific adapters  | Performance over single implementation  |
| 6   | Transactions  | Batch metadata              | Simplicity over true ACID               |
| 7   | Ordering      | Lamport timestamps          | Simplicity over concurrency detection   |
| 8   | Data Model    | Minimal 4-field Node        | Flexibility over convenience            |
| 9   | Schemas       | Code-first with inference   | No build step over type control         |
| 10  | Architecture  | Append-only log             | Auditability over storage efficiency    |
| 11  | Identity      | DID:key only                | Offline/simplicity over features        |
| 12  | Authorization | UCAN tokens                 | P2P capability over familiarity         |
| 13  | Crypto        | BLAKE3 + Ed25519            | Performance over compliance             |
| 14  | Telemetry     | Opt-in tiers                | User trust over data volume             |
| 15  | Privacy       | P3A bucketing               | Privacy over precision                  |
| 16  | Security      | Local peer scoring          | Decentralization over coordination      |
| 17  | React API     | Schema-first + FlatNode     | Type safety over simplicity             |
| 18  | Query         | Read-time computation       | Freshness over read performance         |
