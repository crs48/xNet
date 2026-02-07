# IndexedDB to SQLite Migration: Unified Storage for xNet

> A comprehensive analysis of migrating xNet's storage layer from IndexedDB to SQLite, using better-sqlite3 in Electron and SQLite-WASM with OPFS in web browsers. This exploration evaluates the tradeoffs, library options, migration strategies, and implementation phases.

**References**:

- [0016_PERSISTENCE_ARCHITECTURE.md](./0016_PERSISTENCE_ARCHITECTURE.md) - Previous durability analysis
- [0043_OFF_MAIN_THREAD_ARCHITECTURE.md](./0043_OFF_MAIN_THREAD_ARCHITECTURE.md) - Off-thread design
- [0067_DATABASE_DATA_MODEL_V2.md](./0067_DATABASE_DATA_MODEL_V2.md) - Database architecture

**Date**: February 2026
**Status**: Research Complete

## Executive Summary

This exploration recommends **migrating from IndexedDB to SQLite** across all platforms:

| Platform      | Current   | Proposed           | Benefit                            |
| ------------- | --------- | ------------------ | ---------------------------------- |
| Electron      | IndexedDB | better-sqlite3     | 10-100x faster queries, ACID, FTS5 |
| Web           | IndexedDB | SQLite-WASM + OPFS | Durable storage, SQL queries       |
| Mobile (Expo) | N/A       | expo-sqlite        | Native performance                 |

**Key findings:**

- IndexedDB has fundamental durability and performance limitations
- SQLite-WASM with OPFS is production-ready (Chrome 102+, Safari 15.2+, Firefox 111+)
- Bundle size impact: ~300-500KB WASM (acceptable for local-first app)
- Migration can be incremental with dual-write strategy

```mermaid
flowchart TB
    subgraph Current["Current Architecture"]
        IDB1["IndexedDB<br/>@xnet/storage"]
        IDB2["IndexedDB<br/>@xnet/data NodeStore"]
    end

    subgraph Target["Target Architecture"]
        subgraph Electron["Electron"]
            BS3["better-sqlite3<br/>Native, Fast"]
        end
        subgraph Web["Web Browser"]
            WASM["SQLite-WASM<br/>+ OPFS VFS"]
        end
        subgraph Mobile["Mobile (Expo)"]
            EXPO["expo-sqlite<br/>Native"]
        end
    end

    subgraph Benefits["Benefits"]
        B1["ACID Transactions"]
        B2["FTS5 Search"]
        B3["Complex Queries"]
        B4["Crash Recovery"]
        B5["Unified SQL Schema"]
    end

    Current -->|"Migration"| Target
    Target --> Benefits

    style IDB1 fill:#f44336,color:#fff
    style IDB2 fill:#f44336,color:#fff
    style BS3 fill:#4caf50,color:#fff
    style WASM fill:#ff9800,color:#fff
    style EXPO fill:#4caf50,color:#fff
```

## Current State Analysis

### Existing Storage Architecture

xNet currently uses **two separate IndexedDB implementations**:

```mermaid
flowchart TB
    subgraph Storage["@xnet/storage Package"]
        direction TB
        IDBAdapter["IndexedDBAdapter"]
        IDBBatch["IndexedDBBatchAdapter"]
        MemAdapter["MemoryAdapter"]

        subgraph IDBStores1["Object Stores"]
            Docs["documents"]
            Updates["updates"]
            Snapshots["snapshots"]
            Blobs["blobs"]
        end
    end

    subgraph Data["@xnet/data Package"]
        direction TB
        NodeAdapter["IndexedDBNodeStorageAdapter"]
        MemNodeAdapter["MemoryNodeStorageAdapter"]

        subgraph IDBStores2["Object Stores"]
            Nodes["nodes"]
            Changes["changes"]
            DocContent["documentContent"]
            Meta["meta"]
            YjsSnaps["yjsSnapshots"]
        end
    end

    subgraph Hub["@xnet/hub (Server)"]
        SQLiteHub["SQLite via better-sqlite3"]
        FTS5["FTS5 Search Index"]
    end

    IDBAdapter --> IDBStores1
    IDBBatch --> IDBStores1
    NodeAdapter --> IDBStores2

    style IDBAdapter fill:#f44336,color:#fff
    style IDBBatch fill:#f44336,color:#fff
    style NodeAdapter fill:#f44336,color:#fff
    style SQLiteHub fill:#4caf50,color:#fff
```

