var P=["interactive","bulk","write"];function w(){return typeof performance<"u"&&typeof performance.now=="function"?performance.now():Date.now()}function J(e,t){return{firstOpAfterOpen:!0,idleBeforeFirstOpMs:Math.round(e.enqueuedAt-t),sinceOpenMs:Math.round(e.startedAt-t)}}function m(e,t){if(e.length===0)return 0;const a=[...e].sort((s,n)=>s-n),r=Math.min(a.length-1,Math.max(0,Math.ceil(t/100*a.length)-1));return Math.round(a[r])}var k=512,b=class{ops=0;maxExecMs=0;queueSamples=[];execSamples=[];cursor=0;record(e,t){this.ops+=1,t>this.maxExecMs&&(this.maxExecMs=t),this.queueSamples.length<k?(this.queueSamples.push(e),this.execSamples.push(t)):(this.queueSamples[this.cursor]=e,this.execSamples[this.cursor]=t,this.cursor=(this.cursor+1)%k)}stats(){return{ops:this.ops,queueP50Ms:m(this.queueSamples,50),queueP95Ms:m(this.queueSamples,95),execP50Ms:m(this.execSamples,50),execP95Ms:m(this.execSamples,95),maxExecMs:Math.round(this.maxExecMs)}}reset(){this.ops=0,this.maxExecMs=0,this.queueSamples.length=0,this.execSamples.length=0,this.cursor=0}},Z=class{constructor(e){this.onOp=e}queues={interactive:[],bulk:[],write:[]};coalesced=new Map;running=!1;laneStats={interactive:new b,bulk:new b,write:new b};coalescedHits=0;schedule(e,t,a,r,s){if(a!==void 0){const o=this.coalesced.get(a);if(o)return this.coalescedHits+=1,o}const n=new Promise((o,c)=>{this.queues[e].push({run:t,resolve:o,reject:c,lane:e,label:r,detail:s,enqueuedAt:w()})});if(a!==void 0){this.coalesced.set(a,n);const o=()=>{this.coalesced.get(a)===n&&this.coalesced.delete(a)};n.then(o,o)}return this.pump(),n}snapshot(){return{interactive:this.queues.interactive.length,bulk:this.queues.bulk.length,write:this.queues.write.length,inFlight:this.running}}opStats(){const e={interactive:this.laneStats.interactive.stats(),bulk:this.laneStats.bulk.stats(),write:this.laneStats.write.stats()};return{ops:e.interactive.ops+e.bulk.ops+e.write.ops,coalescedHits:this.coalescedHits,lanes:e}}resetOpStats(){this.coalescedHits=0;for(const e of P)this.laneStats[e].reset()}next(){for(const e of P){const t=this.queues[e].shift();if(t)return t}}async pump(){if(!this.running){this.running=!0;try{let e;for(;e=this.next();){const t=w();try{e.resolve(await e.run())}catch(a){e.reject(a)}finally{const a=w(),r=t-e.enqueuedAt,s=a-t;this.laneStats[e.lane].record(r,s),this.onOp&&this.onOp({lane:e.lane,label:e.label,detail:e.detail,queueMs:r,execMs:s,enqueuedAt:e.enqueuedAt,startedAt:t})}}}finally{this.running=!1}}}};function U(e){return globalThis}function ee(e){return typeof U().navigator?.storage?.getDirectory=="function"}function te(e){const t=U();if(typeof t.FileSystemSyncAccessHandle<"u")return!0;const a=t.FileSystemFileHandle?.prototype;return!!(a&&"createSyncAccessHandle"in a)}function ae(e){const t=U();return typeof t.SharedArrayBuffer<"u"&&t.crossOriginIsolated===!0}function se(e){const t=ee(),a=te(),r=ae();let s,n;return t?a?(s="sync-access-handle",n="OPFS sync access handles available — using the durable opfs-sahpool fast path."):(s="async-opfs",n="OPFS is available but sync access handles are not (iOS 15.2–16.3 or an older WebView); falling back to the slower async OPFS backend. Data still persists."):(s="memory",n="OPFS is unavailable in this context (private browsing or an unsupported engine); local data will not persist across reloads."),{opfs:t,syncAccessHandle:a,crossOriginIsolated:r,mode:s,reason:n}}var re=11,ne=26;function ie(e){return!e||typeof e!="object"?null:e}function C(e){return B(e,new Set)}function B(e,t){const a=ie(e);if(!a||t.has(e))return!1;t.add(e);const r=typeof a.message=="string"?a.message.toLowerCase():String(a.message),s=typeof a.code=="string"?a.code.toUpperCase():"",n=typeof a.resultCode=="number"?a.resultCode:null;return n===re||n===ne||s==="SQLITE_CORRUPT"||s==="SQLITE_NOTADB"||r.includes("sqlite_corrupt")||r.includes("sqlite_notadb")||r.includes("database disk image is malformed")||r.includes("file is not a database")||B(a.cause,t)}var oe=9,ce=`
-- ============================================
-- Schema Version Tracking
-- ============================================

CREATE TABLE IF NOT EXISTS _schema_version (
    version INTEGER PRIMARY KEY,
    applied_at INTEGER NOT NULL
);

-- ============================================
-- Core Tables
-- ============================================

-- All nodes (Pages, Databases, Rows, Comments, etc.)
CREATE TABLE IF NOT EXISTS nodes (
    id TEXT PRIMARY KEY,
    schema_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    created_by TEXT NOT NULL,
    deleted_at INTEGER
);

-- Node properties (LWW per-property)
CREATE TABLE IF NOT EXISTS node_properties (
    node_id TEXT NOT NULL,
    property_key TEXT NOT NULL,
    value BLOB,
    lamport_time INTEGER NOT NULL,
    updated_by TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    -- Grinding-resistant LWW final tiebreak key (exploration 0305): blake3 of
    -- (author ‖ property ‖ value), present only for protocol v4+ writes. NULL
    -- for legacy rows, which fall back to the author-DID tiebreak.
    tiebreak_key TEXT,

    PRIMARY KEY (node_id, property_key),
    FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE
);

-- Rebuildable scalar property index for query planning.
CREATE TABLE IF NOT EXISTS node_property_scalars (
    node_id TEXT NOT NULL,
    schema_id TEXT NOT NULL,
    property_key TEXT NOT NULL,
    value_type TEXT NOT NULL,
    value_text TEXT,
    value_number REAL,
    value_boolean INTEGER,
    value_hash TEXT,
    updated_at INTEGER NOT NULL,
    lamport_time INTEGER NOT NULL,

    PRIMARY KEY (schema_id, property_key, node_id),
    FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE
);

-- Query planner telemetry for adaptive read indexes.
CREATE TABLE IF NOT EXISTS query_descriptor_stats (
    descriptor_hash TEXT PRIMARY KEY,
    schema_id TEXT NOT NULL,
    descriptor_json TEXT NOT NULL,
    hits INTEGER NOT NULL,
    total_duration_ms REAL NOT NULL,
    avg_duration_ms REAL NOT NULL,
    avg_candidates REAL NOT NULL,
    last_seen_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS query_index_candidates (
    index_name TEXT PRIMARY KEY,
    descriptor_hash TEXT NOT NULL,
    schema_id TEXT NOT NULL,
    property_key TEXT NOT NULL,
    value_type TEXT NOT NULL,
    ddl TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    last_used_at INTEGER NOT NULL,
    estimated_bytes INTEGER NOT NULL DEFAULT 0,
    estimated_rows INTEGER NOT NULL DEFAULT 0,

    FOREIGN KEY (descriptor_hash) REFERENCES query_descriptor_stats(descriptor_hash)
        ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS node_query_materializations (
    view_id TEXT PRIMARY KEY,
    descriptor_hash TEXT NOT NULL,
    schema_id TEXT NOT NULL,
    descriptor_json TEXT NOT NULL,
    generated_at INTEGER NOT NULL,
    invalidated_at INTEGER,
    row_count INTEGER NOT NULL,
    -- Authorization fingerprint the view was materialized under (exploration
    -- 0226). NULL when authz is off; a mismatch forces an 'authz-changed'
    -- refresh so a cached id list can never serve rows the viewer can no
    -- longer read.
    auth_fingerprint TEXT
);

CREATE TABLE IF NOT EXISTS node_query_materialized_ids (
    view_id TEXT NOT NULL,
    ordinal INTEGER NOT NULL,
    node_id TEXT NOT NULL,

    PRIMARY KEY (view_id, ordinal),
    UNIQUE (view_id, node_id),
    FOREIGN KEY (view_id) REFERENCES node_query_materializations(view_id)
        ON DELETE CASCADE,
    FOREIGN KEY (node_id) REFERENCES nodes(id)
        ON DELETE CASCADE
);

-- Change log (event sourcing)
CREATE TABLE IF NOT EXISTS changes (
    hash TEXT PRIMARY KEY,
    node_id TEXT NOT NULL,
    payload BLOB NOT NULL,
    lamport_time INTEGER NOT NULL,
    lamport_peer TEXT NOT NULL,
    wall_time INTEGER NOT NULL,
    author TEXT NOT NULL,
    parent_hash TEXT,
    batch_id TEXT,
    signature BLOB NOT NULL,

    FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE
);

-- Y.Doc binary state (for nodes with collaborative content)
CREATE TABLE IF NOT EXISTS yjs_state (
    node_id TEXT PRIMARY KEY,
    state BLOB NOT NULL,
    updated_at INTEGER NOT NULL,

    FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE
);

-- Y.Doc incremental updates (for sync)
CREATE TABLE IF NOT EXISTS yjs_updates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    node_id TEXT NOT NULL,
    update_data BLOB NOT NULL,
    timestamp INTEGER NOT NULL,
    origin TEXT,

    FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE
);

-- Yjs snapshots (for document time travel)
CREATE TABLE IF NOT EXISTS yjs_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    node_id TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    snapshot BLOB NOT NULL,
    doc_state BLOB NOT NULL,
    byte_size INTEGER NOT NULL,

    FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE
);

-- Pin registry (exploration 0329): keys exempt from pruning/eviction.
-- pin_key is a change hash or a 'yjs:<nodeId>@<timestamp>' snapshot ref;
-- owner_id is the checkpoint/draft node holding the pin. Blobs are NOT
-- pinned (explicit blob horizon).
CREATE TABLE IF NOT EXISTS pinned_changes (
    pin_key TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    created_at INTEGER NOT NULL,

    PRIMARY KEY (pin_key, owner_id)
);

-- Blobs (content-addressed)
CREATE TABLE IF NOT EXISTS blobs (
    cid TEXT PRIMARY KEY,
    data BLOB NOT NULL,
    mime_type TEXT,
    size INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    reference_count INTEGER DEFAULT 1
);

-- Documents (for @xnetjs/storage compatibility)
CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    content BLOB NOT NULL,
    metadata TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1
);

-- Signed updates (for @xnetjs/storage compatibility)
CREATE TABLE IF NOT EXISTS updates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    doc_id TEXT NOT NULL,
    update_hash TEXT NOT NULL,
    update_data TEXT NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
    UNIQUE(doc_id, update_hash)
);

-- Snapshots (for @xnetjs/storage compatibility)
CREATE TABLE IF NOT EXISTS snapshots (
    doc_id TEXT PRIMARY KEY,
    snapshot_data TEXT NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
);

-- Sync metadata
CREATE TABLE IF NOT EXISTS sync_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- ============================================
-- Indexes
-- ============================================

CREATE INDEX IF NOT EXISTS idx_nodes_schema ON nodes(schema_id);
CREATE INDEX IF NOT EXISTS idx_nodes_updated ON nodes(updated_at);
CREATE INDEX IF NOT EXISTS idx_nodes_created_by ON nodes(created_by);
CREATE INDEX IF NOT EXISTS idx_nodes_deleted ON nodes(deleted_at);
CREATE INDEX IF NOT EXISTS idx_nodes_live_schema_updated
    ON nodes(schema_id, updated_at DESC, id)
    WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_nodes_all_schema_updated
    ON nodes(schema_id, updated_at DESC, id);
CREATE INDEX IF NOT EXISTS idx_nodes_live_schema_created
    ON nodes(schema_id, created_at DESC, id)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_properties_node ON node_properties(node_id);
CREATE INDEX IF NOT EXISTS idx_properties_lamport ON node_properties(lamport_time);

CREATE INDEX IF NOT EXISTS idx_prop_scalars_text
    ON node_property_scalars(schema_id, property_key, value_text, node_id)
    WHERE value_type = 'text';
CREATE INDEX IF NOT EXISTS idx_prop_scalars_number
    ON node_property_scalars(schema_id, property_key, value_number, node_id)
    WHERE value_type = 'number';
CREATE INDEX IF NOT EXISTS idx_prop_scalars_boolean
    ON node_property_scalars(schema_id, property_key, value_boolean, node_id)
    WHERE value_type = 'boolean';
CREATE INDEX IF NOT EXISTS idx_prop_scalars_null
    ON node_property_scalars(schema_id, property_key, node_id)
    WHERE value_type = 'null';
CREATE INDEX IF NOT EXISTS idx_prop_scalars_node
    ON node_property_scalars(node_id);

CREATE INDEX IF NOT EXISTS idx_query_stats_schema_seen
    ON query_descriptor_stats(schema_id, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_query_indexes_schema_property
    ON query_index_candidates(schema_id, property_key, value_type);
CREATE INDEX IF NOT EXISTS idx_query_materializations_schema
    ON node_query_materializations(schema_id, invalidated_at);
CREATE INDEX IF NOT EXISTS idx_query_materialized_ids_node
    ON node_query_materialized_ids(node_id);

CREATE INDEX IF NOT EXISTS idx_changes_node ON changes(node_id);
CREATE INDEX IF NOT EXISTS idx_changes_lamport ON changes(lamport_time);
CREATE INDEX IF NOT EXISTS idx_changes_wall_time ON changes(wall_time);
CREATE INDEX IF NOT EXISTS idx_changes_batch ON changes(batch_id);
CREATE INDEX IF NOT EXISTS idx_changes_node_lamport
    ON changes(node_id, lamport_time DESC, hash);

CREATE INDEX IF NOT EXISTS idx_yjs_state_updated ON yjs_state(updated_at);
CREATE INDEX IF NOT EXISTS idx_yjs_updates_node ON yjs_updates(node_id);
CREATE INDEX IF NOT EXISTS idx_yjs_snapshots_node ON yjs_snapshots(node_id);
CREATE INDEX IF NOT EXISTS idx_yjs_snapshots_timestamp ON yjs_snapshots(node_id, timestamp);

CREATE INDEX IF NOT EXISTS idx_pinned_changes_owner ON pinned_changes(owner_id);

CREATE INDEX IF NOT EXISTS idx_updates_doc ON updates(doc_id);
CREATE INDEX IF NOT EXISTS idx_updates_created ON updates(created_at);
`,de=`
-- ============================================
-- Full-Text Search (FTS5)
-- ============================================

-- FTS index for searchable node content
CREATE VIRTUAL TABLE IF NOT EXISTS nodes_fts USING fts5(
    node_id,
    title,
    content,
    tokenize='porter unicode61'
);

-- Triggers to keep FTS in sync will be managed by application layer
-- since the searchable content is derived from node properties
`,le=ce+de;function W(e){const t=e;return t?t.name==="NoModificationAllowedError"?!0:/Access Handles cannot be created|createSyncAccessHandle/i.test(t.message??""):!1}async function ue(e,t={}){const a=t.attempts??5,r=t.baseDelayMs??150,s=t.sleep??(o=>new Promise(c=>setTimeout(c,o)));let n;for(let o=1;o<=a;o++)try{return await e()}catch(c){if(n=c,!W(c)||o===a)throw c;t.onRetry?.(o,c),await s(r*o)}throw n}var pe=64;function he(e){return e.replace(/[\s;]+$/,"").includes(";")}var Ee=class{constructor(e=pe){if(this.capacity=e,e<1)throw new Error("StmtCache capacity must be >= 1")}entries=new Map;get size(){return this.entries.size}get(e){const t=this.entries.get(e);return t!==void 0&&(this.entries.delete(e),this.entries.set(e,t)),t}set(e,t){const a=this.entries.get(e);for(a!==void 0&&a!==t&&this.safeFinalize(a),this.entries.delete(e),this.entries.set(e,t);this.entries.size>this.capacity;){const r=this.entries.keys().next().value,s=this.entries.get(r);this.entries.delete(r),s!==void 0&&this.safeFinalize(s)}}clear(){for(const e of this.entries.values())this.safeFinalize(e);this.entries.clear()}safeFinalize(e){try{e.finalize()}catch{}}},Y="opfs-sahpool",M=".xnet-sqlite",z=10;function Te(){return typeof self<"u"&&typeof localStorage<"u"&&localStorage.getItem("xnet:sqlite:debug")==="true"}function p(...e){Te()&&console.log(...e)}function E(){return typeof performance<"u"&&typeof performance.now=="function"?performance.now():Date.now()}function x(e){return e.path.startsWith("/")?e.path:`/${e.path}`}async function _e(e){const t=globalThis.navigator?.storage;if(typeof t?.getDirectory=="function")try{await(await t.getDirectory()).removeEntry(e.replace(/^\/+/,""),{recursive:!0})}catch(a){if(a instanceof DOMException&&a.name==="NotFoundError")return;throw a}}async function ye(e){const t=(await import("./index-CtlrAftU.js")).default,a=await t(),r=x(e);try{const s=await a.installOpfsSAHPoolVfs({name:Y,directory:M,initialCapacity:z,clearOnInit:!1});try{s.unlink(r)}catch{}await s.wipeFiles(),await s.removeVfs()}catch(s){console.warn("[WebSQLiteAdapter] SAH-pool reset failed, removing OPFS directory:",s),await _e(M)}}var Ne=class{sqlite3=null;db=null;poolUtil=null;_config=null;inTransaction=!1;lastTransactionActivityAt=0;storageMode="memory";openPhaseTimings=null;schemaApplyMs=0;openRetryAttempts=0;stmts=new Ee;getOpenPhaseTimings(){return this.openPhaseTimings?{...this.openPhaseTimings}:null}async open(e){if(this.db!==null)throw new Error("Database already open. Call close() first.");p("[WebSQLiteAdapter] Starting open()...");const t=E();let a=t,r=t,s=t,n=t,o=t;p("[WebSQLiteAdapter] Importing sqlite-wasm...");const c=(await import("./index-CtlrAftU.js")).default;p("[WebSQLiteAdapter] sqlite-wasm imported"),a=E(),p("[WebSQLiteAdapter] Initializing sqlite3 module..."),this.sqlite3=await c(),p("[WebSQLiteAdapter] sqlite3 module initialized"),r=E();try{await ue(async()=>{p("[WebSQLiteAdapter] Installing OPFS-SAHPool VFS..."),this.poolUtil=await this.sqlite3.installOpfsSAHPoolVfs({name:Y,directory:M,initialCapacity:z,clearOnInit:!1}),p("[WebSQLiteAdapter] OPFS-SAHPool VFS installed"),s=E(),p("[WebSQLiteAdapter] Reserving capacity..."),await this.poolUtil.reserveMinimumCapacity(10),p("[WebSQLiteAdapter] Capacity reserved"),n=E();const i=x(e);p("[WebSQLiteAdapter] Opening database at",i),this.db=new this.poolUtil.OpfsSAHPoolDb(i,"c"),this.storageMode="opfs",p("[WebSQLiteAdapter] Database opened with OPFS-SAHPool"),o=E()},{onRetry:(i,l)=>{this.openRetryAttempts=i,console.warn(`[WebSQLiteAdapter] OPFS access handles are busy (attempt ${i}) — a previous tab/worker is likely still releasing them; retrying before any in-memory fallback.`,l)}})}catch(i){const l=se();l.mode==="async-opfs"?console.info("[WebSQLiteAdapter] Sync access handles unavailable — "+l.reason):console.warn("[WebSQLiteAdapter] OPFS-SAHPool not available, trying OPFS direct mode:",i);const T=x(e),F=this.sqlite3?.oo1?.OpfsDb;if(typeof F=="function")try{this.db=new F(T,"c"),this.storageMode="opfs",p("[WebSQLiteAdapter] Database opened with OPFS direct mode")}catch(R){p("[WebSQLiteAdapter] OPFS direct mode not available:",R),this.db=new this.sqlite3.oo1.DB(":memory:","c"),this.storageMode="memory"}else this.db=new this.sqlite3.oo1.DB(":memory:","c"),this.storageMode="memory";if(this.storageMode==="memory"){const R=W(i)?"another xNet tab/worker is holding the local database":"OPFS is unavailable in this browser context";console.error(`[WebSQLiteAdapter] Using an IN-MEMORY database (${R}). Local data will NOT persist across reloads and the workspace will appear empty until it re-syncs from the hub. Close other xNet tabs and reload to restore persistent storage.`)}}this._config=e;const h=E();e.foreignKeys!==!1&&this.execSync("PRAGMA foreign_keys = ON"),e.busyTimeout?this.execSync(`PRAGMA busy_timeout = ${e.busyTimeout}`):this.execSync("PRAGMA busy_timeout = 5000");try{this.execSync("PRAGMA page_size = 8192")}catch(i){p("[WebSQLiteAdapter] page_size pragma not applied:",i)}try{this.execSync("PRAGMA auto_vacuum = INCREMENTAL")}catch(i){p("[WebSQLiteAdapter] auto_vacuum pragma not applied:",i)}this.execSync("PRAGMA synchronous = NORMAL"),this.execSync("PRAGMA cache_size = -262144");try{this.execSync("PRAGMA mmap_size = 268435456")}catch(i){p("[WebSQLiteAdapter] mmap_size pragma not applied:",i)}this.execSync("PRAGMA temp_store = MEMORY");try{this.execSync("PRAGMA journal_mode = TRUNCATE")}catch(i){p("[WebSQLiteAdapter] journal_mode pragma not applied:",i)}try{this.execSync("PRAGMA analysis_limit = 400"),this.execSync("PRAGMA optimize = 0x10002")}catch(i){p("[WebSQLiteAdapter] open-time optimize not applied:",i)}const u=E(),d=(i,l)=>Math.round(l-i);this.openPhaseTimings={wasmImportMs:d(t,a),wasmInitMs:d(a,r),vfsInstallMs:d(r,s),reserveCapacityMs:d(s,n),dbOpenMs:d(n,o),pragmasMs:d(h,u),totalOpenMs:d(t,u)}}async close(){if(this.stmts.clear(),this.db){try{this.execSync("PRAGMA optimize")}catch(e){p("[WebSQLiteAdapter] optimize on close skipped:",e)}this.db.close(),this.db=null}this.sqlite3=null,this.poolUtil=null,this._config=null}isOpen(){return this.db!==null}getStorageMode(){return this.storageMode}isInTransaction(){return this.inTransaction}transactionIdleMs(){return this.inTransaction?E()-this.lastTransactionActivityAt:0}touchTransaction(){this.inTransaction&&(this.lastTransactionActivityAt=E())}getCachedStmt(e){if(he(e))return null;let t=this.stmts.get(e);return t===void 0&&(t=this.db.prepare(e),this.stmts.set(e,t)),t}async query(e,t){this.ensureOpen(),this.touchTransaction();const a=[],r=this.getCachedStmt(e);if(r===null)return this.db.exec({sql:e,bind:t,rowMode:"object",callback:s=>{a.push(s)}}),a;try{for(t&&t.length>0&&r.bind(t);r.step();)a.push(r.get({}))}finally{r.reset(),r.clearBindings()}return a}async queryOne(e,t){return(await this.query(e,t))[0]??null}async queryBatch(e){const t=[];for(const a of e)t.push(await this.query(a.sql,a.params));return t}async run(e,t){this.ensureOpen(),this.touchTransaction();const a=this.getCachedStmt(e);if(a===null)this.db.exec({sql:e,bind:t});else try{for(t&&t.length>0&&a.bind(t);a.step(););}finally{a.reset(),a.clearBindings()}return{changes:this.sqlite3.capi.sqlite3_changes(this.db.pointer),lastInsertRowid:this.sqlite3.capi.sqlite3_last_insert_rowid(this.db.pointer)}}async exec(e){this.ensureOpen(),this.stmts.clear(),this.execSync(e)}execSync(e){this.db.exec({sql:e})}async transaction(e){await this.beginTransaction();try{const t=await e();return await this.commit(),t}catch(t){if(this.inTransaction)try{await this.rollback()}catch(a){if(C(a)&&!C(t))throw a}throw t}}async applyNodeBatch(e){return await this.transaction(async()=>{for(const t of e.nodes)await this.run(`INSERT INTO nodes (id, schema_id, created_at, updated_at, created_by, deleted_at)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             schema_id = excluded.schema_id,
             updated_at = excluded.updated_at,
             deleted_at = excluded.deleted_at`,[t.id,t.schemaId,t.createdAt,t.updatedAt,t.createdBy,t.deletedAt]),t.propertyKeys.length===0?await this.run("DELETE FROM node_properties WHERE node_id = ?",[t.id]):await this.run(`DELETE FROM node_properties
             WHERE node_id = ? AND property_key NOT IN (${t.propertyKeys.map(()=>"?").join(", ")})`,[t.id,...t.propertyKeys]);for(const t of e.properties)await this.run(`INSERT INTO node_properties
              (node_id, property_key, value, lamport_time, updated_by, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(node_id, property_key) DO UPDATE SET
              value = excluded.value,
              lamport_time = excluded.lamport_time,
              updated_by = excluded.updated_by,
              updated_at = excluded.updated_at
            WHERE excluded.lamport_time > node_properties.lamport_time
               OR (excluded.lamport_time = node_properties.lamport_time
                   AND (excluded.updated_at > node_properties.updated_at
                        OR (excluded.updated_at = node_properties.updated_at
                            AND excluded.updated_by > node_properties.updated_by)))`,[t.nodeId,t.propertyKey,t.value,t.lamportTime,t.updatedBy,t.updatedAt]);if(e.indexMode!=="defer-schema"){for(const t of e.nodes)await this.run("DELETE FROM node_property_scalars WHERE node_id = ?",[t.id]);for(const t of e.scalarIndexRows)await this.run(`INSERT INTO node_property_scalars
                (
                  node_id,
                  schema_id,
                  property_key,
                  value_type,
                  value_text,
                  value_number,
                  value_boolean,
                  value_hash,
                  updated_at,
                  lamport_time
                )
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,[t.nodeId,t.schemaId,t.propertyKey,t.valueType,t.valueText,t.valueNumber,t.valueBoolean,t.valueHash,t.updatedAt,t.lamportTime]);for(const t of e.ftsNodeIds)await this.run("DELETE FROM nodes_fts WHERE node_id = ?",[t]);for(const t of e.ftsRows)await this.run("INSERT INTO nodes_fts (node_id, title, content) VALUES (?, ?, ?)",[t.nodeId,t.title,t.content])}for(const t of e.changes)await this.run(`INSERT OR IGNORE INTO changes
            (hash, node_id, payload, lamport_time, lamport_peer, wall_time, author, parent_hash, batch_id, signature)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,[t.hash,t.nodeId,t.payload,t.lamportTime,t.lamportPeer,t.wallTime,t.author,t.parentHash,t.batchId,t.signature]);if(await this.run(`INSERT INTO sync_state (key, value) VALUES ('lastLamportTime', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,[String(e.lastLamportTime)]),e.indexMode!=="defer-schema"){const t=Date.now();for(const a of e.affectedSchemaIds)await this.run(`UPDATE node_query_materializations
             SET invalidated_at = ?
             WHERE schema_id = ? AND invalidated_at IS NULL`,[t,a])}}),{nodeRowsWritten:e.nodes.length,propertyRowsWritten:e.properties.length,changeRowsWritten:e.changes.length,scalarRowsWritten:e.scalarIndexRows.length,ftsRowsWritten:e.ftsRows.length}}async beginTransaction(){if(this.inTransaction)throw new Error("Transaction already in progress");this.execSync("BEGIN IMMEDIATE"),this.inTransaction=!0,this.lastTransactionActivityAt=E()}async commit(){if(!this.inTransaction)throw new Error("No transaction in progress");try{this.execSync("COMMIT"),this.inTransaction=!1}catch(e){throw C(e)&&(this.inTransaction=!1),e}}async rollback(){if(this.inTransaction)try{this.execSync("ROLLBACK")}finally{this.inTransaction=!1}}async prepare(e){return{query:async t=>this.query(e,t),queryOne:async t=>this.queryOne(e,t),run:async t=>this.run(e,t),finalize:async()=>{}}}async getSchemaVersion(){try{return(await this.queryOne("SELECT version FROM _schema_version ORDER BY version DESC LIMIT 1"))?.version??0}catch{return 0}}async setSchemaVersion(e){await this.run("INSERT INTO _schema_version (version, applied_at) VALUES (?, ?)",[e,Date.now()])}async applySchema(e,t){return await this.getSchemaVersion()>=e?!1:(await this.transaction(async()=>{await this.exec(t),await this.setSchemaVersion(e)}),!0)}async getDatabaseSize(){try{return(await this.queryOne("SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()"))?.size??0}catch{return 0}}async vacuum(){await this.exec("VACUUM")}async incrementalVacuum(e){return this.ensureOpen(),fe(this.db,e)}async checkpoint(){return 0}ensureOpen(){if(!this.db||!this.sqlite3)throw new Error("Database not open. Call open() first.")}};function fe(e,t){const a=t!==void 0&&t>0?Math.floor(t):1/0,r=e.prepare("PRAGMA incremental_vacuum");let s=0;try{for(;s<a&&r.step();)s++}finally{r.finalize()}return s}async function me(e){const t=new Ne;await t.open(e);const a=E();return await t.applySchema(oe,le),t.schemaApplyMs=Math.round(E()-a),t}var Se="__xnetSqliteBootLog";function Oe(e){return{[Se]:e}}/**
 * @license
 * Copyright 2019 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */const H=Symbol("Comlink.proxy"),Le=Symbol("Comlink.endpoint"),Ie=Symbol("Comlink.releaseProxy"),v=Symbol("Comlink.finalizer"),O=Symbol("Comlink.thrown"),Q=e=>typeof e=="object"&&e!==null||typeof e=="function",Ae={canHandle:e=>Q(e)&&e[H],serialize(e){const{port1:t,port2:a}=new MessageChannel;return g(e,t),[a,[a]]},deserialize(e){return e.start(),be(e)}},ge={canHandle:e=>Q(e)&&O in e,serialize({value:e}){let t;return e instanceof Error?t={isError:!0,value:{message:e.message,name:e.name,stack:e.stack}}:t={isError:!1,value:e},[t,[]]},deserialize(e){throw e.isError?Object.assign(new Error(e.value.message),e.value):e.value}},V=new Map([["proxy",Ae],["throw",ge]]);function Re(e,t){for(const a of e)if(t===a||a==="*"||a instanceof RegExp&&a.test(t))return!0;return!1}function g(e,t=globalThis,a=["*"]){t.addEventListener("message",function r(s){if(!s||!s.data)return;if(!Re(a,s.origin)){console.warn(`Invalid origin '${s.origin}' for comlink proxy`);return}const{id:n,type:o,path:c}=Object.assign({path:[]},s.data),h=(s.data.argumentList||[]).map(_);let u;try{const d=c.slice(0,-1).reduce((l,T)=>l[T],e),i=c.reduce((l,T)=>l[T],e);switch(o){case"GET":u=i;break;case"SET":d[c.slice(-1)[0]]=_(s.data.value),u=!0;break;case"APPLY":u=i.apply(d,h);break;case"CONSTRUCT":{const l=new i(...h);u=xe(l)}break;case"ENDPOINT":{const{port1:l,port2:T}=new MessageChannel;g(e,T),u=Me(l,[l])}break;case"RELEASE":u=void 0;break;default:return}}catch(d){u={value:d,[O]:0}}Promise.resolve(u).catch(d=>({value:d,[O]:0})).then(d=>{const[i,l]=A(d);t.postMessage(Object.assign(Object.assign({},i),{id:n}),l),o==="RELEASE"&&(t.removeEventListener("message",r),j(t),v in e&&typeof e[v]=="function"&&e[v]())}).catch(d=>{const[i,l]=A({value:new TypeError("Unserializable return value"),[O]:0});t.postMessage(Object.assign(Object.assign({},i),{id:n}),l)})}),t.start&&t.start()}function we(e){return e.constructor.name==="MessagePort"}function j(e){we(e)&&e.close()}function be(e,t){const a=new Map;return e.addEventListener("message",function(s){const{data:n}=s;if(!n||!n.id)return;const o=a.get(n.id);if(o)try{o(n)}finally{a.delete(n.id)}}),X(e,a,[],t)}function S(e){if(e)throw new Error("Proxy has been released and is not useable")}function K(e){return y(e,new Map,{type:"RELEASE"}).then(()=>{j(e)})}const L=new WeakMap,I="FinalizationRegistry"in globalThis&&new FinalizationRegistry(e=>{const t=(L.get(e)||0)-1;L.set(e,t),t===0&&K(e)});function Ce(e,t){const a=(L.get(t)||0)+1;L.set(t,a),I&&I.register(e,t,e)}function ve(e){I&&I.unregister(e)}function X(e,t,a=[],r=function(){}){let s=!1;const n=new Proxy(r,{get(o,c){if(S(s),c===Ie)return()=>{ve(n),K(e),t.clear(),s=!0};if(c==="then"){if(a.length===0)return{then:()=>n};const h=y(e,t,{type:"GET",path:a.map(u=>u.toString())}).then(_);return h.then.bind(h)}return X(e,t,[...a,c])},set(o,c,h){S(s);const[u,d]=A(h);return y(e,t,{type:"SET",path:[...a,c].map(i=>i.toString()),value:u},d).then(_)},apply(o,c,h){S(s);const u=a[a.length-1];if(u===Le)return y(e,t,{type:"ENDPOINT"}).then(_);if(u==="bind")return X(e,t,a.slice(0,-1));const[d,i]=q(h);return y(e,t,{type:"APPLY",path:a.map(l=>l.toString()),argumentList:d},i).then(_)},construct(o,c){S(s);const[h,u]=q(c);return y(e,t,{type:"CONSTRUCT",path:a.map(d=>d.toString()),argumentList:h},u).then(_)}});return Ce(n,e),n}function De(e){return Array.prototype.concat.apply([],e)}function q(e){const t=e.map(A);return[t.map(a=>a[0]),De(t.map(a=>a[1]))]}const $=new WeakMap;function Me(e,t){return $.set(e,t),e}function xe(e){return Object.assign(e,{[H]:!0})}function A(e){for(const[t,a]of V)if(a.canHandle(e)){const[r,s]=a.serialize(e);return[{type:"HANDLER",name:t,value:r},s]}return[{type:"RAW",value:e},$.get(e)||[]]}function _(e){switch(e.type){case"HANDLER":return V.get(e.name).deserialize(e.value);case"RAW":return e.value}}function y(e,t,a,r){return new Promise(s=>{const n=Xe();t.set(n,s),e.start&&e.start(),e.postMessage(Object.assign({id:n},a),r)})}function Xe(){return new Array(4).fill(0).map(()=>Math.floor(Math.random()*Number.MAX_SAFE_INTEGER).toString(16)).join("-")}function G(e,t,a){return`${e}\0${t}\0${a?JSON.stringify(a):""}`}function D(...e){console.info(...e);try{self.postMessage(Oe(e))}catch{}}function f(e){const t=e.replace(/\s+/g," ").trim();return t.length>160?`${t.slice(0,157)}…`:t}function Ue(){return typeof performance<"u"&&typeof performance.now=="function"?performance.now():Date.now()}function Fe(){return typeof self<"u"&&typeof localStorage<"u"&&localStorage.getItem("xnet:sqlite:debug")==="true"}function N(...e){Fe()&&console.log(...e)}N("[SQLiteWorker] Worker script loaded, Comlink imported");var Pe=class{adapter=null;bootDebug=!1;openedAtMs=0;firstOpReported=!1;scheduler=new Z(e=>{if(!this.bootDebug)return;const t=!this.firstOpReported&&this.openedAtMs>0;t&&(this.firstOpReported=!0),D("[xNet] sqlite op",e.label??e.lane,{lane:e.lane,...e.detail?{sql:e.detail}:{},queueMs:Math.round(e.queueMs),execMs:Math.round(e.execMs),...t?J(e,this.openedAtMs):{}})});async open(e){if(N("[SQLiteWorkerHandler] open() called with config:",e),this.adapter)throw new Error("Database already open");this.bootDebug=e.bootDebug??!1,this.adapter=await me(e),this.openedAtMs=Ue(),N("[SQLiteWorkerHandler] open() completed"),this.bootDebug&&(this.logOpenPhases(),await this.logDbStats())}logOpenPhases(){if(this.adapter)try{const e=this.adapter.getOpenPhaseTimings();if(!e)return;D("[xNet] sqlite open phases",{...e,schemaApplyMs:this.adapter.schemaApplyMs,retryAttempts:this.adapter.openRetryAttempts,mode:this.adapter.getStorageMode()})}catch{}}async logDbStats(){if(this.adapter)try{const[e,t,a,r]=await Promise.all([this.adapter.getDatabaseSize(),this.adapter.getStorageMode(),this.adapter.queryOne("PRAGMA page_count"),this.adapter.queryOne("PRAGMA freelist_count")]);D("[xNet] db stats @ open",{bytes:e,mode:t,pageCount:a?.page_count,freelistCount:r?.freelist_count})}catch{}}async resetStorage(e){this.adapter&&(await this.adapter.close(),this.adapter=null),await ye(e)}async close(){if(this.adapter)return this.scheduler.schedule("write",async()=>{this.adapter&&(await this.adapter.close(),this.adapter=null)},void 0,"close")}isOpen(){return this.adapter?.isOpen()??!1}async query(e,t){if(!this.adapter)throw new Error("Database not open");return this.scheduler.schedule("interactive",()=>this.adapter.query(e,t),G("query",e,t),"query",f(e))}async queryOne(e,t){if(!this.adapter)throw new Error("Database not open");return this.scheduler.schedule("interactive",()=>this.adapter.queryOne(e,t),G("queryOne",e,t),"queryOne",f(e))}async queryBatch(e){if(!this.adapter)throw new Error("Database not open");return e.length===0?[]:this.scheduler.schedule("interactive",()=>this.adapter.queryBatch(e),void 0,"queryBatch",`${e.length} reads: ${f(e[0].sql)}`)}async run(e,t){if(!this.adapter)throw new Error("Database not open");return this.scheduler.schedule("write",()=>this.adapter.run(e,t),void 0,"run",f(e))}async exec(e){if(!this.adapter)throw new Error("Database not open");return this.scheduler.schedule("write",()=>this.adapter.exec(e),void 0,"exec",f(e))}async transaction(e){if(!this.adapter)throw new Error("Database not open");return this.scheduler.schedule("write",()=>this.adapter.transaction(async()=>{for(const t of e)await this.adapter.run(t.sql,t.params)}),void 0,"transaction")}async applyNodeBatch(e){if(!this.adapter)throw new Error("Database not open");return this.scheduler.schedule("write",()=>this.adapter.applyNodeBatch(e),void 0,"applyNodeBatch")}async getSchemaVersion(){if(!this.adapter)throw new Error("Database not open");return this.adapter.getSchemaVersion()}async vacuum(){if(!this.adapter)throw new Error("Database not open");return this.scheduler.schedule("write",()=>this.adapter.vacuum(),void 0,"vacuum")}async incrementalVacuum(e){if(!this.adapter)throw new Error("Database not open");return this.scheduler.schedule("write",()=>this.adapter.incrementalVacuum(e),void 0,"incremental_vacuum")}async getSchedulerSnapshot(){return this.scheduler.snapshot()}async getSchedulerOpStats(){return this.scheduler.opStats()}async resetSchedulerOpStats(){this.scheduler.resetOpStats()}async getDatabaseSize(){if(!this.adapter)throw new Error("Database not open");return this.adapter.getDatabaseSize()}async getStorageMode(){if(!this.adapter)throw new Error("Database not open");return this.adapter.getStorageMode()}connectPort(e){g(this,e),this.scheduleAbandonedTransactionRecovery()}scheduleAbandonedTransactionRecovery(){this.scheduler.schedule("write",async()=>{const e=this.adapter;!e||!e.isInTransaction()||e.transactionIdleMs()<ke||(console.warn("[SQLiteWorkerHandler] Rolling back an abandoned transaction — a client likely died between BEGIN and COMMIT (0263 lease recovery)."),await e.rollback())},void 0,"txn-recovery").catch(()=>{})}},ke=5e3,qe=new Pe;N("[SQLiteWorker] Handler instance created");N("[SQLiteWorker] Exposing handler via Comlink...");g(qe);N("[SQLiteWorker] Handler exposed - worker ready!");
