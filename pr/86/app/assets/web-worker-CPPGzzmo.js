var k=11,W=26;function G(e){return!e||typeof e!="object"?null:e}function R(e){return C(e,new Set)}function C(e,t){const a=G(e);if(!a||t.has(e))return!1;t.add(e);const s=typeof a.message=="string"?a.message.toLowerCase():String(a.message),r=typeof a.code=="string"?a.code.toUpperCase():"",n=typeof a.resultCode=="number"?a.resultCode:null;return n===k||n===W||r==="SQLITE_CORRUPT"||r==="SQLITE_NOTADB"||s.includes("sqlite_corrupt")||s.includes("sqlite_notadb")||s.includes("database disk image is malformed")||s.includes("file is not a database")||C(a.cause,t)}var q=6,B=`
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
    row_count INTEGER NOT NULL
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
`,Y=`
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
`,Q=B+Y,D="opfs-sahpool",A=".xnet-sqlite",X=10;function H(){return typeof self<"u"&&typeof localStorage<"u"&&localStorage.getItem("xnet:sqlite:debug")==="true"}function E(...e){H()&&console.log(...e)}function w(e){return e.path.startsWith("/")?e.path:`/${e.path}`}async function z(e){const t=globalThis.navigator?.storage;if(typeof t?.getDirectory=="function")try{await(await t.getDirectory()).removeEntry(e.replace(/^\/+/,""),{recursive:!0})}catch(a){if(a instanceof DOMException&&a.name==="NotFoundError")return;throw a}}async function K(e){const t=(await import("./index-CAtWnt_D.js")).default,a=await t(),s=w(e);try{const r=await a.installOpfsSAHPoolVfs({name:D,directory:A,initialCapacity:X,clearOnInit:!1});try{r.unlink(s)}catch{}await r.wipeFiles(),await r.removeVfs()}catch(r){console.warn("[WebSQLiteAdapter] SAH-pool reset failed, removing OPFS directory:",r),await z(A)}}var V=class{sqlite3=null;db=null;poolUtil=null;_config=null;inTransaction=!1;storageMode="memory";async open(e){if(this.db!==null)throw new Error("Database already open. Call close() first.");E("[WebSQLiteAdapter] Starting open()..."),E("[WebSQLiteAdapter] Importing sqlite-wasm...");const t=(await import("./index-CAtWnt_D.js")).default;E("[WebSQLiteAdapter] sqlite-wasm imported"),E("[WebSQLiteAdapter] Initializing sqlite3 module..."),this.sqlite3=await t(),E("[WebSQLiteAdapter] sqlite3 module initialized");try{E("[WebSQLiteAdapter] Installing OPFS-SAHPool VFS..."),this.poolUtil=await this.sqlite3.installOpfsSAHPoolVfs({name:D,directory:A,initialCapacity:X,clearOnInit:!1}),E("[WebSQLiteAdapter] OPFS-SAHPool VFS installed"),E("[WebSQLiteAdapter] Reserving capacity..."),await this.poolUtil.reserveMinimumCapacity(10),E("[WebSQLiteAdapter] Capacity reserved");const a=w(e);E("[WebSQLiteAdapter] Opening database at",a),this.db=new this.poolUtil.OpfsSAHPoolDb(a,"c"),this.storageMode="opfs",E("[WebSQLiteAdapter] Database opened with OPFS-SAHPool")}catch(a){console.warn("[WebSQLiteAdapter] OPFS-SAHPool not available, trying OPFS direct mode:",a);const s=w(e),r=this.sqlite3?.oo1?.OpfsDb;if(typeof r=="function")try{this.db=new r(s,"c"),this.storageMode="opfs",E("[WebSQLiteAdapter] Database opened with OPFS direct mode")}catch(n){console.warn("[WebSQLiteAdapter] OPFS direct mode not available, using in-memory database:",n),this.db=new this.sqlite3.oo1.DB(":memory:","c"),this.storageMode="memory",E("[WebSQLiteAdapter] In-memory database opened")}else console.warn("[WebSQLiteAdapter] OPFS direct mode unavailable, using in-memory database"),this.db=new this.sqlite3.oo1.DB(":memory:","c"),this.storageMode="memory",E("[WebSQLiteAdapter] In-memory database opened")}this._config=e,e.foreignKeys!==!1&&this.execSync("PRAGMA foreign_keys = ON"),e.busyTimeout?this.execSync(`PRAGMA busy_timeout = ${e.busyTimeout}`):this.execSync("PRAGMA busy_timeout = 5000"),this.execSync("PRAGMA synchronous = NORMAL"),this.execSync("PRAGMA cache_size = -64000"),this.execSync("PRAGMA temp_store = MEMORY")}async close(){this.db&&(this.db.close(),this.db=null),this.sqlite3=null,this.poolUtil=null,this._config=null}isOpen(){return this.db!==null}getStorageMode(){return this.storageMode}async query(e,t){this.ensureOpen();const a=[];return this.db.exec({sql:e,bind:t,rowMode:"object",callback:s=>{a.push(s)}}),a}async queryOne(e,t){return(await this.query(e,t))[0]??null}async run(e,t){return this.ensureOpen(),this.db.exec({sql:e,bind:t}),{changes:this.sqlite3.capi.sqlite3_changes(this.db.pointer),lastInsertRowid:this.sqlite3.capi.sqlite3_last_insert_rowid(this.db.pointer)}}async exec(e){this.ensureOpen(),this.execSync(e)}execSync(e){this.db.exec({sql:e})}async transaction(e){await this.beginTransaction();try{const t=await e();return await this.commit(),t}catch(t){if(this.inTransaction)try{await this.rollback()}catch(a){if(R(a)&&!R(t))throw a}throw t}}async applyNodeBatch(e){return await this.transaction(async()=>{for(const t of e.nodes)await this.run(`INSERT INTO nodes (id, schema_id, created_at, updated_at, created_by, deleted_at)
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
             WHERE schema_id = ? AND invalidated_at IS NULL`,[t,a])}}),{nodeRowsWritten:e.nodes.length,propertyRowsWritten:e.properties.length,changeRowsWritten:e.changes.length,scalarRowsWritten:e.scalarIndexRows.length,ftsRowsWritten:e.ftsRows.length}}async beginTransaction(){if(this.inTransaction)throw new Error("Transaction already in progress");this.execSync("BEGIN IMMEDIATE"),this.inTransaction=!0}async commit(){if(!this.inTransaction)throw new Error("No transaction in progress");try{this.execSync("COMMIT"),this.inTransaction=!1}catch(e){throw R(e)&&(this.inTransaction=!1),e}}async rollback(){if(this.inTransaction)try{this.execSync("ROLLBACK")}finally{this.inTransaction=!1}}async prepare(e){return{query:async t=>this.query(e,t),queryOne:async t=>this.queryOne(e,t),run:async t=>this.run(e,t),finalize:async()=>{}}}async getSchemaVersion(){try{return(await this.queryOne("SELECT version FROM _schema_version ORDER BY version DESC LIMIT 1"))?.version??0}catch{return 0}}async setSchemaVersion(e){await this.run("INSERT INTO _schema_version (version, applied_at) VALUES (?, ?)",[e,Date.now()])}async applySchema(e,t){return await this.getSchemaVersion()>=e?!1:(await this.transaction(async()=>{await this.exec(t),await this.setSchemaVersion(e)}),!0)}async getDatabaseSize(){try{return(await this.queryOne("SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()"))?.size??0}catch{return 0}}async vacuum(){await this.exec("VACUUM")}async checkpoint(){return 0}ensureOpen(){if(!this.db||!this.sqlite3)throw new Error("Database not open. Call open() first.")}};async function j(e){const t=new V;return await t.open(e),await t.applySchema(q,Q),t}/**
 * @license
 * Copyright 2019 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */const U=Symbol("Comlink.proxy"),$=Symbol("Comlink.endpoint"),J=Symbol("Comlink.releaseProxy"),f=Symbol("Comlink.finalizer"),S=Symbol("Comlink.thrown"),F=e=>typeof e=="object"&&e!==null||typeof e=="function",Z={canHandle:e=>F(e)&&e[U],serialize(e){const{port1:t,port2:a}=new MessageChannel;return m(e,t),[a,[a]]},deserialize(e){return e.start(),re(e)}},ee={canHandle:e=>F(e)&&S in e,serialize({value:e}){let t;return e instanceof Error?t={isError:!0,value:{message:e.message,name:e.name,stack:e.stack}}:t={isError:!1,value:e},[t,[]]},deserialize(e){throw e.isError?Object.assign(new Error(e.value.message),e.value):e.value}},x=new Map([["proxy",Z],["throw",ee]]);function te(e,t){for(const a of e)if(t===a||a==="*"||a instanceof RegExp&&a.test(t))return!0;return!1}function m(e,t=globalThis,a=["*"]){t.addEventListener("message",function s(r){if(!r||!r.data)return;if(!te(a,r.origin)){console.warn(`Invalid origin '${r.origin}' for comlink proxy`);return}const{id:n,type:_,path:c}=Object.assign({path:[]},r.data),T=(r.data.argumentList||[]).map(p);let i;try{const o=c.slice(0,-1).reduce((d,h)=>d[h],e),l=c.reduce((d,h)=>d[h],e);switch(_){case"GET":i=l;break;case"SET":o[c.slice(-1)[0]]=p(r.data.value),i=!0;break;case"APPLY":i=l.apply(o,T);break;case"CONSTRUCT":{const d=new l(...T);i=de(d)}break;case"ENDPOINT":{const{port1:d,port2:h}=new MessageChannel;m(e,h),i=oe(d,[d])}break;case"RELEASE":i=void 0;break;default:return}}catch(o){i={value:o,[S]:0}}Promise.resolve(i).catch(o=>({value:o,[S]:0})).then(o=>{const[l,d]=O(o);t.postMessage(Object.assign(Object.assign({},l),{id:n}),d),_==="RELEASE"&&(t.removeEventListener("message",s),v(t),f in e&&typeof e[f]=="function"&&e[f]())}).catch(o=>{const[l,d]=O({value:new TypeError("Unserializable return value"),[S]:0});t.postMessage(Object.assign(Object.assign({},l),{id:n}),d)})}),t.start&&t.start()}function ae(e){return e.constructor.name==="MessagePort"}function v(e){ae(e)&&e.close()}function re(e,t){const a=new Map;return e.addEventListener("message",function(r){const{data:n}=r;if(!n||!n.id)return;const _=a.get(n.id);if(_)try{_(n)}finally{a.delete(n.id)}}),g(e,a,[],t)}function y(e){if(e)throw new Error("Proxy has been released and is not useable")}function M(e){return u(e,new Map,{type:"RELEASE"}).then(()=>{v(e)})}const I=new WeakMap,L="FinalizationRegistry"in globalThis&&new FinalizationRegistry(e=>{const t=(I.get(e)||0)-1;I.set(e,t),t===0&&M(e)});function ne(e,t){const a=(I.get(t)||0)+1;I.set(t,a),L&&L.register(e,t,e)}function se(e){L&&L.unregister(e)}function g(e,t,a=[],s=function(){}){let r=!1;const n=new Proxy(s,{get(_,c){if(y(r),c===J)return()=>{se(n),M(e),t.clear(),r=!0};if(c==="then"){if(a.length===0)return{then:()=>n};const T=u(e,t,{type:"GET",path:a.map(i=>i.toString())}).then(p);return T.then.bind(T)}return g(e,t,[...a,c])},set(_,c,T){y(r);const[i,o]=O(T);return u(e,t,{type:"SET",path:[...a,c].map(l=>l.toString()),value:i},o).then(p)},apply(_,c,T){y(r);const i=a[a.length-1];if(i===$)return u(e,t,{type:"ENDPOINT"}).then(p);if(i==="bind")return g(e,t,a.slice(0,-1));const[o,l]=b(T);return u(e,t,{type:"APPLY",path:a.map(d=>d.toString()),argumentList:o},l).then(p)},construct(_,c){y(r);const[T,i]=b(c);return u(e,t,{type:"CONSTRUCT",path:a.map(o=>o.toString()),argumentList:T},i).then(p)}});return ne(n,e),n}function ie(e){return Array.prototype.concat.apply([],e)}function b(e){const t=e.map(O);return[t.map(a=>a[0]),ie(t.map(a=>a[1]))]}const P=new WeakMap;function oe(e,t){return P.set(e,t),e}function de(e){return Object.assign(e,{[U]:!0})}function O(e){for(const[t,a]of x)if(a.canHandle(e)){const[s,r]=a.serialize(e);return[{type:"HANDLER",name:t,value:s},r]}return[{type:"RAW",value:e},P.get(e)||[]]}function p(e){switch(e.type){case"HANDLER":return x.get(e.name).deserialize(e.value);case"RAW":return e.value}}function u(e,t,a,s){return new Promise(r=>{const n=Ee();t.set(n,r),e.start&&e.start(),e.postMessage(Object.assign({id:n},a),s)})}function Ee(){return new Array(4).fill(0).map(()=>Math.floor(Math.random()*Number.MAX_SAFE_INTEGER).toString(16)).join("-")}function ce(){return typeof self<"u"&&typeof localStorage<"u"&&localStorage.getItem("xnet:sqlite:debug")==="true"}function N(...e){ce()&&console.log(...e)}N("[SQLiteWorker] Worker script loaded, Comlink imported");var Te=class{adapter=null;async open(e){if(N("[SQLiteWorkerHandler] open() called with config:",e),this.adapter)throw new Error("Database already open");this.adapter=await j(e),N("[SQLiteWorkerHandler] open() completed")}async resetStorage(e){this.adapter&&(await this.adapter.close(),this.adapter=null),await K(e)}async close(){this.adapter&&(await this.adapter.close(),this.adapter=null)}isOpen(){return this.adapter?.isOpen()??!1}async query(e,t){if(!this.adapter)throw new Error("Database not open");return this.adapter.query(e,t)}async queryOne(e,t){if(!this.adapter)throw new Error("Database not open");return this.adapter.queryOne(e,t)}async run(e,t){if(!this.adapter)throw new Error("Database not open");return this.adapter.run(e,t)}async exec(e){if(!this.adapter)throw new Error("Database not open");return this.adapter.exec(e)}async transaction(e){if(!this.adapter)throw new Error("Database not open");await this.adapter.transaction(async()=>{for(const t of e)await this.adapter.run(t.sql,t.params)})}async applyNodeBatch(e){if(!this.adapter)throw new Error("Database not open");return this.adapter.applyNodeBatch(e)}async getSchemaVersion(){if(!this.adapter)throw new Error("Database not open");return this.adapter.getSchemaVersion()}async vacuum(){if(!this.adapter)throw new Error("Database not open");return this.adapter.vacuum()}async getDatabaseSize(){if(!this.adapter)throw new Error("Database not open");return this.adapter.getDatabaseSize()}async getStorageMode(){if(!this.adapter)throw new Error("Database not open");return this.adapter.getStorageMode()}connectPort(e){m(this,e)}},le=new Te;N("[SQLiteWorker] Handler instance created");N("[SQLiteWorker] Exposing handler via Comlink...");m(le);N("[SQLiteWorker] Handler exposed - worker ready!");