### IndexedDB Pain Points

#### 1. Performance Issues

| Operation          | IndexedDB | SQLite | Improvement |
| ------------------ | --------- | ------ | ----------- |
| List 10K nodes     | ~500ms    | ~5ms   | **100x**    |
| Complex filter     | ~200ms    | ~2ms   | **100x**    |
| Full-text search   | N/A       | ~10ms  | **Enabled** |
| Bulk insert (1K)   | ~1000ms   | ~50ms  | **20x**     |
| Transaction commit | ~5-20ms   | ~1ms   | **5-20x**   |

#### 2. Durability Problems

```mermaid
flowchart TD
    subgraph Problems["IndexedDB Failure Modes"]
        P1["Storage Pressure<br/>Browser evicts silently"]
        P2["iOS Safari<br/>7-day PWA expiry"]
        P3["Incognito Mode<br/>Data never persisted"]
        P4["Browser Updates<br/>Can corrupt IDB"]
        P5["User Actions<br/>Clear cache = data loss"]
        P6["Multi-Tab<br/>Locking issues"]
    end

    subgraph Impact["Impact"]
        I1["Data Loss"]
        I2["User Trust Issues"]
        I3["Not Enterprise-Ready"]
    end

    P1 --> I1
    P2 --> I1
    P3 --> I1
    P4 --> I1
    P5 --> I1
    P6 --> I1
    I1 --> I2
    I2 --> I3

    style P1 fill:#f44336,color:#fff
    style P2 fill:#f44336,color:#fff
    style I1 fill:#ff5722,color:#fff
```

#### 3. Query Limitations

IndexedDB only supports:

- Get by primary key
- Range queries on indexed fields
- Cursor iteration

IndexedDB **cannot** do:

- JOINs (relations)
- Aggregations (COUNT, SUM, AVG)
- Full-text search
- Complex WHERE clauses
- ORDER BY on non-indexed fields

### Current Code Locations

| File                                               | Purpose               | Lines |
| -------------------------------------------------- | --------------------- | ----- |
| `packages/storage/src/adapters/indexeddb.ts`       | Document/blob storage | ~300  |
| `packages/storage/src/adapters/indexeddb-batch.ts` | Batched writes        | ~200  |
| `packages/data/src/store/indexeddb-adapter.ts`     | NodeStore persistence | ~400  |
| `apps/electron/src/data-process/sqlite-batch.ts`   | Existing SQLite batch | ~150  |
| `packages/hub/src/storage/sqlite.ts`               | Hub SQLite            | ~500  |

---

## SQLite-WASM Library Comparison

### Option 1: Official SQLite WASM (sqlite.org)

**Source**: https://sqlite.org/wasm/doc/trunk/index.md

```mermaid
flowchart LR
    subgraph Features["Features"]
        F1["Official SQLite team"]
        F2["All SQLite features"]
        F3["OPFS VFS built-in"]
        F4["npm: @aspect/sqlite-wasm"]
    end

    subgraph Pros["Pros"]
        P1["Authoritative source"]
        P2["Long-term support"]
        P3["FTS5, JSON1, etc."]
    end

    subgraph Cons["Cons"]
        C1["Larger bundle (~500KB)"]
        C2["Less JS-friendly API"]
        C3["Newer, less examples"]
    end
```

