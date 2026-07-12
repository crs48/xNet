/**
 * @xnetjs/sqlite - Unified SQLite schema for xNet
 */

/**
 * Current schema version.
 * Increment this when making schema changes.
 */
export const SCHEMA_VERSION = 8

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
    -- Grinding-resistant LWW final tiebreak key (exploration 0300): blake3 of
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
  2: `
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

CREATE INDEX IF NOT EXISTS idx_nodes_live_schema_updated
    ON nodes(schema_id, updated_at DESC, id)
    WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_nodes_all_schema_updated
    ON nodes(schema_id, updated_at DESC, id);
CREATE INDEX IF NOT EXISTS idx_nodes_live_schema_created
    ON nodes(schema_id, created_at DESC, id)
    WHERE deleted_at IS NULL;

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
`,

  3: `
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

CREATE INDEX IF NOT EXISTS idx_query_stats_schema_seen
    ON query_descriptor_stats(schema_id, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_query_indexes_schema_property
    ON query_index_candidates(schema_id, property_key, value_type);
`,

  4: `
ALTER TABLE query_index_candidates
    ADD COLUMN estimated_bytes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE query_index_candidates
    ADD COLUMN estimated_rows INTEGER NOT NULL DEFAULT 0;
`,

  5: `
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

CREATE INDEX IF NOT EXISTS idx_query_materializations_schema
    ON node_query_materializations(schema_id, invalidated_at);
CREATE INDEX IF NOT EXISTS idx_query_materialized_ids_node
    ON node_query_materialized_ids(node_id);
`,

  6: `
CREATE INDEX IF NOT EXISTS idx_prop_scalars_node
    ON node_property_scalars(node_id);
CREATE INDEX IF NOT EXISTS idx_changes_node_lamport
    ON changes(node_id, lamport_time DESC, hash);
`,

  7: `
ALTER TABLE node_query_materializations
    ADD COLUMN auth_fingerprint TEXT;
`
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
