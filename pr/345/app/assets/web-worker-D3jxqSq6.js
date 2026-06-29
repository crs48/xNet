var H=["interactive","bulk","write"];function R(){return typeof performance<"u"&&typeof performance.now=="function"?performance.now():Date.now()}var z=class{constructor(e){this.onOp=e}queues={interactive:[],bulk:[],write:[]};coalesced=new Map;running=!1;schedule(e,t,a,n,r){if(a!==void 0){const i=this.coalesced.get(a);if(i)return i}const s=new Promise((i,o)=>{this.queues[e].push({run:t,resolve:i,reject:o,lane:e,label:n,detail:r,enqueuedAt:R()})});if(a!==void 0){this.coalesced.set(a,s);const i=()=>{this.coalesced.get(a)===s&&this.coalesced.delete(a)};s.then(i,i)}return this.pump(),s}snapshot(){return{interactive:this.queues.interactive.length,bulk:this.queues.bulk.length,write:this.queues.write.length,inFlight:this.running}}next(){for(const e of H){const t=this.queues[e].shift();if(t)return t}}async pump(){if(!this.running){this.running=!0;try{let e;for(;e=this.next();){const t=R();try{e.resolve(await e.run())}catch(a){e.reject(a)}finally{if(this.onOp){const a=R();this.onOp({lane:e.lane,label:e.label,detail:e.detail,queueMs:t-e.enqueuedAt,execMs:a-t})}}}}finally{this.running=!1}}}};function D(e){return globalThis}function Q(e){return typeof D().navigator?.storage?.getDirectory=="function"}function V(e){const t=D();if(typeof t.FileSystemSyncAccessHandle<"u")return!0;const a=t.FileSystemFileHandle?.prototype;return!!(a&&"createSyncAccessHandle"in a)}function j(e){const t=D();return typeof t.SharedArrayBuffer<"u"&&t.crossOriginIsolated===!0}function K(e){const t=Q(),a=V(),n=j();let r,s;return t?a?(r="sync-access-handle",s="OPFS sync access handles available — using the durable opfs-sahpool fast path."):(r="async-opfs",s="OPFS is available but sync access handles are not (iOS 15.2–16.3 or an older WebView); falling back to the slower async OPFS backend. Data still persists."):(r="memory",s="OPFS is unavailable in this context (private browsing or an unsupported engine); local data will not persist across reloads."),{opfs:t,syncAccessHandle:a,crossOriginIsolated:n,mode:r,reason:s}}var $=11,J=26;function Z(e){return!e||typeof e!="object"?null:e}function A(e){return U(e,new Set)}function U(e,t){const a=Z(e);if(!a||t.has(e))return!1;t.add(e);const n=typeof a.message=="string"?a.message.toLowerCase():String(a.message),r=typeof a.code=="string"?a.code.toUpperCase():"",s=typeof a.resultCode=="number"?a.resultCode:null;return s===$||s===J||r==="SQLITE_CORRUPT"||r==="SQLITE_NOTADB"||n.includes("sqlite_corrupt")||n.includes("sqlite_notadb")||n.includes("database disk image is malformed")||n.includes("file is not a database")||U(a.cause,t)}var ee=7,te=`
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

CREATE INDEX IF NOT EXISTS idx_updates_doc ON updates(doc_id);
CREATE INDEX IF NOT EXISTS idx_updates_created ON updates(created_at);
`,ae=`
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
`,re=te+ae;function F(e){const t=e;return t?t.name==="NoModificationAllowedError"?!0:/Access Handles cannot be created|createSyncAccessHandle/i.test(t.message??""):!1}async function se(e,t={}){const a=t.attempts??5,n=t.baseDelayMs??150,r=t.sleep??(i=>new Promise(o=>setTimeout(o,i)));let s;for(let i=1;i<=a;i++)try{return await e()}catch(o){if(s=o,!F(o)||i===a)throw o;t.onRetry?.(i,o),await r(n*i)}throw s}var M="opfs-sahpool",b=".xnet-sqlite",P=10;function ne(){return typeof self<"u"&&typeof localStorage<"u"&&localStorage.getItem("xnet:sqlite:debug")==="true"}function c(...e){ne()&&console.log(...e)}function w(e){return e.path.startsWith("/")?e.path:`/${e.path}`}async function ie(e){const t=globalThis.navigator?.storage;if(typeof t?.getDirectory=="function")try{await(await t.getDirectory()).removeEntry(e.replace(/^\/+/,""),{recursive:!0})}catch(a){if(a instanceof DOMException&&a.name==="NotFoundError")return;throw a}}async function oe(e){const t=(await import("./index-C666N-pi.js")).default,a=await t(),n=w(e);try{const r=await a.installOpfsSAHPoolVfs({name:M,directory:b,initialCapacity:P,clearOnInit:!1});try{r.unlink(n)}catch{}await r.wipeFiles(),await r.removeVfs()}catch(r){console.warn("[WebSQLiteAdapter] SAH-pool reset failed, removing OPFS directory:",r),await ie(b)}}var de=class{sqlite3=null;db=null;poolUtil=null;_config=null;inTransaction=!1;storageMode="memory";async open(e){if(this.db!==null)throw new Error("Database already open. Call close() first.");c("[WebSQLiteAdapter] Starting open()..."),c("[WebSQLiteAdapter] Importing sqlite-wasm...");const t=(await import("./index-C666N-pi.js")).default;c("[WebSQLiteAdapter] sqlite-wasm imported"),c("[WebSQLiteAdapter] Initializing sqlite3 module..."),this.sqlite3=await t(),c("[WebSQLiteAdapter] sqlite3 module initialized");try{await se(async()=>{c("[WebSQLiteAdapter] Installing OPFS-SAHPool VFS..."),this.poolUtil=await this.sqlite3.installOpfsSAHPoolVfs({name:M,directory:b,initialCapacity:P,clearOnInit:!1}),c("[WebSQLiteAdapter] OPFS-SAHPool VFS installed"),c("[WebSQLiteAdapter] Reserving capacity..."),await this.poolUtil.reserveMinimumCapacity(10),c("[WebSQLiteAdapter] Capacity reserved");const a=w(e);c("[WebSQLiteAdapter] Opening database at",a),this.db=new this.poolUtil.OpfsSAHPoolDb(a,"c"),this.storageMode="opfs",c("[WebSQLiteAdapter] Database opened with OPFS-SAHPool")},{onRetry:(a,n)=>{console.warn(`[WebSQLiteAdapter] OPFS access handles are busy (attempt ${a}) — a previous tab/worker is likely still releasing them; retrying before any in-memory fallback.`,n)}})}catch(a){const n=K();n.mode==="async-opfs"?console.info("[WebSQLiteAdapter] Sync access handles unavailable — "+n.reason):console.warn("[WebSQLiteAdapter] OPFS-SAHPool not available, trying OPFS direct mode:",a);const r=w(e),s=this.sqlite3?.oo1?.OpfsDb;if(typeof s=="function")try{this.db=new s(r,"c"),this.storageMode="opfs",c("[WebSQLiteAdapter] Database opened with OPFS direct mode")}catch(i){c("[WebSQLiteAdapter] OPFS direct mode not available:",i),this.db=new this.sqlite3.oo1.DB(":memory:","c"),this.storageMode="memory"}else this.db=new this.sqlite3.oo1.DB(":memory:","c"),this.storageMode="memory";if(this.storageMode==="memory"){const i=F(a)?"another xNet tab/worker is holding the local database":"OPFS is unavailable in this browser context";console.error(`[WebSQLiteAdapter] Using an IN-MEMORY database (${i}). Local data will NOT persist across reloads and the workspace will appear empty until it re-syncs from the hub. Close other xNet tabs and reload to restore persistent storage.`)}}this._config=e,e.foreignKeys!==!1&&this.execSync("PRAGMA foreign_keys = ON"),e.busyTimeout?this.execSync(`PRAGMA busy_timeout = ${e.busyTimeout}`):this.execSync("PRAGMA busy_timeout = 5000");try{this.execSync("PRAGMA page_size = 8192")}catch(a){c("[WebSQLiteAdapter] page_size pragma not applied:",a)}this.execSync("PRAGMA synchronous = NORMAL"),this.execSync("PRAGMA cache_size = -262144");try{this.execSync("PRAGMA mmap_size = 268435456")}catch(a){c("[WebSQLiteAdapter] mmap_size pragma not applied:",a)}this.execSync("PRAGMA temp_store = MEMORY");try{this.execSync("PRAGMA journal_mode = TRUNCATE")}catch(a){c("[WebSQLiteAdapter] journal_mode pragma not applied:",a)}}async close(){if(this.db){try{this.execSync("PRAGMA optimize")}catch(e){c("[WebSQLiteAdapter] optimize on close skipped:",e)}this.db.close(),this.db=null}this.sqlite3=null,this.poolUtil=null,this._config=null}isOpen(){return this.db!==null}getStorageMode(){return this.storageMode}async query(e,t){this.ensureOpen();const a=[];return this.db.exec({sql:e,bind:t,rowMode:"object",callback:n=>{a.push(n)}}),a}async queryOne(e,t){return(await this.query(e,t))[0]??null}async run(e,t){return this.ensureOpen(),this.db.exec({sql:e,bind:t}),{changes:this.sqlite3.capi.sqlite3_changes(this.db.pointer),lastInsertRowid:this.sqlite3.capi.sqlite3_last_insert_rowid(this.db.pointer)}}async exec(e){this.ensureOpen(),this.execSync(e)}execSync(e){this.db.exec({sql:e})}async transaction(e){await this.beginTransaction();try{const t=await e();return await this.commit(),t}catch(t){if(this.inTransaction)try{await this.rollback()}catch(a){if(A(a)&&!A(t))throw a}throw t}}async applyNodeBatch(e){return await this.transaction(async()=>{for(const t of e.nodes)await this.run(`INSERT INTO nodes (id, schema_id, created_at, updated_at, created_by, deleted_at)
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
            WHERE excluded.lamport_time > node_properties.lamport_time`,[t.nodeId,t.propertyKey,t.value,t.lamportTime,t.updatedBy,t.updatedAt]);if(e.indexMode!=="defer-schema"){for(const t of e.nodes)await this.run("DELETE FROM node_property_scalars WHERE node_id = ?",[t.id]);for(const t of e.scalarIndexRows)await this.run(`INSERT INTO node_property_scalars
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
             WHERE schema_id = ? AND invalidated_at IS NULL`,[t,a])}}),{nodeRowsWritten:e.nodes.length,propertyRowsWritten:e.properties.length,changeRowsWritten:e.changes.length,scalarRowsWritten:e.scalarIndexRows.length,ftsRowsWritten:e.ftsRows.length}}async beginTransaction(){if(this.inTransaction)throw new Error("Transaction already in progress");this.execSync("BEGIN IMMEDIATE"),this.inTransaction=!0}async commit(){if(!this.inTransaction)throw new Error("No transaction in progress");try{this.execSync("COMMIT"),this.inTransaction=!1}catch(e){throw A(e)&&(this.inTransaction=!1),e}}async rollback(){if(this.inTransaction)try{this.execSync("ROLLBACK")}finally{this.inTransaction=!1}}async prepare(e){return{query:async t=>this.query(e,t),queryOne:async t=>this.queryOne(e,t),run:async t=>this.run(e,t),finalize:async()=>{}}}async getSchemaVersion(){try{return(await this.queryOne("SELECT version FROM _schema_version ORDER BY version DESC LIMIT 1"))?.version??0}catch{return 0}}async setSchemaVersion(e){await this.run("INSERT INTO _schema_version (version, applied_at) VALUES (?, ?)",[e,Date.now()])}async applySchema(e,t){return await this.getSchemaVersion()>=e?!1:(await this.transaction(async()=>{await this.exec(t),await this.setSchemaVersion(e)}),!0)}async getDatabaseSize(){try{return(await this.queryOne("SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()"))?.size??0}catch{return 0}}async vacuum(){await this.exec("VACUUM")}async checkpoint(){return 0}ensureOpen(){if(!this.db||!this.sqlite3)throw new Error("Database not open. Call open() first.")}};async function ce(e){const t=new de;return await t.open(e),await t.applySchema(ee,re),t}var le="__xnetSqliteBootLog";function Ee(e){return{[le]:e}}/**
 * @license
 * Copyright 2019 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */const k=Symbol("Comlink.proxy"),ue=Symbol("Comlink.endpoint"),pe=Symbol("Comlink.releaseProxy"),g=Symbol("Comlink.finalizer"),S=Symbol("Comlink.thrown"),q=e=>typeof e=="object"&&e!==null||typeof e=="function",Te={canHandle:e=>q(e)&&e[k],serialize(e){const{port1:t,port2:a}=new MessageChannel;return I(e,t),[a,[a]]},deserialize(e){return e.start(),ye(e)}},he={canHandle:e=>q(e)&&S in e,serialize({value:e}){let t;return e instanceof Error?t={isError:!0,value:{message:e.message,name:e.name,stack:e.stack}}:t={isError:!1,value:e},[t,[]]},deserialize(e){throw e.isError?Object.assign(new Error(e.value.message),e.value):e.value}},W=new Map([["proxy",Te],["throw",he]]);function _e(e,t){for(const a of e)if(t===a||a==="*"||a instanceof RegExp&&a.test(t))return!0;return!1}function I(e,t=globalThis,a=["*"]){t.addEventListener("message",function n(r){if(!r||!r.data)return;if(!_e(a,r.origin)){console.warn(`Invalid origin '${r.origin}' for comlink proxy`);return}const{id:s,type:i,path:o}=Object.assign({path:[]},r.data),u=(r.data.argumentList||[]).map(T);let d;try{const l=o.slice(0,-1).reduce((E,N)=>E[N],e),p=o.reduce((E,N)=>E[N],e);switch(i){case"GET":d=p;break;case"SET":l[o.slice(-1)[0]]=T(r.data.value),d=!0;break;case"APPLY":d=p.apply(l,u);break;case"CONSTRUCT":{const E=new p(...u);d=Le(E)}break;case"ENDPOINT":{const{port1:E,port2:N}=new MessageChannel;I(e,N),d=me(E,[E])}break;case"RELEASE":d=void 0;break;default:return}}catch(l){d={value:l,[S]:0}}Promise.resolve(d).catch(l=>({value:l,[S]:0})).then(l=>{const[p,E]=L(l);t.postMessage(Object.assign(Object.assign({},p),{id:s}),E),i==="RELEASE"&&(t.removeEventListener("message",n),G(t),g in e&&typeof e[g]=="function"&&e[g]())}).catch(l=>{const[p,E]=L({value:new TypeError("Unserializable return value"),[S]:0});t.postMessage(Object.assign(Object.assign({},p),{id:s}),E)})}),t.start&&t.start()}function Ne(e){return e.constructor.name==="MessagePort"}function G(e){Ne(e)&&e.close()}function ye(e,t){const a=new Map;return e.addEventListener("message",function(r){const{data:s}=r;if(!s||!s.id)return;const i=a.get(s.id);if(i)try{i(s)}finally{a.delete(s.id)}}),C(e,a,[],t)}function y(e){if(e)throw new Error("Proxy has been released and is not useable")}function B(e){return h(e,new Map,{type:"RELEASE"}).then(()=>{G(e)})}const O=new WeakMap,m="FinalizationRegistry"in globalThis&&new FinalizationRegistry(e=>{const t=(O.get(e)||0)-1;O.set(e,t),t===0&&B(e)});function fe(e,t){const a=(O.get(t)||0)+1;O.set(t,a),m&&m.register(e,t,e)}function Se(e){m&&m.unregister(e)}function C(e,t,a=[],n=function(){}){let r=!1;const s=new Proxy(n,{get(i,o){if(y(r),o===pe)return()=>{Se(s),B(e),t.clear(),r=!0};if(o==="then"){if(a.length===0)return{then:()=>s};const u=h(e,t,{type:"GET",path:a.map(d=>d.toString())}).then(T);return u.then.bind(u)}return C(e,t,[...a,o])},set(i,o,u){y(r);const[d,l]=L(u);return h(e,t,{type:"SET",path:[...a,o].map(p=>p.toString()),value:d},l).then(T)},apply(i,o,u){y(r);const d=a[a.length-1];if(d===ue)return h(e,t,{type:"ENDPOINT"}).then(T);if(d==="bind")return C(e,t,a.slice(0,-1));const[l,p]=X(u);return h(e,t,{type:"APPLY",path:a.map(E=>E.toString()),argumentList:l},p).then(T)},construct(i,o){y(r);const[u,d]=X(o);return h(e,t,{type:"CONSTRUCT",path:a.map(l=>l.toString()),argumentList:u},d).then(T)}});return fe(s,e),s}function Oe(e){return Array.prototype.concat.apply([],e)}function X(e){const t=e.map(L);return[t.map(a=>a[0]),Oe(t.map(a=>a[1]))]}const Y=new WeakMap;function me(e,t){return Y.set(e,t),e}function Le(e){return Object.assign(e,{[k]:!0})}function L(e){for(const[t,a]of W)if(a.canHandle(e)){const[n,r]=a.serialize(e);return[{type:"HANDLER",name:t,value:n},r]}return[{type:"RAW",value:e},Y.get(e)||[]]}function T(e){switch(e.type){case"HANDLER":return W.get(e.name).deserialize(e.value);case"RAW":return e.value}}function h(e,t,a,n){return new Promise(r=>{const s=Ie();t.set(s,r),e.start&&e.start(),e.postMessage(Object.assign({id:s},a),n)})}function Ie(){return new Array(4).fill(0).map(()=>Math.floor(Math.random()*Number.MAX_SAFE_INTEGER).toString(16)).join("-")}function x(e,t,a){return`${e}\0${t}\0${a?JSON.stringify(a):""}`}function v(...e){console.info(...e);try{self.postMessage(Ee(e))}catch{}}function f(e){const t=e.replace(/\s+/g," ").trim();return t.length>160?`${t.slice(0,157)}…`:t}function Re(){return typeof self<"u"&&typeof localStorage<"u"&&localStorage.getItem("xnet:sqlite:debug")==="true"}function _(...e){Re()&&console.log(...e)}_("[SQLiteWorker] Worker script loaded, Comlink imported");var Ae=class{adapter=null;bootDebug=!1;scheduler=new z(e=>{this.bootDebug&&v("[xNet] sqlite op",e.label??e.lane,{lane:e.lane,...e.detail?{sql:e.detail}:{},queueMs:Math.round(e.queueMs),execMs:Math.round(e.execMs)})});async open(e){if(_("[SQLiteWorkerHandler] open() called with config:",e),this.adapter)throw new Error("Database already open");this.bootDebug=e.bootDebug??!1,this.adapter=await ce(e),_("[SQLiteWorkerHandler] open() completed"),this.bootDebug&&await this.logDbStats()}async logDbStats(){if(this.adapter)try{const[e,t,a,n]=await Promise.all([this.adapter.getDatabaseSize(),this.adapter.getStorageMode(),this.adapter.queryOne("PRAGMA page_count"),this.adapter.queryOne("PRAGMA freelist_count")]);v("[xNet] db stats @ open",{bytes:e,mode:t,pageCount:a?.page_count,freelistCount:n?.freelist_count})}catch{}}async resetStorage(e){this.adapter&&(await this.adapter.close(),this.adapter=null),await oe(e)}async close(){this.adapter&&(await this.adapter.close(),this.adapter=null)}isOpen(){return this.adapter?.isOpen()??!1}async query(e,t){if(!this.adapter)throw new Error("Database not open");return this.scheduler.schedule("interactive",()=>this.adapter.query(e,t),x("query",e,t),"query",f(e))}async queryOne(e,t){if(!this.adapter)throw new Error("Database not open");return this.scheduler.schedule("interactive",()=>this.adapter.queryOne(e,t),x("queryOne",e,t),"queryOne",f(e))}async run(e,t){if(!this.adapter)throw new Error("Database not open");return this.scheduler.schedule("write",()=>this.adapter.run(e,t),void 0,"run",f(e))}async exec(e){if(!this.adapter)throw new Error("Database not open");return this.scheduler.schedule("write",()=>this.adapter.exec(e),void 0,"exec",f(e))}async transaction(e){if(!this.adapter)throw new Error("Database not open");return this.scheduler.schedule("write",()=>this.adapter.transaction(async()=>{for(const t of e)await this.adapter.run(t.sql,t.params)}),void 0,"transaction")}async applyNodeBatch(e){if(!this.adapter)throw new Error("Database not open");return this.scheduler.schedule("write",()=>this.adapter.applyNodeBatch(e),void 0,"applyNodeBatch")}async getSchemaVersion(){if(!this.adapter)throw new Error("Database not open");return this.adapter.getSchemaVersion()}async vacuum(){if(!this.adapter)throw new Error("Database not open");return this.scheduler.schedule("write",()=>this.adapter.vacuum(),void 0,"vacuum")}async getSchedulerSnapshot(){return this.scheduler.snapshot()}async getDatabaseSize(){if(!this.adapter)throw new Error("Database not open");return this.adapter.getDatabaseSize()}async getStorageMode(){if(!this.adapter)throw new Error("Database not open");return this.adapter.getStorageMode()}connectPort(e){I(this,e)}},ge=new Ae;_("[SQLiteWorker] Handler instance created");_("[SQLiteWorker] Exposing handler via Comlink...");I(ge);_("[SQLiteWorker] Handler exposed - worker ready!");