| Metric         | Value                 |
| -------------- | --------------------- |
| Bundle Size    | ~500KB gzipped        |
| SQLite Version | Latest (3.45+)        |
| OPFS Support   | Yes (built-in VFS)    |
| FTS5           | Yes                   |
| Maintenance    | SQLite core team      |
| npm            | `@aspect/sqlite-wasm` |

### Option 2: wa-sqlite (Roy Hashimoto)

**Source**: https://github.com/rhashimoto/wa-sqlite

```mermaid
flowchart LR
    subgraph Features["Features"]
        F1["First OPFS implementation"]
        F2["Multiple VFS options"]
        F3["Async API"]
        F4["Well-documented"]
    end

    subgraph VFS["VFS Options"]
        V1["OPFSCoopSyncVFS<br/>Best durability"]
        V2["OPFSAnyContextVFS<br/>More compatible"]
        V3["IDBBatchAtomicVFS<br/>IndexedDB fallback"]
    end
```

| Metric         | Value              |
| -------------- | ------------------ |
| Bundle Size    | ~300KB gzipped     |
| SQLite Version | 3.44+              |
| OPFS Support   | Yes (multiple VFS) |
| FTS5           | Optional build     |
| Maintenance    | Active community   |
| npm            | `wa-sqlite`        |

### Option 3: sql.js

**Source**: https://github.com/sql-js/sql.js

```mermaid
flowchart LR
    subgraph Features["Features"]
        F1["Oldest, most mature"]
        F2["Simple API"]
        F3["Good docs"]
    end

    subgraph Limitations["Limitations"]
        L1["No native OPFS"]
        L2["In-memory only"]
        L3["Must serialize to persist"]
    end
```

| Metric         | Value              |
| -------------- | ------------------ |
| Bundle Size    | ~500KB gzipped     |
| SQLite Version | 3.42               |
| OPFS Support   | No (needs wrapper) |
| FTS5           | Yes                |
| Maintenance    | Less active        |
| npm            | `sql.js`           |

### Option 4: CR-SQLite (vlcn.io)

**Source**: https://github.com/vlcn-io/cr-sqlite

```mermaid
flowchart LR
    subgraph Features["Features"]
        F1["CRDT-native SQLite"]
        F2["Multi-writer sync"]
        F3["Merge databases"]
    end

    subgraph Tradeoffs["Tradeoffs"]
        T1["2.5x slower inserts"]
        T2["Additional complexity"]
        T3["Less mature"]
    end
```

| Metric        | Value                           |
| ------------- | ------------------------------- |
| Bundle Size   | ~400KB gzipped                  |
| CRDT Support  | Built-in                        |
| Use Case      | Native SQLite sync              |
| Consideration | Could replace Yjs for some data |

### Recommendation: wa-sqlite + Official SQLite WASM

```mermaid
flowchart TB
    subgraph Primary["Primary: wa-sqlite"]
        WA1["Smaller bundle"]
        WA2["OPFSCoopSyncVFS"]
        WA3["Good async API"]
        WA4["Active maintenance"]
    end

    subgraph Fallback["Fallback: Official WASM"]
        OF1["If wa-sqlite issues"]
        OF2["Long-term stability"]
    end

    subgraph Future["Future: CR-SQLite"]
        CR1["Evaluate for sync"]
        CR2["Could replace Yjs LWW"]
    end

    Primary -->|"Watch"| Fallback
    Primary -->|"Evaluate"| Future
```

**Rationale:**

1. **wa-sqlite** has the best OPFS implementation and smaller bundle
2. **Official SQLite WASM** is the safety net with long-term support
3. **CR-SQLite** is interesting for future sync architecture but adds complexity now

---

## OPFS Browser Support

### Current Support Matrix

