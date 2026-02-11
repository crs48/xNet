/**
 * @xnet/hub - SQLite storage adapter.
 */

import type {
  AwarenessEntry,
  BlobMeta,
  DocMeta,
  FileMeta,
  FederationPeerRecord,
  FederationQueryLog,
  HubStorage,
  PeerEndpoint,
  PeerRecord,
  ShardAssignmentRecord,
  ShardHostRecord,
  ShardPosting,
  ShardStats,
  ShardTermStat,
  CrawlerProfile,
  CrawlQueueEntry,
  CrawlHistoryEntry,
  CrawlDomainState,
  SchemaRecord,
  SearchOptions,
  SearchResult,
  GrantIndexRecord,
  SerializedNodeChange,
  DatabaseRowRecord,
  DatabaseRowQueryOptions,
  DatabaseRowQueryResult,
  DatabaseFilterGroup,
  DatabaseFilterCondition
} from './interface'
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import Database from 'better-sqlite3'

const assertSafePath = (base: string, key: string): string => {
  const resolved = resolve(base, key)
  if (!resolved.startsWith(resolve(base) + '/') && resolved !== resolve(base)) {
    throw new Error(`Path traversal detected: ${key}`)
  }
  return resolved
}

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS doc_state (
    doc_id TEXT PRIMARY KEY,
    state BLOB NOT NULL,
    state_vector BLOB,
    updated_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
  );

  CREATE TABLE IF NOT EXISTS doc_meta (
    doc_id TEXT PRIMARY KEY,
    owner_did TEXT NOT NULL,
    schema_iri TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL DEFAULT '',
    properties_json TEXT DEFAULT '{}',
    created_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
  );
  CREATE INDEX IF NOT EXISTS idx_doc_meta_owner ON doc_meta(owner_did);
  CREATE INDEX IF NOT EXISTS idx_doc_meta_schema ON doc_meta(schema_iri);

  CREATE TABLE IF NOT EXISTS doc_recipients (
    doc_id TEXT NOT NULL,
    recipient TEXT NOT NULL,
    PRIMARY KEY (doc_id, recipient)
  );
  CREATE INDEX IF NOT EXISTS idx_doc_recipients_recipient ON doc_recipients(recipient);

  CREATE TABLE IF NOT EXISTS grant_index (
    grant_id TEXT PRIMARY KEY,
    grantee_did TEXT NOT NULL,
    resource_doc_id TEXT NOT NULL,
    actions_json TEXT NOT NULL,
    expires_at INTEGER NOT NULL DEFAULT 0,
    revoked_at INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
  );
  CREATE INDEX IF NOT EXISTS idx_grant_index_grantee ON grant_index(grantee_did);
  CREATE INDEX IF NOT EXISTS idx_grant_index_resource ON grant_index(resource_doc_id);
  CREATE INDEX IF NOT EXISTS idx_grant_index_active ON grant_index(grantee_did, revoked_at, expires_at);

  CREATE TABLE IF NOT EXISTS backups (
    key TEXT PRIMARY KEY,
    doc_id TEXT NOT NULL,
    owner_did TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    content_type TEXT NOT NULL DEFAULT 'application/octet-stream',
    blob_path TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
  );
  CREATE INDEX IF NOT EXISTS idx_backups_owner ON backups(owner_did);
  CREATE INDEX IF NOT EXISTS idx_backups_doc ON backups(doc_id);

  CREATE TABLE IF NOT EXISTS file_meta (
    cid TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    uploader_did TEXT NOT NULL,
    reference_count INTEGER NOT NULL DEFAULT 1,
    file_path TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
  );
  CREATE INDEX IF NOT EXISTS idx_file_meta_uploader ON file_meta(uploader_did);
  CREATE INDEX IF NOT EXISTS idx_file_meta_mime ON file_meta(mime_type);

  CREATE TABLE IF NOT EXISTS awareness_state (
    room TEXT NOT NULL,
    user_did TEXT NOT NULL,
    state_json TEXT NOT NULL,
    last_seen INTEGER NOT NULL,
    PRIMARY KEY (room, user_did)
  );
  CREATE INDEX IF NOT EXISTS idx_awareness_room ON awareness_state(room);
  CREATE INDEX IF NOT EXISTS idx_awareness_stale ON awareness_state(last_seen);

  CREATE TABLE IF NOT EXISTS peer_registry (
    did TEXT PRIMARY KEY,
    public_key_b64 TEXT NOT NULL,
    display_name TEXT,
    endpoints_json TEXT NOT NULL,
    hub_url TEXT,
    capabilities_json TEXT DEFAULT '[]',
    last_seen INTEGER NOT NULL,
    registered_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000),
    version INTEGER NOT NULL DEFAULT 1
  );
  CREATE INDEX IF NOT EXISTS idx_peer_last_seen ON peer_registry(last_seen);
  CREATE INDEX IF NOT EXISTS idx_peer_hub ON peer_registry(hub_url);

  CREATE TABLE IF NOT EXISTS federation_peers (
    hub_did TEXT PRIMARY KEY,
    url TEXT NOT NULL,
    schemas TEXT NOT NULL DEFAULT '*',
    trust_level TEXT NOT NULL DEFAULT 'metadata',
    max_latency_ms INTEGER DEFAULT 2000,
    rate_limit INTEGER DEFAULT 60,
    healthy INTEGER DEFAULT 1,
    last_success_at INTEGER,
    registered_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000),
    registered_by TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_federation_peers_health ON federation_peers(healthy);

  CREATE TABLE IF NOT EXISTS federation_query_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    query_id TEXT NOT NULL,
    from_hub TEXT NOT NULL,
    query_text TEXT,
    schema_filter TEXT,
    result_count INTEGER,
    execution_ms INTEGER,
    timestamp INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_fed_log_from ON federation_query_log(from_hub, timestamp);

  CREATE TABLE IF NOT EXISTS shard_assignments (
    shard_id INTEGER PRIMARY KEY,
    range_start INTEGER NOT NULL,
    range_end INTEGER NOT NULL,
    primary_url TEXT NOT NULL,
    primary_did TEXT NOT NULL,
    replica_url TEXT,
    replica_did TEXT,
    doc_count INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS shard_hosts (
    hub_did TEXT PRIMARY KEY,
    url TEXT NOT NULL,
    capacity INTEGER NOT NULL,
    registered_at INTEGER NOT NULL,
    last_seen INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS shard_postings (
    shard_id INTEGER NOT NULL,
    term TEXT NOT NULL,
    cid TEXT NOT NULL,
    tf INTEGER NOT NULL,
    title TEXT NOT NULL,
    url TEXT,
    schema TEXT,
    author TEXT,
    language TEXT,
    indexed_at INTEGER NOT NULL,
    doc_len INTEGER NOT NULL,
    PRIMARY KEY (shard_id, term, cid)
  );
  CREATE INDEX IF NOT EXISTS idx_shard_postings_term ON shard_postings(shard_id, term);
  CREATE INDEX IF NOT EXISTS idx_shard_postings_cid ON shard_postings(shard_id, cid);

  CREATE TABLE IF NOT EXISTS shard_term_stats (
    shard_id INTEGER NOT NULL,
    term TEXT NOT NULL,
    doc_freq INTEGER NOT NULL,
    PRIMARY KEY (shard_id, term)
  );

  CREATE TABLE IF NOT EXISTS crawlers (
    did TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    capacity INTEGER NOT NULL,
    languages_json TEXT NOT NULL,
    domains_json TEXT,
    reputation INTEGER NOT NULL,
    total_crawled INTEGER NOT NULL,
    registered_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS crawl_queue (
    url TEXT PRIMARY KEY,
    domain TEXT NOT NULL,
    priority INTEGER NOT NULL,
    language TEXT,
    crawl_count INTEGER NOT NULL,
    last_cid TEXT,
    last_crawled_at INTEGER,
    enqueued_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_crawl_queue_domain ON crawl_queue(domain);
  CREATE INDEX IF NOT EXISTS idx_crawl_queue_priority ON crawl_queue(priority);

  CREATE TABLE IF NOT EXISTS crawl_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT NOT NULL,
    cid TEXT NOT NULL,
    title TEXT,
    status_code INTEGER,
    content_type TEXT,
    language TEXT,
    crawler_did TEXT,
    crawl_time_ms INTEGER,
    crawled_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_crawl_history_url ON crawl_history(url, crawled_at);

  CREATE TABLE IF NOT EXISTS crawl_domains (
    domain TEXT PRIMARY KEY,
    last_crawled_at INTEGER,
    cooldown_ms INTEGER NOT NULL,
    blocked INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS schemas (
    iri TEXT NOT NULL,
    version INTEGER NOT NULL,
    definition_json TEXT NOT NULL,
    author_did TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    properties_count INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000),
    PRIMARY KEY (iri, version)
  );
  CREATE INDEX IF NOT EXISTS idx_schemas_iri ON schemas(iri);
  CREATE INDEX IF NOT EXISTS idx_schemas_author ON schemas(author_did);
  CREATE INDEX IF NOT EXISTS idx_schemas_name ON schemas(name);

  CREATE VIRTUAL TABLE IF NOT EXISTS schema_search USING fts5(
    iri UNINDEXED,
    version UNINDEXED,
    name,
    description,
    property_names
  );

  CREATE TABLE IF NOT EXISTS node_changes (
    hash TEXT PRIMARY KEY,
    change_id TEXT NOT NULL,
    change_type TEXT NOT NULL,
    room TEXT NOT NULL,
    node_id TEXT NOT NULL,
    schema_id TEXT,
    lamport_time INTEGER NOT NULL,
    lamport_author TEXT NOT NULL,
    author_did TEXT NOT NULL,
    wall_time INTEGER NOT NULL,
    parent_hash TEXT,
    payload_json TEXT NOT NULL,
    signature_b64 TEXT NOT NULL,
    protocol_version INTEGER,
    batch_id TEXT,
    batch_index INTEGER,
    batch_size INTEGER,
    received_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
  );
  CREATE INDEX IF NOT EXISTS idx_node_changes_room_lamport
    ON node_changes(room, lamport_time);
  CREATE INDEX IF NOT EXISTS idx_node_changes_node
    ON node_changes(node_id, lamport_time);
  CREATE INDEX IF NOT EXISTS idx_node_changes_batch
    ON node_changes(batch_id) WHERE batch_id IS NOT NULL;

  -- Database rows table for large database queries
  CREATE TABLE IF NOT EXISTS database_rows (
    id TEXT PRIMARY KEY,
    database_id TEXT NOT NULL,
    sort_key TEXT NOT NULL,
    data JSON NOT NULL,
    searchable TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    created_by TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_database_rows_db ON database_rows(database_id);
  CREATE INDEX IF NOT EXISTS idx_database_rows_sort ON database_rows(database_id, sort_key);
  CREATE INDEX IF NOT EXISTS idx_database_rows_updated ON database_rows(database_id, updated_at);

  -- FTS5 virtual table for database row full-text search
  CREATE VIRTUAL TABLE IF NOT EXISTS database_rows_fts USING fts5(
    searchable,
    content='database_rows',
    content_rowid='rowid',
    tokenize='porter unicode61'
  );

  -- Triggers to keep FTS index in sync
  CREATE TRIGGER IF NOT EXISTS database_rows_ai AFTER INSERT ON database_rows BEGIN
    INSERT INTO database_rows_fts(rowid, searchable)
    VALUES (new.rowid, new.searchable);
  END;

  CREATE TRIGGER IF NOT EXISTS database_rows_ad AFTER DELETE ON database_rows BEGIN
    INSERT INTO database_rows_fts(database_rows_fts, rowid, searchable)
    VALUES('delete', old.rowid, old.searchable);
  END;

  CREATE TRIGGER IF NOT EXISTS database_rows_au AFTER UPDATE ON database_rows BEGIN
    INSERT INTO database_rows_fts(database_rows_fts, rowid, searchable)
    VALUES('delete', old.rowid, old.searchable);
    INSERT INTO database_rows_fts(rowid, searchable)
    VALUES (new.rowid, new.searchable);
  END;

  CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(
    doc_id UNINDEXED,
    title,
    body,
    schema_iri UNINDEXED,
    owner_did UNINDEXED,
    content='doc_meta',
    content_rowid='rowid'
  );

  CREATE TRIGGER IF NOT EXISTS doc_meta_ai AFTER INSERT ON doc_meta BEGIN
    INSERT INTO search_index(rowid, doc_id, title, body, schema_iri, owner_did)
    VALUES (new.rowid, new.doc_id, new.title, '', new.schema_iri, new.owner_did);
  END;

  CREATE TRIGGER IF NOT EXISTS doc_meta_ad AFTER DELETE ON doc_meta BEGIN
    INSERT INTO search_index(search_index, rowid, doc_id, title, body, schema_iri, owner_did)
    VALUES ('delete', old.rowid, old.doc_id, old.title, '', old.schema_iri, old.owner_did);
  END;

  CREATE TRIGGER IF NOT EXISTS doc_meta_au AFTER UPDATE ON doc_meta BEGIN
    INSERT INTO search_index(search_index, rowid, doc_id, title, body, schema_iri, owner_did)
    VALUES ('delete', old.rowid, old.doc_id, old.title, '', old.schema_iri, old.owner_did);
    INSERT INTO search_index(rowid, doc_id, title, body, schema_iri, owner_did)
    VALUES (new.rowid, new.doc_id, new.title, '', new.schema_iri, new.owner_did);
  END;
`

type DocStateRow = { state: Buffer } | undefined
type StateVectorRow = { state_vector: Buffer | null } | undefined

type DocMetaRow =
  | {
      doc_id: string
      owner_did: string
      schema_iri: string
      title: string
      properties_json: string
      created_at: number
      updated_at: number
    }
  | undefined

type BackupRow = { blob_path: string } | undefined

type BackupMetaRow = {
  key: string
  doc_id: string
  owner_did: string
  size_bytes: number
  content_type: string
  created_at: number
}

type FileMetaRow = {
  cid: string
  name: string
  mime_type: string
  size_bytes: number
  uploader_did: string
  reference_count: number
  file_path: string
  created_at: number
}

type AwarenessRow = {
  room: string
  user_did: string
  state_json: string
  last_seen: number
}

type PeerRow = {
  did: string
  public_key_b64: string
  display_name: string | null
  endpoints_json: string
  hub_url: string | null
  capabilities_json: string
  last_seen: number
  registered_at: number
  version: number
}

type FederationPeerRow = {
  hub_did: string
  url: string
  schemas: string
  trust_level: 'full' | 'metadata'
  max_latency_ms: number
  rate_limit: number
  healthy: number
  last_success_at: number | null
  registered_at: number
  registered_by: string | null
}

type ShardAssignmentRow = {
  shard_id: number
  range_start: number
  range_end: number
  primary_url: string
  primary_did: string
  replica_url: string | null
  replica_did: string | null
  doc_count: number
  updated_at: number
}

type ShardHostRow = {
  hub_did: string
  url: string
  capacity: number
  registered_at: number
  last_seen: number
}

type ShardPostingRow = {
  shard_id: number
  term: string
  cid: string
  tf: number
  title: string
  url: string | null
  schema: string | null
  author: string | null
  language: string | null
  indexed_at: number
  doc_len: number
}

type ShardTermStatRow = {
  shard_id: number
  term: string
  doc_freq: number
}

type CrawlerRow = {
  did: string
  type: 'browser' | 'desktop' | 'server'
  capacity: number
  languages_json: string
  domains_json: string | null
  reputation: number
  total_crawled: number
  registered_at: number
}

type CrawlQueueRow = {
  url: string
  domain: string
  priority: number
  language: string | null
  crawl_count: number
  last_cid: string | null
  last_crawled_at: number | null
  enqueued_at: number
}

type CrawlHistoryRow = {
  url: string
  cid: string
  title: string | null
  status_code: number | null
  content_type: string | null
  language: string | null
  crawler_did: string | null
  crawl_time_ms: number | null
  crawled_at: number
}

type CrawlDomainRow = {
  domain: string
  last_crawled_at: number | null
  cooldown_ms: number
  blocked: number
}

type SchemaRow = {
  iri: string
  version: number
  definition_json: string
  author_did: string
  name: string
  description: string
  properties_count: number
  created_at: number
}

type NodeChangeRow = {
  hash: string
  change_id: string
  change_type: string
  room: string
  node_id: string
  schema_id: string | null
  lamport_time: number
  lamport_author: string
  author_did: string
  wall_time: number
  parent_hash: string | null
  payload_json: string
  signature_b64: string
  protocol_version: number | null
  batch_id: string | null
  batch_index: number | null
  batch_size: number | null
}

type SearchRow = {
  doc_id: string
  title: string
  schema_iri: string
  snippet: string
  rank: number
}

type DocRecipientRow = {
  recipient: string
}

type GrantedResourceRow = {
  resource_doc_id: string
}

type DatabaseRowRow = {
  id: string
  database_id: string
  sort_key: string
  data: string
  searchable: string
  created_at: number
  created_by: string
  updated_at: number
}

export const createSQLiteStorage = (dataDir: string): HubStorage => {
  mkdirSync(dataDir, { recursive: true })
  mkdirSync(join(dataDir, 'blobs'), { recursive: true })
  mkdirSync(join(dataDir, 'files'), { recursive: true })

  const dbPath = join(dataDir, 'hub.db')
  const db = new Database(dbPath)

  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL')
  db.pragma('busy_timeout = 5000')

  db.exec(SCHEMA_SQL)

  // ─── Migrations ────────────────────────────────────────
  // Add missing columns to node_changes table (added in later versions)
  const tableInfo = db.prepare('PRAGMA table_info(node_changes)').all() as { name: string }[]
  const existingColumns = new Set(tableInfo.map((col) => col.name))

  if (!existingColumns.has('protocol_version')) {
    db.exec('ALTER TABLE node_changes ADD COLUMN protocol_version INTEGER')
  }
  if (!existingColumns.has('batch_id')) {
    db.exec('ALTER TABLE node_changes ADD COLUMN batch_id TEXT')
  }
  if (!existingColumns.has('batch_index')) {
    db.exec('ALTER TABLE node_changes ADD COLUMN batch_index INTEGER')
  }
  if (!existingColumns.has('batch_size')) {
    db.exec('ALTER TABLE node_changes ADD COLUMN batch_size INTEGER')
  }

  const stmts = {
    getDocState: db.prepare('SELECT state FROM doc_state WHERE doc_id = ?'),
    getStateVector: db.prepare('SELECT state_vector FROM doc_state WHERE doc_id = ?'),
    upsertDocState: db.prepare(`
      INSERT INTO doc_state (doc_id, state, state_vector, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(doc_id) DO UPDATE SET
        state = excluded.state,
        state_vector = excluded.state_vector,
        updated_at = excluded.updated_at
    `),
    getDocMeta: db.prepare('SELECT * FROM doc_meta WHERE doc_id = ?'),
    upsertDocMeta: db.prepare(`
      INSERT INTO doc_meta (doc_id, owner_did, schema_iri, title, properties_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(doc_id) DO UPDATE SET
        owner_did = excluded.owner_did,
        schema_iri = excluded.schema_iri,
        title = excluded.title,
        properties_json = excluded.properties_json,
        updated_at = excluded.updated_at
    `),
    deleteDocRecipients: db.prepare('DELETE FROM doc_recipients WHERE doc_id = ?'),
    insertDocRecipient: db.prepare(`
      INSERT OR IGNORE INTO doc_recipients (doc_id, recipient)
      VALUES (?, ?)
    `),
    listDocRecipients: db.prepare(`
      SELECT recipient FROM doc_recipients WHERE doc_id = ? ORDER BY recipient ASC
    `),
    upsertGrantIndex: db.prepare(`
      INSERT INTO grant_index (grant_id, grantee_did, resource_doc_id, actions_json, expires_at, revoked_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(grant_id) DO UPDATE SET
        grantee_did = excluded.grantee_did,
        resource_doc_id = excluded.resource_doc_id,
        actions_json = excluded.actions_json,
        expires_at = excluded.expires_at,
        revoked_at = excluded.revoked_at,
        created_at = excluded.created_at
    `),
    removeGrantIndex: db.prepare('DELETE FROM grant_index WHERE grant_id = ?'),
    listGrantedDocIds: db.prepare(`
      SELECT DISTINCT resource_doc_id
      FROM grant_index
      WHERE grantee_did = ?
        AND revoked_at = 0
        AND (expires_at = 0 OR expires_at > ?)
    `),
    insertBackup: db.prepare(`
      INSERT OR REPLACE INTO backups (key, doc_id, owner_did, size_bytes, content_type, blob_path, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `),
    getBackup: db.prepare('SELECT blob_path FROM backups WHERE key = ?'),
    listBackups: db.prepare('SELECT * FROM backups WHERE owner_did = ? ORDER BY created_at DESC'),
    deleteBackup: db.prepare('DELETE FROM backups WHERE key = ? RETURNING blob_path'),
    getFileMeta: db.prepare('SELECT * FROM file_meta WHERE cid = ?'),
    insertFileMeta: db.prepare(`
      INSERT OR REPLACE INTO file_meta
        (cid, name, mime_type, size_bytes, uploader_did, reference_count, file_path, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `),
    deleteFileMeta: db.prepare('DELETE FROM file_meta WHERE cid = ? RETURNING file_path'),
    listFiles: db.prepare(
      'SELECT * FROM file_meta WHERE uploader_did = ? ORDER BY created_at DESC'
    ),
    upsertAwareness: db.prepare(`
      INSERT OR REPLACE INTO awareness_state (room, user_did, state_json, last_seen)
      VALUES (?, ?, ?, ?)
    `),
    getAwareness: db.prepare(`
      SELECT * FROM awareness_state WHERE room = ? ORDER BY last_seen DESC
    `),
    deleteAwareness: db.prepare('DELETE FROM awareness_state WHERE room = ? AND user_did = ?'),
    cleanAwareness: db.prepare('DELETE FROM awareness_state WHERE last_seen < ?'),
    upsertPeer: db.prepare(`
      INSERT OR REPLACE INTO peer_registry
        (did, public_key_b64, display_name, endpoints_json, hub_url, capabilities_json, last_seen, registered_at, version)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    getPeer: db.prepare('SELECT * FROM peer_registry WHERE did = ?'),
    listRecentPeers: db.prepare('SELECT * FROM peer_registry ORDER BY last_seen DESC LIMIT ?'),
    searchPeers: db.prepare(`
      SELECT * FROM peer_registry
      WHERE did LIKE ? OR display_name LIKE ?
      ORDER BY last_seen DESC
    `),
    removeStalePeers: db.prepare('DELETE FROM peer_registry WHERE last_seen < ?'),
    getPeerCount: db.prepare('SELECT COUNT(*) as count FROM peer_registry'),
    listFederationPeers: db.prepare('SELECT * FROM federation_peers ORDER BY registered_at DESC'),
    upsertFederationPeer: db.prepare(`
      INSERT OR REPLACE INTO federation_peers
        (hub_did, url, schemas, trust_level, max_latency_ms, rate_limit, healthy, last_success_at, registered_at, registered_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    updateFederationPeerHealth: db.prepare(`
      UPDATE federation_peers
      SET healthy = ?, last_success_at = COALESCE(?, last_success_at)
      WHERE hub_did = ?
    `),
    insertFederationLog: db.prepare(`
      INSERT INTO federation_query_log
        (query_id, from_hub, query_text, schema_filter, result_count, execution_ms, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `),
    listShardAssignments: db.prepare('SELECT * FROM shard_assignments ORDER BY shard_id'),
    clearShardAssignments: db.prepare('DELETE FROM shard_assignments'),
    insertShardAssignment: db.prepare(`
      INSERT INTO shard_assignments
        (shard_id, range_start, range_end, primary_url, primary_did, replica_url, replica_did, doc_count, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    upsertShardHost: db.prepare(`
      INSERT OR REPLACE INTO shard_hosts
        (hub_did, url, capacity, registered_at, last_seen)
      VALUES (?, ?, ?, ?, ?)
    `),
    listShardHosts: db.prepare('SELECT * FROM shard_hosts ORDER BY registered_at ASC'),
    removeShardHost: db.prepare('DELETE FROM shard_hosts WHERE hub_did = ?'),
    insertShardPosting: db.prepare(`
      INSERT OR REPLACE INTO shard_postings
        (shard_id, term, cid, tf, title, url, schema, author, language, indexed_at, doc_len)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    upsertShardTermStat: db.prepare(`
      INSERT OR REPLACE INTO shard_term_stats (shard_id, term, doc_freq)
      VALUES (?, ?, ?)
    `),
    updateShardDocCount: db.prepare(`
      UPDATE shard_assignments SET doc_count = ?, updated_at = ? WHERE shard_id = ?
    `),
    getShardDocCount: db.prepare(`
      SELECT COUNT(DISTINCT cid) as count FROM shard_postings WHERE shard_id = ?
    `),
    getShardAvgDocLen: db.prepare(`
      SELECT AVG(doc_len) as avg_len
      FROM (
        SELECT cid, MAX(doc_len) as doc_len
        FROM shard_postings
        WHERE shard_id = ?
        GROUP BY cid
      )
    `),
    upsertCrawler: db.prepare(`
      INSERT OR REPLACE INTO crawlers
        (did, type, capacity, languages_json, domains_json, reputation, total_crawled, registered_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `),
    getCrawler: db.prepare('SELECT * FROM crawlers WHERE did = ?'),
    listCrawlers: db.prepare('SELECT * FROM crawlers ORDER BY registered_at DESC'),
    updateCrawlerStats: db.prepare(`
      UPDATE crawlers
      SET reputation = COALESCE(?, reputation),
          total_crawled = COALESCE(?, total_crawled)
      WHERE did = ?
    `),
    upsertCrawlQueue: db.prepare(`
      INSERT OR REPLACE INTO crawl_queue
        (url, domain, priority, language, crawl_count, last_cid, last_crawled_at, enqueued_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `),
    listCrawlQueue: db.prepare(`
      SELECT * FROM crawl_queue
      ORDER BY priority DESC, enqueued_at ASC
      LIMIT ?
    `),
    getCrawlHistory: db.prepare(`
      SELECT * FROM crawl_history WHERE url = ? ORDER BY crawled_at DESC LIMIT 1
    `),
    insertCrawlHistory: db.prepare(`
      INSERT INTO crawl_history
        (url, cid, title, status_code, content_type, language, crawler_did, crawl_time_ms, crawled_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    upsertCrawlDomain: db.prepare(`
      INSERT OR REPLACE INTO crawl_domains
        (domain, last_crawled_at, cooldown_ms, blocked)
      VALUES (?, ?, ?, ?)
    `),
    getCrawlDomain: db.prepare('SELECT * FROM crawl_domains WHERE domain = ?'),
    insertSchema: db.prepare(`
      INSERT OR REPLACE INTO schemas
        (iri, version, definition_json, author_did, name, description, properties_count, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `),
    getSchemaLatest: db.prepare(`
      SELECT * FROM schemas WHERE iri = ? ORDER BY version DESC LIMIT 1
    `),
    getSchemaVersion: db.prepare('SELECT * FROM schemas WHERE iri = ? AND version = ?'),
    deleteSchemaSearch: db.prepare('DELETE FROM schema_search WHERE iri = ?'),
    insertSchemaSearch: db.prepare(`
      INSERT INTO schema_search (iri, version, name, description, property_names)
      VALUES (?, ?, ?, ?, ?)
    `),
    listSchemasByAuthor: db.prepare(`
      SELECT s.*
      FROM schemas s
      JOIN (
        SELECT iri, MAX(version) AS version
        FROM schemas
        WHERE author_did = ?
        GROUP BY iri
      ) latest ON latest.iri = s.iri AND latest.version = s.version
      ORDER BY s.created_at DESC
    `),
    listPopularSchemas: db.prepare(`
      SELECT s.*
      FROM schemas s
      JOIN (
        SELECT iri, MAX(version) AS version
        FROM schemas
        GROUP BY iri
      ) latest ON latest.iri = s.iri AND latest.version = s.version
      ORDER BY s.created_at DESC
      LIMIT ?
    `),
    searchSchemas: db.prepare(`
      SELECT s.*, bm25(schema_search) as rank
      FROM schema_search
      JOIN schemas s ON s.iri = schema_search.iri AND s.version = schema_search.version
      WHERE schema_search MATCH ?
      ORDER BY rank
      LIMIT ? OFFSET ?
    `),
    getFilesUsage: db.prepare(`
      SELECT COALESCE(SUM(size_bytes), 0) as totalBytes, COUNT(*) as fileCount
      FROM file_meta WHERE uploader_did = ?
    `),
    search: db.prepare(`
      SELECT doc_id, title, schema_iri,
             snippet(search_index, 2, '<b>', '</b>', '...', 32) as snippet,
             bm25(search_index) as rank
      FROM search_index
      WHERE search_index MATCH ?
      ORDER BY rank
      LIMIT ? OFFSET ?
    `),
    searchWithSchema: db.prepare(`
      SELECT doc_id, title, schema_iri,
             snippet(search_index, 2, '<b>', '</b>', '...', 32) as snippet,
             bm25(search_index) as rank
      FROM search_index
      WHERE search_index MATCH ? AND schema_iri = ?
      ORDER BY rank
      LIMIT ? OFFSET ?
    `),
    updateSearchBody: db.prepare(`
      INSERT INTO search_index(search_index, rowid, doc_id, title, body, schema_iri, owner_did)
      SELECT 'delete', rowid, doc_id, title, body, schema_iri, owner_did
      FROM search_index WHERE doc_id = ?;
    `),
    insertSearchBody: db.prepare(`
      INSERT INTO search_index(doc_id, title, body, schema_iri, owner_did)
      SELECT doc_id, title, ?, schema_iri, owner_did FROM doc_meta WHERE doc_id = ?
    `),
    hasNodeChange: db.prepare('SELECT 1 FROM node_changes WHERE hash = ?'),
    appendNodeChange: db.prepare(`
      INSERT OR IGNORE INTO node_changes
        (hash, change_id, change_type, room, node_id, schema_id,
         lamport_time, lamport_author, author_did, wall_time,
         parent_hash, payload_json, signature_b64, protocol_version,
         batch_id, batch_index, batch_size, received_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    getNodeChangesSince: db.prepare(`
      SELECT * FROM node_changes
      WHERE room = ? AND lamport_time > ?
      ORDER BY lamport_time ASC, lamport_author ASC
      LIMIT 1000
    `),
    getNodeChangesForNode: db.prepare(`
      SELECT * FROM node_changes
      WHERE room = ? AND node_id = ?
      ORDER BY lamport_time ASC
    `),
    getHighWaterMark: db.prepare(`
      SELECT MAX(lamport_time) as hwm FROM node_changes WHERE room = ?
    `),
    // Database row statements
    insertDatabaseRow: db.prepare(`
      INSERT INTO database_rows
        (id, database_id, sort_key, data, searchable, created_at, created_by, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `),
    updateDatabaseRow: db.prepare(`
      UPDATE database_rows
      SET sort_key = COALESCE(?, sort_key),
          data = COALESCE(?, data),
          searchable = COALESCE(?, searchable),
          updated_at = ?
      WHERE id = ?
    `),
    deleteDatabaseRow: db.prepare('DELETE FROM database_rows WHERE id = ?'),
    getDatabaseRow: db.prepare('SELECT * FROM database_rows WHERE id = ?'),
    getDatabaseRowCount: db.prepare(
      'SELECT COUNT(*) as count FROM database_rows WHERE database_id = ?'
    ),
    rebuildDatabaseRowsFts: db.prepare(`
      INSERT INTO database_rows_fts(database_rows_fts) VALUES('rebuild')
    `)
  }

  const getDocState = async (docId: string): Promise<Uint8Array | null> => {
    const row = stmts.getDocState.get(docId) as DocStateRow
    return row ? new Uint8Array(row.state) : null
  }

  const setDocState = async (docId: string, state: Uint8Array): Promise<void> => {
    stmts.upsertDocState.run(docId, Buffer.from(state), null, Date.now())
  }

  const getStateVector = async (docId: string): Promise<Uint8Array | null> => {
    const row = stmts.getStateVector.get(docId) as StateVectorRow
    return row?.state_vector ? new Uint8Array(row.state_vector) : null
  }

  const putBlob = async (key: string, data: Uint8Array, meta: BlobMeta): Promise<void> => {
    const blobDir = join(dataDir, 'blobs')
    const blobPath = assertSafePath(blobDir, key)
    writeFileSync(blobPath, data)

    stmts.insertBackup.run(
      key,
      meta.docId,
      meta.ownerDid,
      meta.sizeBytes,
      meta.contentType,
      blobPath,
      meta.createdAt || Date.now()
    )
  }

  const getBlob = async (key: string): Promise<Uint8Array | null> => {
    const row = stmts.getBackup.get(key) as BackupRow
    if (!row) return null

    try {
      const data = readFileSync(row.blob_path)
      return new Uint8Array(data)
    } catch {
      return null
    }
  }

  const listBlobs = async (ownerDid: string): Promise<BlobMeta[]> => {
    const rows = stmts.listBackups.all(ownerDid) as BackupMetaRow[]

    return rows.map((row) => ({
      key: row.key,
      docId: row.doc_id,
      ownerDid: row.owner_did,
      sizeBytes: row.size_bytes,
      contentType: row.content_type,
      createdAt: row.created_at
    }))
  }

  const rowToFileMeta = (row: FileMetaRow): FileMeta => ({
    cid: row.cid,
    name: row.name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    uploaderDid: row.uploader_did,
    referenceCount: row.reference_count,
    createdAt: row.created_at
  })

  const getFileMeta = async (cid: string): Promise<FileMeta | null> => {
    const row = stmts.getFileMeta.get(cid) as FileMetaRow | undefined
    if (!row) return null
    return rowToFileMeta(row)
  }

  const putFile = async (
    cid: string,
    data: Uint8Array,
    meta: Omit<FileMeta, 'referenceCount' | 'createdAt'>
  ): Promise<void> => {
    const fileDir = join(dataDir, 'files')
    const filePath = assertSafePath(fileDir, cid)
    writeFileSync(filePath, data)

    stmts.insertFileMeta.run(
      cid,
      meta.name,
      meta.mimeType,
      meta.sizeBytes,
      meta.uploaderDid,
      1,
      filePath,
      Date.now()
    )
  }

  const getFileData = async (cid: string): Promise<Uint8Array | null> => {
    const row = stmts.getFileMeta.get(cid) as FileMetaRow | undefined
    if (!row) return null
    try {
      const data = readFileSync(row.file_path)
      return new Uint8Array(data)
    } catch {
      return null
    }
  }

  const deleteFile = async (cid: string): Promise<void> => {
    const row = stmts.deleteFileMeta.get(cid) as { file_path: string } | undefined
    if (row?.file_path && existsSync(row.file_path)) {
      unlinkSync(row.file_path)
    }
  }

  const listFiles = async (uploaderDid: string): Promise<FileMeta[]> => {
    const rows = stmts.listFiles.all(uploaderDid) as FileMetaRow[]
    return rows.map(rowToFileMeta)
  }

  const getFilesUsage = async (
    uploaderDid: string
  ): Promise<{ totalBytes: number; fileCount: number }> => {
    const row = stmts.getFilesUsage.get(uploaderDid) as
      | { totalBytes: number; fileCount: number }
      | undefined
    return {
      totalBytes: row?.totalBytes ?? 0,
      fileCount: row?.fileCount ?? 0
    }
  }

  const rowToSchemaRecord = (row: SchemaRow): SchemaRecord => ({
    iri: row.iri,
    version: row.version,
    definition: JSON.parse(row.definition_json) as SchemaRecord['definition'],
    authorDid: row.author_did,
    name: row.name,
    description: row.description ?? '',
    propertiesCount: row.properties_count ?? 0,
    createdAt: row.created_at
  })

  const schemaPropertyNames = (schema: SchemaRecord): string => {
    const definition = schema.definition as { properties?: unknown }
    const properties = definition.properties
    if (Array.isArray(properties)) {
      return properties
        .map((prop) =>
          typeof (prop as { name?: unknown }).name === 'string'
            ? String((prop as { name?: unknown }).name)
            : ''
        )
        .filter((name) => name.length > 0)
        .join(' ')
    }
    if (properties && typeof properties === 'object') {
      return Object.keys(properties).join(' ')
    }
    return ''
  }

  const putSchema = async (schema: SchemaRecord): Promise<void> => {
    const write = db.transaction(() => {
      stmts.insertSchema.run(
        schema.iri,
        schema.version,
        JSON.stringify(schema.definition),
        schema.authorDid,
        schema.name,
        schema.description,
        schema.propertiesCount,
        schema.createdAt || Date.now()
      )
      stmts.deleteSchemaSearch.run(schema.iri)
      stmts.insertSchemaSearch.run(
        schema.iri,
        schema.version,
        schema.name,
        schema.description,
        schemaPropertyNames(schema)
      )
    })
    write()
  }

  const getSchema = async (iri: string, version?: number): Promise<SchemaRecord | null> => {
    const row =
      version !== undefined
        ? (stmts.getSchemaVersion.get(iri, version) as SchemaRow | undefined)
        : (stmts.getSchemaLatest.get(iri) as SchemaRow | undefined)
    return row ? rowToSchemaRecord(row) : null
  }

  const listSchemasByAuthor = async (authorDid: string): Promise<SchemaRecord[]> => {
    const rows = stmts.listSchemasByAuthor.all(authorDid) as SchemaRow[]
    return rows.map(rowToSchemaRecord)
  }

  const searchSchemas = async (
    query: string,
    options?: { limit?: number; offset?: number }
  ): Promise<SchemaRecord[]> => {
    const limit = options?.limit ?? 20
    const offset = options?.offset ?? 0
    const rows = stmts.searchSchemas.all(query, limit, offset) as (SchemaRow & { rank: number })[]
    return rows.map((row) => rowToSchemaRecord(row))
  }

  const listPopularSchemas = async (limit = 20): Promise<SchemaRecord[]> => {
    const rows = stmts.listPopularSchemas.all(limit) as SchemaRow[]
    return rows.map(rowToSchemaRecord)
  }

  const rowToAwarenessEntry = (row: AwarenessRow): AwarenessEntry => ({
    room: row.room,
    userDid: row.user_did,
    state: JSON.parse(row.state_json) as AwarenessEntry['state'],
    lastSeen: row.last_seen
  })

  const setAwareness = async (entry: AwarenessEntry): Promise<void> => {
    stmts.upsertAwareness.run(
      entry.room,
      entry.userDid,
      JSON.stringify(entry.state),
      entry.lastSeen
    )
  }

  const getAwareness = async (room: string): Promise<AwarenessEntry[]> => {
    const rows = stmts.getAwareness.all(room) as AwarenessRow[]
    return rows.map(rowToAwarenessEntry)
  }

  const removeAwareness = async (room: string, userDid: string): Promise<void> => {
    stmts.deleteAwareness.run(room, userDid)
  }

  const cleanStaleAwareness = async (olderThanMs: number): Promise<number> => {
    const cutoff = Date.now() - olderThanMs
    const result = stmts.cleanAwareness.run(cutoff) as { changes: number }
    return result.changes ?? 0
  }

  const rowToPeerRecord = (row: PeerRow): PeerRecord => ({
    did: row.did,
    publicKeyB64: row.public_key_b64,
    displayName: row.display_name ?? undefined,
    endpoints: JSON.parse(row.endpoints_json) as PeerEndpoint[],
    hubUrl: row.hub_url ?? undefined,
    capabilities: JSON.parse(row.capabilities_json) as string[],
    lastSeen: row.last_seen,
    registeredAt: row.registered_at,
    version: row.version
  })

  const upsertPeer = async (peer: PeerRecord): Promise<void> => {
    stmts.upsertPeer.run(
      peer.did,
      peer.publicKeyB64,
      peer.displayName ?? null,
      JSON.stringify(peer.endpoints),
      peer.hubUrl ?? null,
      JSON.stringify(peer.capabilities),
      peer.lastSeen,
      peer.registeredAt,
      peer.version
    )
  }

  const getPeer = async (did: string): Promise<PeerRecord | null> => {
    const row = stmts.getPeer.get(did) as PeerRow | undefined
    return row ? rowToPeerRecord(row) : null
  }

  const listRecentPeers = async (limit = 50): Promise<PeerRecord[]> => {
    const rows = stmts.listRecentPeers.all(limit) as PeerRow[]
    return rows.map(rowToPeerRecord)
  }

  const searchPeers = async (query: string): Promise<PeerRecord[]> => {
    const pattern = `%${query}%`
    const rows = stmts.searchPeers.all(pattern, pattern) as PeerRow[]
    return rows.map(rowToPeerRecord)
  }

  const removeStalePeers = async (olderThanMs: number): Promise<number> => {
    const cutoff = Date.now() - olderThanMs
    const result = stmts.removeStalePeers.run(cutoff) as { changes: number }
    return result.changes ?? 0
  }

  const getPeerCount = async (): Promise<number> => {
    const row = stmts.getPeerCount.get() as { count: number } | undefined
    return row?.count ?? 0
  }

  const rowToFederationPeer = (row: FederationPeerRow): FederationPeerRecord => ({
    hubDid: row.hub_did,
    url: row.url,
    schemas: row.schemas === '*' ? '*' : (JSON.parse(row.schemas) as string[]),
    trustLevel: row.trust_level,
    maxLatencyMs: row.max_latency_ms,
    rateLimit: row.rate_limit,
    healthy: row.healthy === 1,
    lastSuccessAt: row.last_success_at,
    registeredAt: row.registered_at,
    registeredBy: row.registered_by ?? null
  })

  const listFederationPeers = async (): Promise<FederationPeerRecord[]> => {
    const rows = stmts.listFederationPeers.all() as FederationPeerRow[]
    return rows.map(rowToFederationPeer)
  }

  const upsertFederationPeer = async (peer: FederationPeerRecord): Promise<void> => {
    const schemas = peer.schemas === '*' ? '*' : JSON.stringify(peer.schemas)
    stmts.upsertFederationPeer.run(
      peer.hubDid,
      peer.url,
      schemas,
      peer.trustLevel,
      peer.maxLatencyMs,
      peer.rateLimit,
      peer.healthy ? 1 : 0,
      peer.lastSuccessAt ?? null,
      peer.registeredAt,
      peer.registeredBy ?? null
    )
  }

  const updateFederationPeerHealth = async (
    hubDid: string,
    healthy: boolean,
    lastSuccessAt?: number | null
  ): Promise<void> => {
    stmts.updateFederationPeerHealth.run(healthy ? 1 : 0, lastSuccessAt ?? null, hubDid)
  }

  const logFederationQuery = async (entry: FederationQueryLog): Promise<void> => {
    stmts.insertFederationLog.run(
      entry.queryId,
      entry.fromHub,
      entry.queryText,
      entry.schemaFilter,
      entry.resultCount,
      entry.executionMs,
      entry.timestamp
    )
  }

  const rowToShardAssignment = (row: ShardAssignmentRow): ShardAssignmentRecord => ({
    shardId: row.shard_id,
    rangeStart: row.range_start,
    rangeEnd: row.range_end,
    primaryUrl: row.primary_url,
    primaryDid: row.primary_did,
    replicaUrl: row.replica_url ?? null,
    replicaDid: row.replica_did ?? null,
    docCount: row.doc_count,
    updatedAt: row.updated_at
  })

  const listShardAssignments = async (): Promise<ShardAssignmentRecord[]> => {
    const rows = stmts.listShardAssignments.all() as ShardAssignmentRow[]
    return rows.map(rowToShardAssignment)
  }

  const replaceShardAssignments = async (assignments: ShardAssignmentRecord[]): Promise<void> => {
    const update = db.transaction(() => {
      stmts.clearShardAssignments.run()
      for (const assignment of assignments) {
        stmts.insertShardAssignment.run(
          assignment.shardId,
          assignment.rangeStart,
          assignment.rangeEnd,
          assignment.primaryUrl,
          assignment.primaryDid,
          assignment.replicaUrl ?? null,
          assignment.replicaDid ?? null,
          assignment.docCount,
          assignment.updatedAt
        )
      }
    })
    update()
  }

  const upsertShardHost = async (host: ShardHostRecord): Promise<void> => {
    stmts.upsertShardHost.run(
      host.hubDid,
      host.url,
      host.capacity,
      host.registeredAt,
      host.lastSeen
    )
  }

  const listShardHosts = async (): Promise<ShardHostRecord[]> => {
    const rows = stmts.listShardHosts.all() as ShardHostRow[]
    return rows.map((row) => ({
      hubDid: row.hub_did,
      url: row.url,
      capacity: row.capacity,
      registeredAt: row.registered_at,
      lastSeen: row.last_seen
    }))
  }

  const removeShardHost = async (hubDid: string): Promise<void> => {
    stmts.removeShardHost.run(hubDid)
  }

  const insertShardPosting = async (posting: ShardPosting): Promise<void> => {
    stmts.insertShardPosting.run(
      posting.shardId,
      posting.term,
      posting.cid,
      posting.tf,
      posting.title,
      posting.url ?? null,
      posting.schema ?? null,
      posting.author ?? null,
      posting.language ?? null,
      posting.indexedAt,
      posting.docLen
    )
  }

  const listShardPostings = async (shardId: number, terms: string[]): Promise<ShardPosting[]> => {
    if (terms.length === 0) return []
    const placeholders = terms.map(() => '?').join(', ')
    const statement = db.prepare(
      `SELECT * FROM shard_postings WHERE shard_id = ? AND term IN (${placeholders})`
    )
    const rows = statement.all(shardId, ...terms) as ShardPostingRow[]
    return rows.map((row) => ({
      shardId: row.shard_id,
      term: row.term,
      cid: row.cid,
      tf: row.tf,
      title: row.title,
      url: row.url ?? undefined,
      schema: row.schema ?? undefined,
      author: row.author ?? undefined,
      language: row.language ?? undefined,
      indexedAt: row.indexed_at,
      docLen: row.doc_len
    }))
  }

  const recomputeShardTermStats = async (shardId: number, terms: string[]): Promise<void> => {
    if (terms.length === 0) return
    const placeholders = terms.map(() => '?').join(', ')
    const statement = db.prepare(
      `SELECT term, COUNT(DISTINCT cid) as doc_freq
       FROM shard_postings
       WHERE shard_id = ? AND term IN (${placeholders})
       GROUP BY term`
    )
    const rows = statement.all(shardId, ...terms) as ShardTermStatRow[]
    for (const row of rows) {
      stmts.upsertShardTermStat.run(shardId, row.term, row.doc_freq)
    }
  }

  const getShardTermStats = async (shardId: number, terms: string[]): Promise<ShardTermStat[]> => {
    if (terms.length === 0) return []
    const placeholders = terms.map(() => '?').join(', ')
    const statement = db.prepare(
      `SELECT shard_id, term, doc_freq
       FROM shard_term_stats
       WHERE shard_id = ? AND term IN (${placeholders})`
    )
    const rows = statement.all(shardId, ...terms) as ShardTermStatRow[]
    return rows.map((row) => ({
      shardId: row.shard_id,
      term: row.term,
      docFreq: row.doc_freq
    }))
  }

  const getShardStats = async (shardId: number): Promise<ShardStats> => {
    const countRow = stmts.getShardDocCount.get(shardId) as { count: number } | undefined
    const avgRow = stmts.getShardAvgDocLen.get(shardId) as { avg_len: number | null } | undefined
    return {
      shardId,
      totalDocs: countRow?.count ?? 0,
      avgDocLen: avgRow?.avg_len ?? 0
    }
  }

  const updateShardDocCount = async (shardId: number, docCount: number): Promise<void> => {
    stmts.updateShardDocCount.run(docCount, Date.now(), shardId)
  }

  const rowToCrawler = (row: CrawlerRow): CrawlerProfile => ({
    did: row.did,
    type: row.type,
    capacity: row.capacity,
    languages: JSON.parse(row.languages_json) as string[],
    domains: row.domains_json ? (JSON.parse(row.domains_json) as string[]) : undefined,
    reputation: row.reputation,
    totalCrawled: row.total_crawled,
    registeredAt: row.registered_at
  })

  const upsertCrawler = async (profile: CrawlerProfile): Promise<void> => {
    stmts.upsertCrawler.run(
      profile.did,
      profile.type,
      profile.capacity,
      JSON.stringify(profile.languages),
      profile.domains ? JSON.stringify(profile.domains) : null,
      profile.reputation,
      profile.totalCrawled,
      profile.registeredAt
    )
  }

  const getCrawler = async (did: string): Promise<CrawlerProfile | null> => {
    const row = stmts.getCrawler.get(did) as CrawlerRow | undefined
    return row ? rowToCrawler(row) : null
  }

  const listCrawlers = async (): Promise<CrawlerProfile[]> => {
    const rows = stmts.listCrawlers.all() as CrawlerRow[]
    return rows.map(rowToCrawler)
  }

  const updateCrawlerStats = async (
    did: string,
    updates: { reputation?: number; totalCrawled?: number }
  ): Promise<void> => {
    stmts.updateCrawlerStats.run(updates.reputation ?? null, updates.totalCrawled ?? null, did)
  }

  const rowToCrawlQueue = (row: CrawlQueueRow): CrawlQueueEntry => ({
    url: row.url,
    domain: row.domain,
    priority: row.priority,
    language: row.language ?? null,
    crawlCount: row.crawl_count,
    lastCid: row.last_cid ?? null,
    lastCrawledAt: row.last_crawled_at ?? null,
    enqueuedAt: row.enqueued_at
  })

  const upsertCrawlQueue = async (entry: CrawlQueueEntry): Promise<void> => {
    stmts.upsertCrawlQueue.run(
      entry.url,
      entry.domain,
      entry.priority,
      entry.language ?? null,
      entry.crawlCount,
      entry.lastCid ?? null,
      entry.lastCrawledAt ?? null,
      entry.enqueuedAt
    )
  }

  const getQueuedUrls = async (options: {
    limit: number
    languages?: string[]
    domains?: string[]
  }): Promise<CrawlQueueEntry[]> => {
    const rows = stmts.listCrawlQueue.all(options.limit) as CrawlQueueRow[]
    const langSet = options.languages ? new Set(options.languages) : null
    const domainSet = options.domains ? new Set(options.domains) : null
    return rows
      .map(rowToCrawlQueue)
      .filter((entry) => (langSet ? !entry.language || langSet.has(entry.language) : true))
      .filter((entry) => (domainSet ? domainSet.has(entry.domain) : true))
  }

  const getCrawlHistory = async (url: string): Promise<CrawlHistoryEntry | null> => {
    const row = stmts.getCrawlHistory.get(url) as CrawlHistoryRow | undefined
    if (!row) return null
    return {
      url: row.url,
      cid: row.cid,
      title: row.title ?? '',
      statusCode: row.status_code ?? 0,
      contentType: row.content_type ?? '',
      language: row.language ?? '',
      crawlerDid: row.crawler_did ?? '',
      crawlTimeMs: row.crawl_time_ms ?? 0,
      crawledAt: row.crawled_at
    }
  }

  const appendCrawlHistory = async (entry: CrawlHistoryEntry): Promise<void> => {
    stmts.insertCrawlHistory.run(
      entry.url,
      entry.cid,
      entry.title,
      entry.statusCode,
      entry.contentType,
      entry.language,
      entry.crawlerDid,
      entry.crawlTimeMs,
      entry.crawledAt
    )
  }

  const upsertCrawlDomainState = async (state: CrawlDomainState): Promise<void> => {
    stmts.upsertCrawlDomain.run(
      state.domain,
      state.lastCrawledAt,
      state.cooldownMs,
      state.blocked ? 1 : 0
    )
  }

  const getCrawlDomainState = async (domain: string): Promise<CrawlDomainState | null> => {
    const row = stmts.getCrawlDomain.get(domain) as CrawlDomainRow | undefined
    if (!row) return null
    return {
      domain: row.domain,
      lastCrawledAt: row.last_crawled_at ?? 0,
      cooldownMs: row.cooldown_ms,
      blocked: row.blocked === 1
    }
  }

  const deleteBlob = async (key: string): Promise<void> => {
    const row = stmts.deleteBackup.get(key) as BackupRow
    if (row?.blob_path && existsSync(row.blob_path)) {
      unlinkSync(row.blob_path)
    }
  }

  const setDocMeta = async (docId: string, meta: DocMeta): Promise<void> => {
    const maybeRecipients = meta.properties?.recipients
    const recipients: string[] = []
    if (Array.isArray(maybeRecipients)) {
      for (const value of maybeRecipients) {
        if (typeof value === 'string') {
          recipients.push(value)
        }
      }
    }

    const write = db.transaction(() => {
      stmts.upsertDocMeta.run(
        docId,
        meta.ownerDid,
        meta.schemaIri,
        meta.title,
        JSON.stringify(meta.properties ?? {}),
        meta.createdAt || Date.now(),
        meta.updatedAt || Date.now()
      )
      stmts.deleteDocRecipients.run(docId)
      for (const recipient of recipients) {
        stmts.insertDocRecipient.run(docId, recipient)
      }
    })

    write()
  }

  const getDocMeta = async (docId: string): Promise<DocMeta | null> => {
    const row = stmts.getDocMeta.get(docId) as DocMetaRow
    if (!row) return null

    return {
      docId: row.doc_id,
      ownerDid: row.owner_did,
      schemaIri: row.schema_iri,
      title: row.title,
      properties: JSON.parse(row.properties_json),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
  }

  const listDocRecipients = async (docId: string): Promise<string[]> => {
    const rows = stmts.listDocRecipients.all(docId) as DocRecipientRow[]
    return rows.map((row) => row.recipient)
  }

  const upsertGrantIndex = async (record: GrantIndexRecord): Promise<void> => {
    stmts.upsertGrantIndex.run(
      record.grantId,
      record.granteeDid,
      record.resourceDocId,
      JSON.stringify(record.actions),
      record.expiresAt,
      record.revokedAt,
      record.createdAt
    )
  }

  const removeGrantIndex = async (grantId: string): Promise<void> => {
    stmts.removeGrantIndex.run(grantId)
  }

  const listGrantedDocIds = async (granteeDid: string, now = Date.now()): Promise<string[]> => {
    const rows = stmts.listGrantedDocIds.all(granteeDid, now) as GrantedResourceRow[]
    return rows.map((row) => row.resource_doc_id)
  }

  const search = async (query: string, options?: SearchOptions): Promise<SearchResult[]> => {
    const limit = options?.limit ?? 20
    const offset = options?.offset ?? 0

    let rows: SearchRow[]

    if (options?.schemaIri) {
      rows = stmts.searchWithSchema.all(query, options.schemaIri, limit, offset) as SearchRow[]
    } else {
      rows = stmts.search.all(query, limit, offset) as SearchRow[]
    }

    return rows.map((row) => ({
      docId: row.doc_id,
      title: row.title,
      schemaIri: row.schema_iri,
      snippet: row.snippet,
      rank: row.rank
    }))
  }

  const rowToSerializedChange = (row: NodeChangeRow): SerializedNodeChange => ({
    id: row.change_id,
    type: row.change_type,
    hash: row.hash,
    room: row.room,
    nodeId: row.node_id,
    schemaId: row.schema_id ?? undefined,
    lamportTime: row.lamport_time,
    lamportAuthor: row.lamport_author,
    authorDid: row.author_did,
    wallTime: row.wall_time,
    parentHash: row.parent_hash,
    payload: JSON.parse(row.payload_json) as SerializedNodeChange['payload'],
    signatureB64: row.signature_b64,
    protocolVersion: row.protocol_version ?? undefined,
    batchId: row.batch_id ?? undefined,
    batchIndex: row.batch_index ?? undefined,
    batchSize: row.batch_size ?? undefined
  })

  const hasNodeChange = async (hash: string): Promise<boolean> => {
    const row = stmts.hasNodeChange.get(hash) as { '1': number } | undefined
    return Boolean(row)
  }

  const appendNodeChange = async (room: string, change: SerializedNodeChange): Promise<void> => {
    stmts.appendNodeChange.run(
      change.hash,
      change.id,
      change.type,
      room,
      change.nodeId,
      change.schemaId ?? null,
      change.lamportTime,
      change.lamportAuthor,
      change.authorDid,
      change.wallTime,
      change.parentHash ?? null,
      JSON.stringify(change.payload),
      change.signatureB64,
      change.protocolVersion ?? null,
      change.batchId ?? null,
      change.batchIndex ?? null,
      change.batchSize ?? null,
      Date.now()
    )
  }

  const getNodeChangesSince = async (
    room: string,
    sinceLamport: number
  ): Promise<SerializedNodeChange[]> => {
    const rows = stmts.getNodeChangesSince.all(room, sinceLamport) as NodeChangeRow[]
    return rows.map(rowToSerializedChange)
  }

  const getNodeChangesForNode = async (
    room: string,
    nodeId: string
  ): Promise<SerializedNodeChange[]> => {
    const rows = stmts.getNodeChangesForNode.all(room, nodeId) as NodeChangeRow[]
    return rows.map(rowToSerializedChange)
  }

  const getHighWaterMark = async (room: string): Promise<number> => {
    const row = stmts.getHighWaterMark.get(room) as { hwm: number | null } | undefined
    return row?.hwm ?? 0
  }

  const close = async (): Promise<void> => {
    db.close()
  }

  // ─── Database Row Functions ────────────────────────────────────────────────

  const rowToDatabaseRow = (row: DatabaseRowRow): DatabaseRowRecord => ({
    id: row.id,
    databaseId: row.database_id,
    sortKey: row.sort_key,
    data: JSON.parse(row.data) as Record<string, unknown>,
    searchable: row.searchable,
    createdAt: row.created_at,
    createdBy: row.created_by,
    updatedAt: row.updated_at
  })

  const insertDatabaseRow = async (row: DatabaseRowRecord): Promise<void> => {
    stmts.insertDatabaseRow.run(
      row.id,
      row.databaseId,
      row.sortKey,
      JSON.stringify(row.data),
      row.searchable,
      row.createdAt,
      row.createdBy,
      row.updatedAt
    )
  }

  const updateDatabaseRow = async (
    rowId: string,
    updates: Partial<Omit<DatabaseRowRecord, 'id' | 'databaseId' | 'createdAt' | 'createdBy'>>
  ): Promise<void> => {
    stmts.updateDatabaseRow.run(
      updates.sortKey ?? null,
      updates.data ? JSON.stringify(updates.data) : null,
      updates.searchable ?? null,
      updates.updatedAt ?? Date.now(),
      rowId
    )
  }

  const deleteDatabaseRow = async (rowId: string): Promise<void> => {
    stmts.deleteDatabaseRow.run(rowId)
  }

  const getDatabaseRow = async (rowId: string): Promise<DatabaseRowRecord | null> => {
    const row = stmts.getDatabaseRow.get(rowId) as DatabaseRowRow | undefined
    return row ? rowToDatabaseRow(row) : null
  }

  const getDatabaseRowCount = async (databaseId: string): Promise<number> => {
    const row = stmts.getDatabaseRowCount.get(databaseId) as { count: number } | undefined
    return row?.count ?? 0
  }

  const batchInsertDatabaseRows = async (rows: DatabaseRowRecord[]): Promise<void> => {
    const insertFn = db.transaction(() => {
      for (const row of rows) {
        stmts.insertDatabaseRow.run(
          row.id,
          row.databaseId,
          row.sortKey,
          JSON.stringify(row.data),
          row.searchable,
          row.createdAt,
          row.createdBy,
          row.updatedAt
        )
      }
    })
    insertFn()
  }

  const rebuildDatabaseRowsFts = async (_databaseId: string): Promise<void> => {
    stmts.rebuildDatabaseRowsFts.run()
  }

  const queryDatabaseRows = async (
    options: DatabaseRowQueryOptions
  ): Promise<DatabaseRowQueryResult> => {
    const startTime = performance.now()
    const { databaseId, filters, sorts, search, limit = 50, cursor, select } = options

    // Build SQL query dynamically
    const params: unknown[] = []

    // SELECT clause
    let selectClause = '*'
    if (select && select.length > 0) {
      const cols = ['id', 'database_id', 'sort_key', 'created_at', 'created_by', 'updated_at']
      for (const col of select) {
        cols.push(`json_extract(data, '$.${col}') as "${col}"`)
      }
      selectClause = cols.join(', ')
    }

    let sql = `SELECT ${selectClause} FROM database_rows WHERE database_id = ?`
    params.push(databaseId)

    // Apply filters
    if (filters) {
      const { clause, values } = buildFilterClause(filters)
      if (clause) {
        sql += ` AND ${clause}`
        params.push(...values)
      }
    }

    // Full-text search
    if (search) {
      sql += ` AND rowid IN (SELECT rowid FROM database_rows_fts WHERE database_rows_fts MATCH ?)`
      params.push(escapeFtsQuery(search))
    }

    // Cursor pagination (keyset)
    if (cursor) {
      try {
        const { sortKey, id } = JSON.parse(Buffer.from(cursor, 'base64url').toString())
        sql += ` AND (sort_key > ? OR (sort_key = ? AND id > ?))`
        params.push(sortKey, sortKey, id)
      } catch {
        // Invalid cursor, ignore
      }
    }

    // Sort clause
    if (sorts && sorts.length > 0) {
      const orderBy = sorts
        .map((s) => {
          const col =
            s.columnId === 'sortKey' ? 'sort_key' : `json_extract(data, '$.${s.columnId}')`
          return `${col} ${s.direction.toUpperCase()}`
        })
        .join(', ')
      sql += ` ORDER BY ${orderBy}, id ASC`
    } else {
      sql += ` ORDER BY sort_key ASC, id ASC`
    }

    // Limit (fetch one extra to detect hasMore)
    sql += ` LIMIT ?`
    params.push(limit + 1)

    // Execute query
    const rows = db.prepare(sql).all(...params) as DatabaseRowRow[]

    // Check if there are more rows
    const hasMore = rows.length > limit
    const resultRows = hasMore ? rows.slice(0, limit) : rows

    // Build cursor for next page
    let nextCursor: string | undefined
    if (hasMore && resultRows.length > 0) {
      const lastRow = resultRows[resultRows.length - 1]
      nextCursor = Buffer.from(
        JSON.stringify({ sortKey: lastRow.sort_key, id: lastRow.id })
      ).toString('base64url')
    }

    // Get total count
    let countSql = `SELECT COUNT(*) as count FROM database_rows WHERE database_id = ?`
    const countParams: unknown[] = [databaseId]

    if (filters) {
      const { clause, values } = buildFilterClause(filters)
      if (clause) {
        countSql += ` AND ${clause}`
        countParams.push(...values)
      }
    }

    if (search) {
      countSql += ` AND rowid IN (SELECT rowid FROM database_rows_fts WHERE database_rows_fts MATCH ?)`
      countParams.push(escapeFtsQuery(search))
    }

    const countRow = db.prepare(countSql).get(...countParams) as { count: number } | undefined
    const total = countRow?.count ?? 0

    const queryTime = performance.now() - startTime

    return {
      rows: resultRows.map(rowToDatabaseRow),
      total,
      cursor: nextCursor,
      hasMore,
      queryTime
    }
  }

  // Helper: Build filter clause for SQL
  function buildFilterClause(group: DatabaseFilterGroup): { clause: string; values: unknown[] } {
    const clauses: string[] = []
    const values: unknown[] = []

    for (const condition of group.conditions) {
      if ('conditions' in condition) {
        // Nested group
        const nested = buildFilterClause(condition as DatabaseFilterGroup)
        if (nested.clause) {
          clauses.push(`(${nested.clause})`)
          values.push(...nested.values)
        }
      } else {
        // Simple condition
        const { clause, params } = buildConditionClause(condition as DatabaseFilterCondition)
        if (clause) {
          clauses.push(clause)
          values.push(...params)
        }
      }
    }

    if (clauses.length === 0) {
      return { clause: '', values: [] }
    }

    const joinOp = group.operator === 'and' ? ' AND ' : ' OR '
    return { clause: clauses.join(joinOp), values }
  }

  function buildConditionClause(condition: DatabaseFilterCondition): {
    clause: string
    params: unknown[]
  } {
    const { columnId, operator, value } = condition
    const col = `json_extract(data, '$.${columnId}')`

    switch (operator) {
      case 'equals':
        return { clause: `${col} = ?`, params: [value] }
      case 'notEquals':
        return { clause: `${col} != ?`, params: [value] }
      case 'contains':
        return { clause: `${col} LIKE ?`, params: [`%${value}%`] }
      case 'notContains':
        return { clause: `${col} NOT LIKE ?`, params: [`%${value}%`] }
      case 'startsWith':
        return { clause: `${col} LIKE ?`, params: [`${value}%`] }
      case 'endsWith':
        return { clause: `${col} LIKE ?`, params: [`%${value}`] }
      case 'isEmpty':
        return { clause: `(${col} IS NULL OR ${col} = '')`, params: [] }
      case 'isNotEmpty':
        return { clause: `(${col} IS NOT NULL AND ${col} != '')`, params: [] }
      case 'greaterThan':
        return { clause: `CAST(${col} AS REAL) > ?`, params: [value] }
      case 'lessThan':
        return { clause: `CAST(${col} AS REAL) < ?`, params: [value] }
      case 'greaterOrEqual':
        return { clause: `CAST(${col} AS REAL) >= ?`, params: [value] }
      case 'lessOrEqual':
        return { clause: `CAST(${col} AS REAL) <= ?`, params: [value] }
      case 'before':
        return { clause: `${col} < ?`, params: [value] }
      case 'after':
        return { clause: `${col} > ?`, params: [value] }
      case 'between': {
        const [start, end] = value as [unknown, unknown]
        return { clause: `${col} BETWEEN ? AND ?`, params: [start, end] }
      }
      case 'hasAny': {
        const anyValues = value as unknown[]
        const anyPlaceholders = anyValues.map(() => '?').join(', ')
        return {
          clause: `EXISTS (SELECT 1 FROM json_each(${col}) WHERE value IN (${anyPlaceholders}))`,
          params: anyValues
        }
      }
      case 'hasAll': {
        const allValues = value as unknown[]
        const allClauses = allValues
          .map(() => `EXISTS (SELECT 1 FROM json_each(${col}) WHERE value = ?)`)
          .join(' AND ')
        return { clause: `(${allClauses})`, params: allValues }
      }
      case 'hasNone': {
        const noneValues = value as unknown[]
        const nonePlaceholders = noneValues.map(() => '?').join(', ')
        return {
          clause: `NOT EXISTS (SELECT 1 FROM json_each(${col}) WHERE value IN (${nonePlaceholders}))`,
          params: noneValues
        }
      }
      default:
        return { clause: '', params: [] }
    }
  }

  function escapeFtsQuery(search: string): string {
    // Tokenize and add prefix matching for FTS5
    const terms = search
      .trim()
      .split(/\s+/)
      .filter((t) => t.length > 0)
      .map((t) => `"${t.replace(/"/g, '""')}"*`)
    return terms.join(' OR ')
  }

  return {
    getDocState,
    setDocState,
    getStateVector,
    putBlob,
    getBlob,
    listBlobs,
    deleteBlob,
    setDocMeta,
    getDocMeta,
    search,
    listDocRecipients,
    upsertGrantIndex,
    removeGrantIndex,
    listGrantedDocIds,
    getFileMeta,
    putFile,
    getFileData,
    deleteFile,
    listFiles,
    getFilesUsage,
    setAwareness,
    getAwareness,
    removeAwareness,
    cleanStaleAwareness,
    upsertPeer,
    getPeer,
    listRecentPeers,
    searchPeers,
    removeStalePeers,
    getPeerCount,
    listFederationPeers,
    upsertFederationPeer,
    updateFederationPeerHealth,
    logFederationQuery,
    listShardAssignments,
    replaceShardAssignments,
    upsertShardHost,
    listShardHosts,
    removeShardHost,
    insertShardPosting,
    listShardPostings,
    recomputeShardTermStats,
    getShardTermStats,
    getShardStats,
    updateShardDocCount,
    upsertCrawler,
    getCrawler,
    listCrawlers,
    updateCrawlerStats,
    upsertCrawlQueue,
    getQueuedUrls,
    getCrawlHistory,
    appendCrawlHistory,
    upsertCrawlDomainState,
    getCrawlDomainState,
    putSchema,
    getSchema,
    listSchemasByAuthor,
    searchSchemas,
    listPopularSchemas,
    hasNodeChange,
    appendNodeChange,
    getNodeChangesSince,
    getNodeChangesForNode,
    getHighWaterMark,
    updateSearchBody: async (docId: string, text: string): Promise<void> => {
      const updateFn = db.transaction(() => {
        stmts.updateSearchBody.run(docId)
        stmts.insertSearchBody.run(text, docId)
      })
      updateFn()
    },
    insertDatabaseRow,
    updateDatabaseRow,
    deleteDatabaseRow,
    getDatabaseRow,
    queryDatabaseRows,
    getDatabaseRowCount,
    batchInsertDatabaseRows,
    rebuildDatabaseRowsFts,
    close
  }
}
