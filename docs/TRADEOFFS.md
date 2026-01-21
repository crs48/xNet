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