```mermaid
flowchart TB
    subgraph Supported["Full OPFS Support"]
        Chrome["Chrome 102+<br/>(March 2022)"]
        Edge["Edge 102+<br/>(March 2022)"]
        Safari["Safari 15.2+<br/>(Dec 2021)"]
        Firefox["Firefox 111+<br/>(March 2023)"]
    end

    subgraph Partial["Partial Support"]
        SafariIOS["iOS Safari 15.2+<br/>No sync access handle"]
    end

    subgraph None["No Support"]
        OldBrowsers["IE, older browsers"]
    end

    style Chrome fill:#4caf50,color:#fff
    style Edge fill:#4caf50,color:#fff
    style Safari fill:#4caf50,color:#fff
    style Firefox fill:#4caf50,color:#fff
    style SafariIOS fill:#ff9800,color:#fff
    style OldBrowsers fill:#f44336,color:#fff
```

### OPFS vs IndexedDB Comparison

| Feature           | IndexedDB          | OPFS              |
| ----------------- | ------------------ | ----------------- |
| Storage Type      | Key-value          | File system       |
| Eviction          | Browser-controlled | Less aggressive   |
| Sync API          | No                 | Yes (in Worker)   |
| Durability        | Low                | Medium-High       |
| iOS Safari Expiry | 7 days             | Same origin rules |
| Cross-tab         | Complex locking    | File locking      |
| SQLite Compatible | Hacks only         | Native support    |

### Fallback Strategy

```mermaid
flowchart TD
    Start["Initialize Storage"]
    CheckOPFS["Check OPFS Support"]
    CheckWorker["Check Worker Support"]

    UseOPFS["Use OPFS + SQLite-WASM<br/>Best durability"]
    UseIDB["Use IndexedDB + SQLite-WASM<br/>Fallback"]
    UseIDBOnly["Use IndexedDB only<br/>Legacy"]

    Start --> CheckOPFS
    CheckOPFS -->|"Supported"| CheckWorker
    CheckOPFS -->|"Not supported"| UseIDB
    CheckWorker -->|"Supported"| UseOPFS
    CheckWorker -->|"Not supported"| UseIDB
    UseIDB -->|"WASM fails"| UseIDBOnly

    style UseOPFS fill:#4caf50,color:#fff
    style UseIDB fill:#ff9800,color:#fff
    style UseIDBOnly fill:#f44336,color:#fff
```

---

## Unified SQLite Schema

### Proposed Schema

