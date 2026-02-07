/**
 * @xnet/sqlite - Unified SQLite schema for xNet
 */

/**
 * Current schema version.
 * Increment this when making schema changes.
 */
export const SCHEMA_VERSION = 1

/**
 * Core SQLite schema for xNet (without FTS5).
 * This schema works on all platforms including sql.js.
 */
export const SCHEMA_DDL_CORE = `
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

-- Documents (for @xnet/storage compatibility)
CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    content BLOB NOT NULL,
    metadata TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1
);

-- Signed updates (for @xnet/storage compatibility)
CREATE TABLE IF NOT EXISTS updates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    doc_id TEXT NOT NULL,
    update_hash TEXT NOT NULL,
    update_data TEXT NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
    UNIQUE(doc_id, update_hash)
);

-- Snapshots (for @xnet/storage compatibility)
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
`

/**
 * FTS5 schema for full-text search.
 * This is applied separately because sql.js doesn't support FTS5.
 */
export const SCHEMA_DDL_FTS = `
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
`

/**
 * Unified SQLite schema for xNet.
 * This schema is shared across all platforms (with FTS5).
 * Use SCHEMA_DDL_CORE for platforms without FTS5 support (sql.js).
 */
export const SCHEMA_DDL = SCHEMA_DDL_CORE + SCHEMA_DDL_FTS

/**
 * Schema for future versions (migrations).
 * Each key is the version number, value is the upgrade SQL.
 */
export const SCHEMA_MIGRATIONS: Record<number, string> = {
  // Version 2 migrations would go here
  // 2: `ALTER TABLE nodes ADD COLUMN ...`
}

/**
 * Get the SQL to upgrade from one version to another.
 */
export function getMigrationSQL(fromVersion: number, toVersion: number): string {
  const statements: string[] = []

  for (let v = fromVersion + 1; v <= toVersion; v++) {
    const migration = SCHEMA_MIGRATIONS[v]
    if (migration) {
      statements.push(migration)
    }
  }

  return statements.join('\n')
}
