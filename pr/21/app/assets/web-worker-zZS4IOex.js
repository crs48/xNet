var M=1,x=`
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

CREATE INDEX IF NOT EXISTS idx_properties_node ON node_properties(node_id);
CREATE INDEX IF NOT EXISTS idx_properties_lamport ON node_properties(lamport_time);

CREATE INDEX IF NOT EXISTS idx_changes_node ON changes(node_id);
CREATE INDEX IF NOT EXISTS idx_changes_lamport ON changes(lamport_time);
CREATE INDEX IF NOT EXISTS idx_changes_wall_time ON changes(wall_time);
CREATE INDEX IF NOT EXISTS idx_changes_batch ON changes(batch_id);

CREATE INDEX IF NOT EXISTS idx_yjs_state_updated ON yjs_state(updated_at);
CREATE INDEX IF NOT EXISTS idx_yjs_updates_node ON yjs_updates(node_id);
CREATE INDEX IF NOT EXISTS idx_yjs_snapshots_node ON yjs_snapshots(node_id);
CREATE INDEX IF NOT EXISTS idx_yjs_snapshots_timestamp ON yjs_snapshots(node_id, timestamp);

CREATE INDEX IF NOT EXISTS idx_updates_doc ON updates(doc_id);
CREATE INDEX IF NOT EXISTS idx_updates_created ON updates(created_at);
`,F=`
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
`,U=x+F;function P(){return typeof self<"u"&&typeof localStorage<"u"&&localStorage.getItem("xnet:sqlite:debug")==="true"}function c(...e){P()&&console.log(...e)}var k=class{sqlite3=null;db=null;poolUtil=null;_config=null;inTransaction=!1;storageMode="memory";async open(e){if(this.db!==null)throw new Error("Database already open. Call close() first.");c("[WebSQLiteAdapter] Starting open()..."),c("[WebSQLiteAdapter] Importing sqlite-wasm...");const t=(await import("./index-BTATog3X.js")).default;c("[WebSQLiteAdapter] sqlite-wasm imported"),c("[WebSQLiteAdapter] Initializing sqlite3 module..."),this.sqlite3=await t(),c("[WebSQLiteAdapter] sqlite3 module initialized");try{c("[WebSQLiteAdapter] Installing OPFS-SAHPool VFS..."),this.poolUtil=await this.sqlite3.installOpfsSAHPoolVfs({name:"opfs-sahpool",directory:".xnet-sqlite",initialCapacity:10,clearOnInit:!1}),c("[WebSQLiteAdapter] OPFS-SAHPool VFS installed"),c("[WebSQLiteAdapter] Reserving capacity..."),await this.poolUtil.reserveMinimumCapacity(10),c("[WebSQLiteAdapter] Capacity reserved");const a=e.path.startsWith("/")?e.path:`/${e.path}`;c("[WebSQLiteAdapter] Opening database at",a),this.db=new this.poolUtil.OpfsSAHPoolDb(a,"c"),this.storageMode="opfs",c("[WebSQLiteAdapter] Database opened with OPFS-SAHPool")}catch(a){console.warn("[WebSQLiteAdapter] OPFS-SAHPool not available, trying OPFS direct mode:",a);const d=e.path.startsWith("/")?e.path:`/${e.path}`,r=this.sqlite3?.oo1?.OpfsDb;if(typeof r=="function")try{this.db=new r(d,"c"),this.storageMode="opfs",c("[WebSQLiteAdapter] Database opened with OPFS direct mode")}catch(n){console.warn("[WebSQLiteAdapter] OPFS direct mode not available, using in-memory database:",n),this.db=new this.sqlite3.oo1.DB(":memory:","c"),this.storageMode="memory",c("[WebSQLiteAdapter] In-memory database opened")}else console.warn("[WebSQLiteAdapter] OPFS direct mode unavailable, using in-memory database"),this.db=new this.sqlite3.oo1.DB(":memory:","c"),this.storageMode="memory",c("[WebSQLiteAdapter] In-memory database opened")}this._config=e,e.foreignKeys!==!1&&this.execSync("PRAGMA foreign_keys = ON"),e.busyTimeout?this.execSync(`PRAGMA busy_timeout = ${e.busyTimeout}`):this.execSync("PRAGMA busy_timeout = 5000"),this.execSync("PRAGMA synchronous = NORMAL"),this.execSync("PRAGMA cache_size = -64000"),this.execSync("PRAGMA temp_store = MEMORY")}async close(){this.db&&(this.db.close(),this.db=null),this.sqlite3=null,this.poolUtil=null,this._config=null}isOpen(){return this.db!==null}getStorageMode(){return this.storageMode}async query(e,t){this.ensureOpen();const a=[];return this.db.exec({sql:e,bind:t,rowMode:"object",callback:d=>{a.push(d)}}),a}async queryOne(e,t){return(await this.query(e,t))[0]??null}async run(e,t){return this.ensureOpen(),this.db.exec({sql:e,bind:t}),{changes:this.sqlite3.capi.sqlite3_changes(this.db.pointer),lastInsertRowid:this.sqlite3.capi.sqlite3_last_insert_rowid(this.db.pointer)}}async exec(e){this.ensureOpen(),this.execSync(e)}execSync(e){this.db.exec({sql:e})}async transaction(e){await this.beginTransaction();try{const t=await e();return await this.commit(),t}catch(t){throw await this.rollback(),t}}async beginTransaction(){if(this.inTransaction)throw new Error("Transaction already in progress");this.execSync("BEGIN IMMEDIATE"),this.inTransaction=!0}async commit(){if(!this.inTransaction)throw new Error("No transaction in progress");this.execSync("COMMIT"),this.inTransaction=!1}async rollback(){this.inTransaction&&(this.execSync("ROLLBACK"),this.inTransaction=!1)}async prepare(e){return{query:async t=>this.query(e,t),queryOne:async t=>this.queryOne(e,t),run:async t=>this.run(e,t),finalize:async()=>{}}}async getSchemaVersion(){try{return(await this.queryOne("SELECT version FROM _schema_version ORDER BY version DESC LIMIT 1"))?.version??0}catch{return 0}}async setSchemaVersion(e){await this.run("INSERT INTO _schema_version (version, applied_at) VALUES (?, ?)",[e,Date.now()])}async applySchema(e,t){return await this.getSchemaVersion()>=e?!1:(await this.transaction(async()=>{await this.exec(t),await this.setSchemaVersion(e)}),!0)}async getDatabaseSize(){try{return(await this.queryOne("SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()"))?.size??0}catch{return 0}}async vacuum(){await this.exec("VACUUM")}async checkpoint(){return 0}ensureOpen(){if(!this.db||!this.sqlite3)throw new Error("Database not open. Call open() first.")}};async function G(e){const t=new k;return await t.open(e),await t.applySchema(M,U),t}/**
 * @license
 * Copyright 2019 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */const R=Symbol("Comlink.proxy"),B=Symbol("Comlink.endpoint"),W=Symbol("Comlink.releaseProxy"),_=Symbol("Comlink.finalizer"),O=Symbol("Comlink.thrown"),g=e=>typeof e=="object"&&e!==null||typeof e=="function",Y={canHandle:e=>g(e)&&e[R],serialize(e){const{port1:t,port2:a}=new MessageChannel;return b(e,t),[a,[a]]},deserialize(e){return e.start(),z(e)}},q={canHandle:e=>g(e)&&O in e,serialize({value:e}){let t;return e instanceof Error?t={isError:!0,value:{message:e.message,name:e.name,stack:e.stack}}:t={isError:!1,value:e},[t,[]]},deserialize(e){throw e.isError?Object.assign(new Error(e.value.message),e.value):e.value}},w=new Map([["proxy",Y],["throw",q]]);function v(e,t){for(const a of e)if(t===a||a==="*"||a instanceof RegExp&&a.test(t))return!0;return!1}function b(e,t=globalThis,a=["*"]){t.addEventListener("message",function d(r){if(!r||!r.data)return;if(!v(a,r.origin)){console.warn(`Invalid origin '${r.origin}' for comlink proxy`);return}const{id:n,type:u,path:E}=Object.assign({path:[]},r.data),l=(r.data.argumentList||[]).map(p);let s;try{const i=E.slice(0,-1).reduce((o,y)=>o[y],e),T=E.reduce((o,y)=>o[y],e);switch(u){case"GET":s=T;break;case"SET":i[E.slice(-1)[0]]=p(r.data.value),s=!0;break;case"APPLY":s=T.apply(i,l);break;case"CONSTRUCT":{const o=new T(...l);s=$(o)}break;case"ENDPOINT":{const{port1:o,port2:y}=new MessageChannel;b(e,y),s=K(o,[o])}break;case"RELEASE":s=void 0;break;default:return}}catch(i){s={value:i,[O]:0}}Promise.resolve(s).catch(i=>({value:i,[O]:0})).then(i=>{const[T,o]=f(i);t.postMessage(Object.assign(Object.assign({},T),{id:n}),o),u==="RELEASE"&&(t.removeEventListener("message",d),C(t),_ in e&&typeof e[_]=="function"&&e[_]())}).catch(i=>{const[T,o]=f({value:new TypeError("Unserializable return value"),[O]:0});t.postMessage(Object.assign(Object.assign({},T),{id:n}),o)})}),t.start&&t.start()}function Q(e){return e.constructor.name==="MessagePort"}function C(e){Q(e)&&e.close()}function z(e,t){const a=new Map;return e.addEventListener("message",function(r){const{data:n}=r;if(!n||!n.id)return;const u=a.get(n.id);if(u)try{u(n)}finally{a.delete(n.id)}}),I(e,a,[],t)}function S(e){if(e)throw new Error("Proxy has been released and is not useable")}function D(e){return h(e,new Map,{type:"RELEASE"}).then(()=>{C(e)})}const L=new WeakMap,m="FinalizationRegistry"in globalThis&&new FinalizationRegistry(e=>{const t=(L.get(e)||0)-1;L.set(e,t),t===0&&D(e)});function H(e,t){const a=(L.get(t)||0)+1;L.set(t,a),m&&m.register(e,t,e)}function V(e){m&&m.unregister(e)}function I(e,t,a=[],d=function(){}){let r=!1;const n=new Proxy(d,{get(u,E){if(S(r),E===W)return()=>{V(n),D(e),t.clear(),r=!0};if(E==="then"){if(a.length===0)return{then:()=>n};const l=h(e,t,{type:"GET",path:a.map(s=>s.toString())}).then(p);return l.then.bind(l)}return I(e,t,[...a,E])},set(u,E,l){S(r);const[s,i]=f(l);return h(e,t,{type:"SET",path:[...a,E].map(T=>T.toString()),value:s},i).then(p)},apply(u,E,l){S(r);const s=a[a.length-1];if(s===B)return h(e,t,{type:"ENDPOINT"}).then(p);if(s==="bind")return I(e,t,a.slice(0,-1));const[i,T]=A(l);return h(e,t,{type:"APPLY",path:a.map(o=>o.toString()),argumentList:i},T).then(p)},construct(u,E){S(r);const[l,s]=A(E);return h(e,t,{type:"CONSTRUCT",path:a.map(i=>i.toString()),argumentList:l},s).then(p)}});return H(n,e),n}function j(e){return Array.prototype.concat.apply([],e)}function A(e){const t=e.map(f);return[t.map(a=>a[0]),j(t.map(a=>a[1]))]}const X=new WeakMap;function K(e,t){return X.set(e,t),e}function $(e){return Object.assign(e,{[R]:!0})}function f(e){for(const[t,a]of w)if(a.canHandle(e)){const[d,r]=a.serialize(e);return[{type:"HANDLER",name:t,value:d},r]}return[{type:"RAW",value:e},X.get(e)||[]]}function p(e){switch(e.type){case"HANDLER":return w.get(e.name).deserialize(e.value);case"RAW":return e.value}}function h(e,t,a,d){return new Promise(r=>{const n=J();t.set(n,r),e.start&&e.start(),e.postMessage(Object.assign({id:n},a),d)})}function J(){return new Array(4).fill(0).map(()=>Math.floor(Math.random()*Number.MAX_SAFE_INTEGER).toString(16)).join("-")}function Z(){return typeof self<"u"&&typeof localStorage<"u"&&localStorage.getItem("xnet:sqlite:debug")==="true"}function N(...e){Z()&&console.log(...e)}N("[SQLiteWorker] Worker script loaded, Comlink imported");var ee=class{adapter=null;async open(e){if(N("[SQLiteWorkerHandler] open() called with config:",e),this.adapter)throw new Error("Database already open");this.adapter=await G(e),N("[SQLiteWorkerHandler] open() completed")}async close(){this.adapter&&(await this.adapter.close(),this.adapter=null)}isOpen(){return this.adapter?.isOpen()??!1}async query(e,t){if(!this.adapter)throw new Error("Database not open");return this.adapter.query(e,t)}async queryOne(e,t){if(!this.adapter)throw new Error("Database not open");return this.adapter.queryOne(e,t)}async run(e,t){if(!this.adapter)throw new Error("Database not open");return this.adapter.run(e,t)}async exec(e){if(!this.adapter)throw new Error("Database not open");return this.adapter.exec(e)}async transaction(e){if(!this.adapter)throw new Error("Database not open");await this.adapter.transaction(async()=>{for(const t of e)await this.adapter.run(t.sql,t.params)})}async getSchemaVersion(){if(!this.adapter)throw new Error("Database not open");return this.adapter.getSchemaVersion()}async vacuum(){if(!this.adapter)throw new Error("Database not open");return this.adapter.vacuum()}async getDatabaseSize(){if(!this.adapter)throw new Error("Database not open");return this.adapter.getDatabaseSize()}async getStorageMode(){if(!this.adapter)throw new Error("Database not open");return this.adapter.getStorageMode()}},te=new ee;N("[SQLiteWorker] Handler instance created");N("[SQLiteWorker] Exposing handler via Comlink...");b(te);N("[SQLiteWorker] Handler exposed - worker ready!");