```sql
-- Unified schema for all platforms
-- Works with better-sqlite3, wa-sqlite, and expo-sqlite

-- ============================================
-- Core Tables
-- ============================================

-- Documents (Pages, Databases, Canvases)
CREATE TABLE documents (
    id TEXT PRIMARY KEY,
    schema_id TEXT NOT NULL,           -- Schema IRI
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    created_by TEXT NOT NULL,          -- DID
    deleted_at INTEGER,

    -- Denormalized for fast queries
    title TEXT,
    icon TEXT,
    parent_id TEXT,

    FOREIGN KEY (parent_id) REFERENCES documents(id)
);

-- Node properties (LWW per-property)
CREATE TABLE node_properties (
    node_id TEXT NOT NULL,
    property_key TEXT NOT NULL,
    value BLOB,                        -- MessagePack encoded
    lamport_time INTEGER NOT NULL,
    updated_by TEXT NOT NULL,          -- DID
    updated_at INTEGER NOT NULL,

    PRIMARY KEY (node_id, property_key),
    FOREIGN KEY (node_id) REFERENCES documents(id)
);

-- Change log (event sourcing)
CREATE TABLE changes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    node_id TEXT NOT NULL,
    property_key TEXT,
    old_value BLOB,
    new_value BLOB,
    lamport_time INTEGER NOT NULL,
    wall_time INTEGER NOT NULL,
    author TEXT NOT NULL,              -- DID
    signature BLOB NOT NULL,           -- Ed25519

    FOREIGN KEY (node_id) REFERENCES documents(id)
);

-- Y.Doc binary state
CREATE TABLE yjs_documents (
    doc_id TEXT PRIMARY KEY,
    state BLOB NOT NULL,               -- Y.encodeStateAsUpdate()
    updated_at INTEGER NOT NULL,

    FOREIGN KEY (doc_id) REFERENCES documents(id)
);

-- Y.Doc incremental updates
CREATE TABLE yjs_updates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    doc_id TEXT NOT NULL,
    update_data BLOB NOT NULL,
    timestamp INTEGER NOT NULL,
    origin TEXT,                       -- Peer ID

    FOREIGN KEY (doc_id) REFERENCES documents(id)
);

-- Blobs (content-addressed)
CREATE TABLE blobs (
    cid TEXT PRIMARY KEY,              -- Content ID (BLAKE3)
    data BLOB NOT NULL,
    mime_type TEXT,
    size INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    reference_count INTEGER DEFAULT 1
);

-- Sync state
CREATE TABLE sync_state (
    key TEXT PRIMARY KEY,
    value BLOB NOT NULL
);

-- ============================================
-- Indexes
-- ============================================

CREATE INDEX idx_documents_schema ON documents(schema_id);
CREATE INDEX idx_documents_parent ON documents(parent_id);
CREATE INDEX idx_documents_updated ON documents(updated_at);
CREATE INDEX idx_documents_created_by ON documents(created_by);

CREATE INDEX idx_properties_node ON node_properties(node_id);
CREATE INDEX idx_properties_lamport ON node_properties(lamport_time);

CREATE INDEX idx_changes_node ON changes(node_id);
CREATE INDEX idx_changes_lamport ON changes(lamport_time);
CREATE INDEX idx_changes_wall_time ON changes(wall_time);

CREATE INDEX idx_yjs_updates_doc ON yjs_updates(doc_id);

-- ============================================
-- Full-Text Search (FTS5)
-- ============================================

CREATE VIRTUAL TABLE documents_fts USING fts5(
    id,
    title,
    content,
    tokenize='porter unicode61'
);

-- Triggers to keep FTS in sync
CREATE TRIGGER documents_ai AFTER INSERT ON documents BEGIN
    INSERT INTO documents_fts(id, title, content)
    VALUES (new.id, new.title, '');
END;

CREATE TRIGGER documents_ad AFTER DELETE ON documents BEGIN
    INSERT INTO documents_fts(documents_fts, id, title, content)
    VALUES('delete', old.id, old.title, '');
END;

CREATE TRIGGER documents_au AFTER UPDATE ON documents BEGIN
    INSERT INTO documents_fts(documents_fts, id, title, content)
    VALUES('delete', old.id, old.title, '');
    INSERT INTO documents_fts(id, title, content)
    VALUES (new.id, new.title, '');
END;
```

### Platform-Specific Implementations

```mermaid
flowchart TB
    subgraph Interface["SQLiteAdapter Interface"]
        Open["open(path)"]
        Exec["exec(sql, params)"]
        Query["query(sql, params)"]
        Transaction["transaction(fn)"]
        Close["close()"]
    end

    subgraph Electron["ElectronSQLiteAdapter"]
        BS3["better-sqlite3"]
        Sync["Synchronous API"]
        WAL["WAL mode"]
    end

    subgraph Web["WebSQLiteAdapter"]
        WA["wa-sqlite"]
        OPFS["OPFS VFS"]
        Worker["Web Worker"]
    end

    subgraph Mobile["MobileSQLiteAdapter"]
        EXPO["expo-sqlite"]
        Native["Native SQLite"]
    end

    Interface --> Electron
    Interface --> Web
    Interface --> Mobile
```

---

## Migration Strategy

### Phase 1: Electron Migration (Lowest Risk)

```mermaid
flowchart LR
    subgraph Current["Phase 1: Electron"]
        E1["Add better-sqlite3 adapter"]
        E2["Dual-write IDB + SQLite"]
        E3["Read from SQLite"]
        E4["Drop IDB writes"]
        E5["Migration complete"]
    end

    E1 --> E2 --> E3 --> E4 --> E5
```

#### Checklist: Phase 1 - Electron

