# Performance Implications of Complex Graph Schemas with Block-Level Edges

**Research Date:** 2026-01-20  
**Context:** Performance analysis for block-level graph storage in knowledge management systems

---

## 1. Graph Storage Strategies

### Comparison: Adjacency List vs Adjacency Matrix vs Edge Tables

For block-level knowledge management systems, where graphs are typically **large and sparse** (most blocks aren't connected to most other blocks), the storage strategy has significant performance implications.

| Feature | Adjacency Matrix | Adjacency List | Edge Table (Edge List) |
|---------|------------------|----------------|------------------------|
| **Space Complexity** | O(V²) - Prohibitive for large, sparse graphs | **O(V + E)** - Most efficient for sparse graphs | O(E) - Space-efficient, query-inefficient |
| **Check Edge Existence** | **O(1)** - Fastest | O(degree) or O(log degree) | O(E) - Very slow, requires full scan |
| **Find All Neighbors** | O(V) - Inefficient, scans full row | **O(degree)** - Very fast and efficient | O(E) - Very slow |
| **Add/Remove Block** | O(V²) - Very slow, matrix resizing | **O(1) / O(V+E)** - Generally fast | **O(1) / O(E)** - Fast |

**V** = number of vertices (blocks), **E** = number of edges (relationships)

**Recommendation:** For block-level systems, **Adjacency List** offers the best balance of memory efficiency and fast neighbor retrieval (finding backlinks).

---

### How Graph Databases Store Edges

#### Neo4j (Native Graph Database)

**Storage Model:**
- Uses fixed-size record files for nodes and relationships
- **Index-free adjacency:** Each node stores a direct pointer to its first relationship
- Relationships stored in doubly-linked lists

**Physical Storage:**
- **Node record:** 9 bytes (on disk)
- **Relationship record:** 33 bytes (on disk)
- In-memory size larger due to caching and JVM overhead

**Traversal Mechanism:**
- Node contains pointer to first relationship
- Each relationship points to next relationship
- Following pointers is extremely fast (no index lookup needed)

**Analogy:** Each person has a paper listing their first friend; each friend's paper points to the next friend.

#### DGraph (Distributed Graph Database)

**Storage Model:**
- Stores data as triples (Subject-Predicate-Object) in distributed key-value store
- Creates inverted index (posting list) for each predicate (relationship type)

**Traversal Mechanism:**
- To find Alice's friends: lookup `FRIEND_OF` predicate, find Alice's ID within that list
- Enables horizontal scaling across nodes

**Analogy:** Central directory with a chapter for "FRIEND_OF" listing everyone and their friends.

#### ArangoDB (Multi-Model Document Store)

**Storage Model:**
- Nodes and edges stored as JSON-like documents in collections
- Edge documents have special `_from` and `_to` attributes

**Traversal Mechanism:**
- Fast index lookup on `_from` or `_to` fields
- No native pointer following like Neo4j

**Analogy:** Two filing cabinets (nodes and edges); each relationship card lists source and target IDs.

---

### Document Databases and Graph-Like Relationships

**MongoDB / CouchDB Approach:**
- **Embedded references:** Store related data directly in documents
- **Separate collections:** Edge collection with `source_id` and `target_id` fields
- **Trade-off:** Embedded = fast reads but update anomalies; Separate = normalized but slower joins

**Performance Characteristics:**
- Embedded references: Excellent for 1-hop queries, poor for multi-hop traversals
- Separate edge collections: Requires multiple queries or aggregation pipeline
- Indexing on reference fields is critical

---

### Storage Format Optimizations

#### Compression
- General-purpose compression (GZIP, Snappy) for data at rest
- JanusGraph leverages backend compression (Cassandra, HBase)

#### Delta Encoding
Highly effective for adjacency lists:
1. Sort adjacency list by neighbor ID
2. Store full ID of first neighbor
3. For subsequent neighbors, store only the difference (delta) from previous
4. Small deltas compress extremely well

**Example:** WebGraph framework achieves 3-4 bits per edge for web graphs using delta encoding and compression.

---

## 2. Performance of Edge Queries

### Cost of Finding All Edges for a Node

**Complexity:**
- Native graph database with index-free adjacency: **O(d)** where d = degree of node
- Relational database: **O(log E)** with index, **O(E)** without

**Real-World Timings:**
- **Hot/Cached data (in RAM):** < 1ms
- **Cold/Disk data (from SSD):** 5-50ms
- **"Supernode" Problem:** Node with millions of edges can take seconds-to-minutes (d is huge)

**Key Insight:** For typical knowledge management (degree < 1000), query times are sub-millisecond when cached.

---

### Cost of Traversing N Hops

Performance degrades non-linearly due to **combinatorial explosion** of paths.

| Hop Count | Typical Query Time | Notes |
|-----------|-------------------|-------|
| **1-hop** (direct connections) | < 1ms - 30ms | Very fast, index-free adjacency shines |
| **2-hops** (friends of friends) | 15ms - 150ms | Graph databases significantly outperform RDBMS |
| **3-hops** | 150ms - 3000+ms | Performance degrades significantly |
| **4+ hops** | Often impractical | Requires significant optimization for real-time use |

**Mitigation Strategies:**
- Limit traversal depth
- Pre-compute transitive closure for common paths
- Use bidirectional BFS for shortest path queries
- Implement query timeouts

---

### Index Strategies for Edge Lookups

#### B-Tree Index
- **Best for:** Range queries (e.g., blocks created between dates)
- **Complexity:** O(log N)
- **Use case:** Filtering edges by timestamp, weight, or other ordered properties

#### Hash Index
- **Best for:** Exact match lookups (find block by ID)
- **Complexity:** O(1)
- **Use case:** Direct block ID resolution

#### Specialized Graph Indexes

**Index-Free Adjacency:**
- Core feature of native graph databases
- Each node stores direct pointers to relationships
- Makes traversal O(degree) instead of O(log E)

**Full-Text Indexes (Lucene):**
- For searching keywords within block content
- Essential for "search and link" features

**Vector Indexes (HNSW, FAISS):**
- For semantic/similarity searches
- Growing importance for "related documents" features
- Approximate nearest neighbor queries

**Recommendation:** Use composite strategy:
- Hash index on block ID for fast lookups
- B-tree index on edge properties (timestamp, type)
- Full-text index on block content
- Optional vector index for semantic similarity

---

### Query Time vs Number of Edges

**General Observations from Benchmarks:**

1. **Number of edges matters less than query complexity and branching factor**
2. A simple query on 100k edges can beat a complex 3-hop query on 1k edges
3. **Indexes are critical:** One benchmark showed 120k edges:
   - Without index: ~150ms
   - With index: ~6ms (25x improvement)

**Rough Performance Estimates (Neo4j):**
- **10k edges:** Simple queries < 1ms, 3-hop queries ~100ms
- **100k edges:** Simple queries 1-5ms, 3-hop queries ~500ms
- **1M edges:** Simple queries 5-20ms, 3-hop queries 2-10s
- **10M+ edges:** Requires query optimization and caching strategies

**Note:** Performance highly dependent on hardware (SSD vs HDD, RAM size), query pattern, and graph structure.

---

## 3. Alternatives to Explicit Edge Storage

### Computed/Virtual Edges

**Concept:** Calculate relationships on-the-fly at query time instead of storing them.

**Performance Trade-offs:**
- **Stored edges:** O(1) lookup, predictable query time
- **Computed edges:** O(computation) at query time, saves storage

**When to Use:**
- **Stored:** Relationships are static and frequently queried (social networks, citations)
- **Computed:** Rules change frequently, or graph is extremely dense

**Caching Strategies:**
- **Memoization:** Cache computation results, invalidate on data change
- **Materialized views:** Pre-calculate and store for frequently accessed patterns
- **TTL-based cache:** Time-based expiration for acceptable staleness

**Real-World Examples:**
- Relational JOIN operations (computed edges)
- TensorFlow dynamic computational graphs
- Derived edges like "colleagues" (work at same company)

---

### Materialized Views

**How They Work for Graph Data:**
- Pre-calculate results of complex recursive queries
- Store results in a table/view for fast access
- Refresh when underlying data changes

**Update Strategies:**

| Strategy | Speed | Complexity | Use Case |
|----------|-------|------------|----------|
| **Full Refresh** | Slow | Simple | Batch updates, low frequency |
| **Incremental Refresh** | Fast | Complex | Real-time updates, high frequency |
| **Lazy/On-Demand** | Variable | Medium | Infrequent access patterns |

**PostgreSQL Performance:**
- Recursive CTE for graph traversal: 100-500ms (cold)
- Materialized view lookup: 5-20ms (indexed)
- Refresh time: Depends on graph size and change rate

**SQLite Performance:**
- No native materialized views (use triggers + tables)
- Good for client-side caching (local-first apps)
- Recursive CTEs supported but slower than PostgreSQL

**Trade-offs:**
- **Storage overhead:** Materialized views consume additional disk space
- **Consistency:** Views can become stale between refreshes
- **Refresh cost:** Full refresh can be expensive for large graphs

---

### Event Sourcing with Edge Derivation

**Concept:** Store all changes as events, derive current graph state by replaying events.

**Architecture:**
- Events: `NodeAdded`, `EdgeAdded`, `EdgeRemoved`, `NodeDeleted`
- Current state: Replay event log from beginning
- CQRS pattern: Separate read model (optimized graph) from write model (event log)

**Performance Implications:**

| Operation | Performance | Notes |
|-----------|-------------|-------|
| **Writes** | Very fast | Simple append to event log |
| **Reads (no snapshot)** | Very slow | Must replay entire history |
| **Reads (with snapshot)** | Fast | Snapshot + recent events |

**Snapshot Strategies:**
- **Interval-based:** Every N events (e.g., 10,000)
- **Time-based:** Every 24 hours
- **Size-based:** When event log exceeds threshold
- **Demand-based:** After significant rebuild cost

**Real-World Examples:**
- Financial systems (audit trail critical)
- Git (commit history is event sourcing for file graph)
- Collaborative editing systems (operational transformation)

**Trade-offs:**
- **Auditability:** Complete history preserved
- **Complexity:** Requires snapshot management and event replay logic
- **Storage:** Event log grows indefinitely (need archival strategy)

---

### Denormalization Strategies

**Concept:** Store redundant data to speed up reads.

#### Embedding Edges in Documents (MongoDB style)

```json
{
  "block_id": "abc-123",
  "content": "My block content",
  "outgoing_links": ["def-456", "ghi-789"],  // Denormalized
  "incoming_links": ["jkl-012", "mno-345"]   // Denormalized
}
```

**Benefits:**
- Single document read gets all edge information
- No joins required
- Fast for 1-hop queries

**Drawbacks:**
- Update anomalies: Must update both source and target when edge changes
- Consistency challenges: Can have orphaned references
- Storage overhead: Each edge stored twice (source and target)

#### When Denormalization Makes Sense

- **Read-heavy workloads:** 90%+ reads vs writes
- **Static data:** Edges rarely change
- **Simple queries:** Mostly 1-hop, rarely multi-hop
- **Acceptable inconsistency:** Can tolerate brief inconsistencies

**Performance Numbers:**
- Embedded edges: 1-5ms for block + edges
- Separate edge table: 10-30ms for block + join
- Trade-off: 3-10x faster reads, but complex updates

---

### Eager vs Lazy Edge Computation

Focus: **Transitive closure** (which nodes can reach which other nodes)

#### Eager Computation (Precompute)

**Approach:**
- Calculate entire transitive closure upfront
- Store in matrix or table
- Query is simple lookup: "Can A reach B?"

**Complexity:**
- **Computation:** O(V³) using Floyd-Warshall
- **Storage:** O(V²) for reachability matrix
- **Query:** O(1) lookup

**Use Case:** Small graphs (<10k nodes), frequent reachability queries

#### Lazy Computation (On-Demand)

**Approach:**
- Calculate reachability when queried
- Use BFS/DFS to find path

**Complexity:**
- **Computation:** O(V + E) per query
- **Storage:** O(V) for visited set
- **Query:** O(V + E)

**Use Case:** Large graphs, infrequent reachability queries

#### Hybrid Approaches

**Partial Precomputation:**
- Cache results of frequent queries
- LRU eviction for cache management
- Compute on cache miss

**Incremental Computation:**
- Update transitive closure only when graph changes
- Track affected nodes and recompute only their reachability
- Can reduce O(V³) full recomputation to O(V²) or better

**Practical Strategy for Block Graphs:**
- Lazy by default (graphs are large)
- Cache recent queries (temporal locality)
- Precompute for "important" nodes (high degree)
- Background jobs for expensive computations

---

## 4. Block-Level Granularity Concerns

### Memory Overhead Per Block ID

Choice of identifier has significant impact on memory and performance:

| Key Type | Size | Pros | Cons | Best For |
|----------|------|------|------|----------|
| **Integer** | 4 bytes | Smallest, fastest | Not globally unique, sequential = security risk | Single-server systems |
| **Long** | 8 bytes | Small, fast | Not globally unique | Single-server, large datasets |
| **UUID** | 16 bytes | **Globally unique**, distributed-friendly | **2-4x larger**, index fragmentation (random) | Distributed systems |
| **UUIDv7** | 16 bytes | Globally unique, **time-ordered** | 16 bytes | **Recommended for blocks** |
| **Compound Key** | Variable | Natural relationships | Large, clumsy | Specific use cases |

**Recommendation:** Use **UUIDv7** for blocks:
- Globally unique (essential for offline editing and sync)
- Time-ordered (better index performance than UUIDv4)
- Standardized (good tooling support)

**Memory Impact Example:**
- 100,000 blocks with integer IDs: 400 KB
- 100,000 blocks with UUIDs: 1.6 MB
- Difference: 1.2 MB (negligible on modern hardware)

---

### Storage Overhead: Block→Block vs Document→Document

**Critical Insight:** Block-level linking creates **combinatorial explosion** of edges.

#### Document-Level Edges (Traditional)

**Example:**
- 1,000 documents
- Each document links to ~10 others
- **Total edges: ~10,000**

**Edge Storage:**
- Simple: `(source_doc_id, target_doc_id)`
- 2 × 16 bytes (UUIDs) = 32 bytes per edge
- **Total: 320 KB**

#### Block-Level Edges (Fine-Grained)

**Example:**
- 1,000 documents
- Each document has ~50 blocks
- Each block links to ~2 other blocks
- **Total edges: 100,000** (10x increase!)

**Edge Storage:**
- Complex: `(source_doc_id, source_block_id, target_doc_id, target_block_id)`
- 4 × 16 bytes (UUIDs) = 64 bytes per edge
- **Total: 6.4 MB** (20x larger!)

**Index Overhead:**
- B-tree index: ~30-50% of data size
- Block-level edges: ~3-4 MB additional for indexes
- Document-level edges: ~150 KB additional for indexes

**Key Takeaway:** Block-level granularity increases:
- Edge count by **10-100x**
- Storage requirements by **20-50x**
- Index size proportionally

**Mitigation Strategies:**
- Selective block linking (only when truly needed)
- Prune transient/temporary blocks
- Compress edge storage
- Use efficient ID representation

---

### Query Complexity with Nested Blocks

**Challenge:** Deeply nested structures (page > toggle > list > sublist) require recursive queries.

#### Relational Database Approach

**Problem:**
```sql
-- Find all descendants of block X
WITH RECURSIVE descendants AS (
  SELECT * FROM blocks WHERE parent_id = 'X'
  UNION ALL
  SELECT b.* FROM blocks b
  JOIN descendants d ON b.parent_id = d.id
)
SELECT * FROM descendants;
```

- Each recursion level requires a join
- Deep nesting (10+ levels) can be slow
- PostgreSQL: ~100-500ms for 5-level recursion on 10k blocks

#### Graph Database Approach

**Advantage:**
- Native traversal follows pointers directly
- Neo4j: ~10-50ms for 5-level traversal
- Predictable performance regardless of nesting depth

#### Mitigation Strategies

**1. Path-Based Storage:**
Store full ancestry path: `/page_id/section_id/subsection_id/block_id`
- **Benefit:** Retrieve entire subtree with prefix query
- **Drawback:** Update all descendants when moving a block

**2. Closure Table:**
Explicitly store all ancestor-descendant pairs:
```
ancestor_id | descendant_id | depth
abc-123     | def-456      | 1
abc-123     | ghi-789      | 2
def-456     | ghi-789      | 1
```
- **Benefit:** Fast queries at any depth
- **Drawback:** O(depth²) storage, complex updates

**3. Lazy Loading:**
- Fetch only visible blocks
- Load nested blocks when user expands
- **Benefit:** Fast initial render
- **Drawback:** Additional requests for nested content

**4. Client-Side Reconstruction:**
- Send flat list of blocks with parent_id
- Client rebuilds tree structure
- **Benefit:** Simple backend, efficient for real-time collaboration
- **Drawback:** Client memory overhead

**Performance Comparison (1000 blocks, 5-level nesting):**
- Recursive CTE: 100-300ms (PostgreSQL)
- Graph traversal: 10-30ms (Neo4j)
- Path-based query: 5-10ms (indexed)
- Closure table: 1-5ms (indexed)

---

## 5. Real-World Examples

### Notion

**Architecture:**
- Cloud-based, collaborative platform
- Everything is a block (text, page, image, database)

**Database Technology:**
- **Primary:** Sharded PostgreSQL (sharded by workspace)
- **Caching:** Redis
- **Real-time:** WebSocket-based MessageStore service

**Block References:**
- Link stores target block's unique ID
- Backend joins tables for block information and relationships
- References rendered on-demand

**Backlinks:**
- "Last-write-wins" model for real-time updates
- Moving towards CRDTs for offline conflict resolution

**Performance with Large Pages (1000+ blocks):**
- Noticeable degradation with 1000+ blocks, especially with complex databases
- Web-based architecture requires downloading/rendering all blocks
- Users report sluggishness with large pages

**Real-time Collaboration:**
- WebSocket connections to MessageStore
- Edit sent to API server → MessageStore → pushed to subscribed clients
- Operational transformation for conflict resolution

---

### Roam Research

**Architecture:**
- Cloud-based, graph-first design
- Every block has a unique UID

**Database Technology:**
- **Datomic:** Immutable "datoms" (entity-attribute-value-transaction tuples)
- Fact-based storage enables flexible block-level graph
- Entire database is collection of interconnected facts

**Block-Level Backlinks:**
- Reference a block by embedding its UID
- Backlinks found by querying for all blocks containing the UID
- Bidirectional by default (forward link + reverse query)

**Graph View Performance:**
- Graph Overview (entire knowledge base): Degrades with database size
- Page-level graph: Generally more performant
- Front-end rendering (HTML5 Canvas) is bottleneck with many elements

**Query Performance:**
- **10k blocks:** Datalog engine fast, but UI can be sluggish
- **100k blocks:** Significant degradation, frustratingly slow for daily use
- Users split graphs to maintain usability

**Query Engine:**
- Powerful Datalog query language
- Can be surprisingly fast for complex queries
- UI rendering often the bottleneck, not query execution

---

### Obsidian

**Architecture:**
- Local-first, plain text (Markdown) files
- All data on user's machine
- No server required

**Database Technology:**
- In-memory index of vault links and block references
- Built on startup by parsing all Markdown files
- File system watcher for real-time index updates

**Graph View:**
- **Global graph:** All notes and connections
  - Degrades with thousands of notes
  - 25,000-30,000+ notes: Often unusable
- **Local graph:** Current note and nearby connections
  - Much more performant, recommended for large vaults

**Graph Computation:**
- **100% local computation**, no server processing
- Parses Markdown for `[[...]]` links and `^...` block references
- Updates index in real-time on file changes

**Backlinks:**
- Dynamically generated via reverse lookup on in-memory index
- Very fast (<1ms for typical note)

**Memory Usage:**
- Increases with vault size
- Large vaults: Global graph can consume significant RAM
- GPU acceleration helps but doesn't solve extreme cases

**Query Performance (Dataview Plugin):**
- In-memory cache of vault metadata
- Queries typically <10ms
- Avoids slow disk access by maintaining cache

**Scalability:**
- Core app: Handles 50,000+ notes well
- Global graph view: Becomes bottleneck around 10,000-20,000 notes
- Workaround: Use local graph view, disable global graph

---

### Other Knowledge Management Systems

#### LogSeq

**Architecture:**
- Local-first, open-source
- Similar to Obsidian (Markdown files)
- In-memory database: DataScript (Datalog implementation)

**Database:**
- Moving to SQLite-based storage for improved performance/reliability
- DataScript provides powerful query capabilities
- File-based storage for portability

**Performance:**
- Fast for core app functionality
- Can be slow on startup (parsing all files)
- Graph view performance similar to Obsidian

#### RemNote

**Architecture:**
- Integrates spaced repetition with knowledge graph
- Every item is a "Rem" (like a block)

**Spaced Repetition:**
- Choice of Anki SM-2 or FSRS (Free Spaced Repetition Scheduler)
- Flashcards generated from Rems

**Knowledge Graph:**
- Visualizes connections between Rems
- Performance not extensively documented

#### Athens Research

**Architecture:**
- Open-source Roam clone (no longer actively maintained)
- Built with Clojure/ClojureScript

**Database:**
- DataScript as in-memory graph database
- Runs directly in browser
- Local-first design

---

### Performance Benchmarks: System Comparison

**Note:** Specific benchmarks are scarce and highly workload-dependent. These are based on user reports and architectural analysis.

#### Graph Query Times

| System | Small Graph (1k-5k blocks) | Medium Graph (10k-50k blocks) | Large Graph (100k+ blocks) |
|--------|---------------------------|-------------------------------|----------------------------|
| **Obsidian (Dataview)** | <10ms | 10-50ms | 50-200ms |
| **LogSeq** | <20ms | 20-100ms | 100-500ms |
| **Roam Research** | 20-100ms | 100-500ms | 500ms-5s (often unusable) |
| **Notion** | 50-200ms | 200-1000ms | 1-5s+ (dependent on cloud) |

#### Memory Usage (Graph View)

| System | Small Vault | Medium Vault | Large Vault |
|--------|-------------|--------------|-------------|
| **Obsidian** | 50-200 MB | 200-800 MB | 800 MB-3 GB |
| **Roam** | 100-300 MB | 300 MB-1 GB | 1-5 GB |
| **LogSeq** | 100-400 MB | 400 MB-1.5 GB | 1.5-4 GB |
| **Notion** | Variable (web-based) | Variable | Variable |

#### Scalability Limits (User Reports)

| System | Performance Starts Degrading | Significant Issues |
|--------|------------------------------|-------------------|
| **Obsidian** | 10,000-20,000 notes (global graph) | 25,000-30,000+ notes |
| **Roam Research** | 5,000-10,000 blocks | 50,000-100,000 blocks |
| **LogSeq** | 15,000-25,000 blocks | 40,000-60,000 blocks |
| **Notion** | 10,000-20,000 database entries | 50,000-100,000 entries |

**Key Observations:**
1. **Local-first (Obsidian/LogSeq) outperforms cloud-based (Notion/Roam)** for query speed
2. **Graph view rendering is the primary bottleneck** for all systems at scale
3. **Roam's graph database (Datomic) is powerful but UI is bottleneck**
4. **Notion's performance tied to network latency and database complexity**

---

## 6. Trade-offs Summary

### Eager vs Lazy Edge Computation

| Aspect | Eager (Precompute) | Lazy (On-Demand) | Hybrid |
|--------|-------------------|------------------|--------|
| **Query Latency** | Very low (1-5ms) | Variable (10-500ms) | Low for common (5-10ms), variable for rare |
| **Memory Usage** | High (O(V²) for closure) | Low (O(V) during query) | Medium (cache size) |
| **Update Cost** | High (recompute transitive closure) | None | Medium (invalidate cache) |
| **Storage** | High | None | Medium |
| **Best For** | Small graphs, frequent queries | Large graphs, infrequent queries | Most real-world scenarios |

**Recommendation for Block Graphs:** Hybrid approach with selective eager computation for high-value paths.

---

### Denormalization vs Normalized Edges

| Aspect | Denormalized (Embedded) | Normalized (Separate Table) | Hybrid |
|--------|------------------------|----------------------------|--------|
| **Read Performance** | Excellent (1-5ms) | Good with index (10-30ms) | Excellent for common cases |
| **Write Performance** | Poor (multiple updates) | Good (single update) | Good |
| **Consistency** | Challenging (update anomalies) | Easy (single source of truth) | Challenging |
| **Storage** | Higher (redundancy) | Lower | Medium |
| **Query Complexity** | Simple (single doc read) | Complex (joins required) | Mixed |
| **Best For** | Read-heavy, static data | Write-heavy, dynamic data | Most applications |

**Recommendation for Block Graphs:** Normalized with denormalized caches for frequent access patterns.

---

### Memory vs CPU vs Storage Trade-offs

#### Strategy 1: Minimize Memory (Lazy/Normalized)

**Approach:**
- Store only explicit edges
- Compute on demand
- No caching

**Characteristics:**
- **Memory:** Very low
- **CPU:** High (repeated computation)
- **Storage:** Low
- **Query Latency:** High

**Best For:** Memory-constrained environments, infrequent access

#### Strategy 2: Minimize CPU (Eager/Denormalized)

**Approach:**
- Precompute all relationships
- Embed edges in documents
- Materialize views

**Characteristics:**
- **Memory:** High
- **CPU:** Very low at query time, high at write time
- **Storage:** High
- **Query Latency:** Very low

**Best For:** Read-heavy workloads, low-latency requirements

#### Strategy 3: Minimize Storage (Computed Edges)

**Approach:**
- Derive edges from data
- No explicit edge storage
- Cache in memory

**Characteristics:**
- **Memory:** Medium (cache)
- **CPU:** Medium (computation on cache miss)
- **Storage:** Very low
- **Query Latency:** Variable

**Best For:** Dense graphs, derivable relationships

#### Strategy 4: Balanced (Hybrid Approach)

**Approach:**
- Store explicit edges in normalized form
- Cache frequent queries in memory
- Selective denormalization for hot paths
- Background jobs for expensive computations

**Characteristics:**
- **Memory:** Medium
- **CPU:** Medium
- **Storage:** Medium
- **Query Latency:** Low

**Best For:** Most real-world block-level graph systems ✓

---

### Recommended Architecture for Block-Level Graphs

Based on research, here's an optimal architecture:

#### Storage Layer
- **Primary:** Normalized edge table (PostgreSQL or SQLite)
- **Block IDs:** UUIDv7 (time-ordered, globally unique)
- **Indexes:** B-tree on (source_id, target_id), separate on (target_id) for backlinks

#### Caching Layer
- **In-memory cache:** Recent queries and high-degree nodes
- **Materialized views:** Expensive aggregations (transitive closure, graph metrics)
- **TTL-based:** Invalidate after reasonable time (5-60 minutes)

#### Query Strategy
- **1-hop queries:** Direct database query (fast with indexes)
- **2-3 hop queries:** Check cache first, compute if miss, cache result
- **>3 hop queries:** Background job, notify user when complete

#### Update Strategy
- **Writes:** Normalized edge table (single source of truth)
- **Cache invalidation:** Selective (only affected queries)
- **Materialized view refresh:** Incremental where possible

#### Scalability Strategy
- **Sharding:** By document or workspace
- **Read replicas:** For heavy query loads
- **Graph database:** Consider Neo4j/DGraph when >1M edges and complex traversals

---

## Specific Performance Numbers Summary

### Storage Overhead

| Graph Size | Edge Count | Storage (Normalized) | Storage (Denormalized) | Index Overhead |
|------------|------------|---------------------|----------------------|----------------|
| Small (1k blocks) | 2k-5k | 64-160 KB | 128-320 KB | 30-80 KB |
| Medium (10k blocks) | 20k-50k | 640 KB-1.6 MB | 1.3-3.2 MB | 300 KB-800 KB |
| Large (100k blocks) | 200k-500k | 6.4-16 MB | 13-32 MB | 3-8 MB |
| Very Large (1M blocks) | 2M-5M | 64-160 MB | 128-320 MB | 30-80 MB |

*Assumes 32 bytes per edge (normalized), 64 bytes per edge (denormalized with redundancy), 30-50% index overhead*

### Query Performance (Indexed)

| Query Type | 10k Edges | 100k Edges | 1M Edges | 10M Edges |
|------------|-----------|------------|----------|-----------|
| Find all edges for node | <1ms | 1-5ms | 5-20ms | 20-100ms |
| Check if edge exists | <1ms | <1ms | 1-2ms | 2-5ms |
| 1-hop traversal | 1-10ms | 5-30ms | 20-100ms | 100-500ms |
| 2-hop traversal | 10-100ms | 50-300ms | 200ms-2s | 1-20s |
| 3-hop traversal | 50-500ms | 200ms-2s | 1-10s | Often timeout |

*Highly dependent on graph structure, branching factor, and hardware*

### Memory Overhead (In-Memory Index)

| Graph Size | Adjacency List | Hash Index | Full Cache |
|------------|----------------|------------|------------|
| 10k edges | ~500 KB | ~1 MB | ~2 MB |
| 100k edges | ~5 MB | ~10 MB | ~20 MB |
| 1M edges | ~50 MB | ~100 MB | ~200 MB |
| 10M edges | ~500 MB | ~1 GB | ~2 GB |

*Assumes efficient in-memory representation with pointer compression*

---

## Conclusions and Recommendations

### For Small Graphs (<10k blocks, <50k edges)
- Use SQLite or PostgreSQL with normalized edge table
- In-memory caching of entire graph is feasible
- Simple adjacency list in memory for fast traversals
- **Estimated memory:** 10-50 MB
- **Query time:** <10ms for most queries

### For Medium Graphs (10k-100k blocks, 50k-500k edges)
- PostgreSQL with careful indexing
- Selective in-memory caching of hot queries
- Consider materialized views for expensive aggregations
- **Estimated memory:** 50-200 MB
- **Query time:** 10-100ms for most queries, 100ms-1s for complex

### For Large Graphs (>100k blocks, >500k edges)
- Consider dedicated graph database (Neo4j, DGraph)
- Distributed caching (Redis)
- Background jobs for expensive computations
- Query result pagination
- **Estimated memory:** 200 MB-2 GB
- **Query time:** 50-500ms for simple, seconds for complex

### General Principles
1. **Start simple:** PostgreSQL/SQLite with normalized edges
2. **Measure first:** Profile before optimizing
3. **Cache intelligently:** Not everything, just hot paths
4. **Index wisely:** On frequently queried columns
5. **Limit depth:** 3-hop maximum for real-time queries
6. **Consider granularity:** Block-level has 10-100x more edges than document-level
7. **Plan for scale:** Design for 10x expected size

---

**Research Sources:**
- Graph database documentation (Neo4j, DGraph, ArangoDB)
- Academic papers on graph storage and traversal
- User reports from knowledge management communities
- Database benchmarks and comparative studies
- Open source implementation analysis (Obsidian, LogSeq, Athens Research)

**Last Updated:** 2026-01-20