- [ ] Create `SQLiteNodeStorageAdapter`
  - [ ] Implement `NodeStorageAdapter` interface
  - [ ] Use `better-sqlite3` via utility process
  - [ ] WAL mode for durability
  - [ ] Prepared statements for performance

- [ ] Add dual-write mode
  - [ ] Write to both IDB and SQLite
  - [ ] Read from SQLite with IDB fallback
  - [ ] Migration status tracking

- [ ] Migrate existing data
  - [ ] Create migration script
  - [ ] Batch migrate nodes in transactions
  - [ ] Verify data integrity
  - [ ] Support rollback

- [ ] Performance validation
  - [ ] Benchmark listNodes queries
  - [ ] Benchmark write throughput
  - [ ] Memory usage profiling
  - [ ] Test with large datasets (100K+ nodes)

- [ ] Cut over
  - [ ] Remove IDB writes
  - [ ] Remove IDB fallback reads
  - [ ] Cleanup IDB data (optional)

**Files to create/modify:**

- `packages/data/src/store/sqlite-adapter.ts` (new)
- `apps/electron/src/data-process/storage.ts`
- `apps/electron/src/main/ipc-handlers.ts`

---

### Phase 2: Web Migration (Higher Risk)

```mermaid
flowchart LR
    subgraph Current["Phase 2: Web"]
        W1["Add wa-sqlite dependency"]
        W2["Create OPFS adapter"]
        W3["Feature detection"]
        W4["Dual-write with fallback"]
        W5["Migrate existing data"]
        W6["Cut over"]
    end

    W1 --> W2 --> W3 --> W4 --> W5 --> W6
```

#### Checklist: Phase 2 - Web

- [ ] Add wa-sqlite dependency
  - [ ] `pnpm add wa-sqlite`
  - [ ] Configure Vite for WASM
  - [ ] Add COOP/COEP headers for SharedArrayBuffer
  - [ ] Test in all target browsers

- [ ] Create OPFS adapter
  - [ ] Implement `SQLiteAdapter` interface
  - [ ] Use `OPFSCoopSyncVFS` for durability
  - [ ] Run in Web Worker (required for sync access)
  - [ ] Comlink wrapper for main thread

- [ ] Feature detection
  - [ ] Check OPFS support
  - [ ] Check SharedArrayBuffer support
  - [ ] Check Web Worker support
  - [ ] Graceful fallback chain

- [ ] IndexedDB fallback
  - [ ] Use `IDBBatchAtomicVFS` when OPFS unavailable
  - [ ] Clear warning to users about durability
  - [ ] Prompt for desktop app download

- [ ] Migration from existing IDB
  - [ ] Read all data from old IDB
  - [ ] Insert into SQLite
  - [ ] Verify and switch
  - [ ] Cleanup old IDB (optional)

- [ ] Browser-specific testing
  - [ ] Chrome (baseline)
  - [ ] Firefox (OPFS differences)
  - [ ] Safari (iOS limitations)
  - [ ] Edge

**Files to create/modify:**

- `packages/data/src/store/sqlite-wasm-adapter.ts` (new)
- `packages/data/src/store/opfs-vfs.ts` (new)
- `apps/web/src/workers/sqlite-worker.ts` (new)
- `apps/web/vite.config.ts` (WASM config)

---

### Phase 3: Unified Storage Package

```mermaid
flowchart TB
    subgraph New["@xnet/sqlite Package"]
        Interface["SQLiteAdapter interface"]
        Electron["ElectronSQLiteAdapter"]
        Web["WebSQLiteAdapter"]
        Memory["MemorySQLiteAdapter"]
        Migration["MigrationManager"]
    end

    subgraph Consumers["Consumers"]
        DataPkg["@xnet/data"]
        StoragePkg["@xnet/storage"]
        HubPkg["@xnet/hub"]
    end

    New --> Consumers
```

#### Checklist: Phase 3 - Unified Package

- [ ] Create `@xnet/sqlite` package
  - [ ] Define `SQLiteAdapter` interface
  - [ ] Platform detection utilities
  - [ ] Shared schema definitions
  - [ ] Migration helpers

- [ ] Refactor existing packages
  - [ ] `@xnet/data` uses `@xnet/sqlite`
  - [ ] `@xnet/storage` uses `@xnet/sqlite`
  - [ ] `@xnet/hub` aligned schema

- [ ] Remove IndexedDB
  - [ ] Remove `@xnet/storage` IndexedDB adapters
  - [ ] Remove `@xnet/data` IndexedDB adapter
  - [ ] Remove `idb` dependency

- [ ] Documentation
  - [ ] Storage architecture docs
  - [ ] Migration guide
  - [ ] Performance tuning

---

### Phase 4: Mobile Support (Future)

```mermaid
flowchart LR
    subgraph Mobile["Phase 4: Expo"]
        M1["Add expo-sqlite"]
        M2["Create adapter"]
        M3["Share schema"]
        M4["Test sync"]
    end

    M1 --> M2 --> M3 --> M4
```

#### Checklist: Phase 4 - Mobile

- [ ] Expo SQLite integration
  - [ ] Add `expo-sqlite` dependency
  - [ ] Create `ExpoSQLiteAdapter`
  - [ ] Share schema with web/electron

- [ ] Sync testing
  - [ ] Test mobile-to-desktop sync
  - [ ] Test mobile-to-web sync
  - [ ] Conflict resolution verification

---

## Bundle Size Impact

### Current State

| Package           | Size (gzipped) |
| ----------------- | -------------- |
| `idb`             | ~8KB           |
| `pako`            | ~47KB          |
| Total IDB-related | ~55KB          |

### After Migration

| Package               | Size (gzipped) |
| --------------------- | -------------- |
| `wa-sqlite` (WASM)    | ~300KB         |
| `wa-sqlite` (JS glue) | ~20KB          |
| Total SQLite-WASM     | ~320KB         |

**Net increase: ~265KB** (acceptable for local-first app)

### Mitigation Strategies

1. **Lazy load WASM** - Load SQLite only when first needed
2. **Code splitting** - Keep WASM in separate chunk
3. **CDN caching** - WASM file caches well
4. **Progressive enhancement** - Start with IDB, upgrade to SQLite

---

## Performance Benchmarks

### Expected Improvements

```mermaid
xychart-beta
    title "Query Performance: IndexedDB vs SQLite"
    x-axis ["List 1K", "List 10K", "Filter", "Search", "Bulk Insert"]
    y-axis "Time (ms)" 0 --> 1000
    bar [50, 500, 200, 0, 1000]
    bar [5, 50, 20, 10, 50]
```

| Operation        | IndexedDB | SQLite | Speedup |
| ---------------- | --------- | ------ | ------- |
| List 1K nodes    | 50ms      | 5ms    | 10x     |
| List 10K nodes   | 500ms     | 50ms   | 10x     |
| Filter by schema | 200ms     | 20ms   | 10x     |
| Full-text search | N/A       | 10ms   | Enabled |
| Bulk insert 1K   | 1000ms    | 50ms   | 20x     |
| Complex JOIN     | N/A       | 5ms    | Enabled |

### Considerations

1. **Cold start**: WASM initialization adds ~100-200ms on first load
2. **Memory**: SQLite uses more memory than IDB cursor iteration
3. **Worker overhead**: Cross-thread communication adds latency
4. **Batching**: Batch operations see the biggest improvements

---

## Risk Assessment

### Technical Risks

| Risk                   | Probability | Impact | Mitigation                  |
| ---------------------- | ----------- | ------ | --------------------------- |
| WASM bundle size       | Low         | Medium | Lazy loading, CDN           |
| Browser compatibility  | Medium      | High   | Feature detection, fallback |
| Migration data loss    | Low         | High   | Dual-write, backup first    |
| Performance regression | Low         | Medium | Benchmarking, rollback plan |
| OPFS quota limits      | Low         | Medium | Monitor usage, warn users   |

### Migration Risks

```mermaid
flowchart TD
    subgraph Risks["Migration Risks"]
        R1["Data corruption<br/>during migration"]
        R2["Performance regression<br/>in some scenarios"]
        R3["Browser compatibility<br/>issues discovered late"]
    end

    subgraph Mitigations["Mitigations"]
        M1["Dual-write mode<br/>with verification"]
        M2["Comprehensive benchmarks<br/>before/after"]
        M3["Feature detection<br/>+ graceful fallback"]
    end

    R1 --> M1
    R2 --> M2
    R3 --> M3
```

---

## Implementation Timeline

```mermaid
gantt
    title SQLite Migration Timeline
    dateFormat  YYYY-MM-DD
    section Phase 1: Electron
    SQLite adapter           :p1a, 2026-02-15, 5d
    Dual-write mode          :p1b, after p1a, 3d
    Migration script         :p1c, after p1b, 3d
    Testing & validation     :p1d, after p1c, 5d
    Cut over                 :p1e, after p1d, 2d

    section Phase 2: Web
    wa-sqlite setup          :p2a, after p1e, 3d
    OPFS adapter             :p2b, after p2a, 5d
    Feature detection        :p2c, after p2b, 2d
    Browser testing          :p2d, after p2c, 5d
    Migration & cut over     :p2e, after p2d, 5d

    section Phase 3: Unified
    Create @xnet/sqlite      :p3a, after p2e, 5d
    Refactor packages        :p3b, after p3a, 5d
    Remove IndexedDB         :p3c, after p3b, 3d
    Documentation            :p3d, after p3c, 3d
```

**Estimated total: 8-10 weeks**

---

## Decision Matrix

### Should We Migrate?

| Factor                | IndexedDB        | SQLite           | Winner    |
| --------------------- | ---------------- | ---------------- | --------- |
| Query performance     | Poor             | Excellent        | SQLite    |
| Durability            | Low              | High             | SQLite    |
| Full-text search      | No               | Yes (FTS5)       | SQLite    |
| Complex queries       | No               | Yes (SQL)        | SQLite    |
| Bundle size           | Small            | +300KB           | IndexedDB |
| Browser support       | Universal        | Modern only      | IndexedDB |
| Development effort    | Current          | High (migration) | IndexedDB |
| Long-term maintenance | Two systems      | One system       | SQLite    |
| Hub compatibility     | Different schema | Same schema      | SQLite    |

**Recommendation: Migrate to SQLite**

The performance and durability benefits outweigh the bundle size and migration costs. A local-first application fundamentally needs reliable storage.

---

## Open Questions

1. **CR-SQLite evaluation**: Should we evaluate CR-SQLite for replacing Yjs LWW?
   - Could unify sync model
   - But adds complexity and is less mature

2. **Encryption**: Should we add SQLCipher for at-rest encryption?
   - Higher bundle size
   - Platform-specific builds
   - Consider for enterprise tier

3. **Shared Worker**: Should we use a Shared Worker for cross-tab SQLite access?
   - Better multi-tab support
   - More complex implementation

4. **WAL checkpoint strategy**: When to checkpoint the WAL file?
   - On app close
   - Periodic (every N minutes)
   - On idle

---

## References

- [SQLite WASM Documentation](https://sqlite.org/wasm/doc/trunk/index.md)
- [wa-sqlite GitHub](https://github.com/rhashimoto/wa-sqlite)
- [CR-SQLite GitHub](https://github.com/vlcn-io/cr-sqlite)
- [OPFS Specification](https://fs.spec.whatwg.org/)
- [Chrome OPFS Blog Post](https://developer.chrome.com/blog/from-web-sql-to-sqlite-wasm/)
- [0016_PERSISTENCE_ARCHITECTURE.md](./0016_PERSISTENCE_ARCHITECTURE.md)
