/**
 * @xnet/hub - SQLite storage adapter.
 */

import type { BlobMeta, DocMeta, HubStorage, SearchOptions, SearchResult } from './interface'
import Database from 'better-sqlite3'
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

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
    properties_json TEXT DEFAULT '{}',
    created_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
  );
  CREATE INDEX IF NOT EXISTS idx_doc_meta_owner ON doc_meta(owner_did);
  CREATE INDEX IF NOT EXISTS idx_doc_meta_schema ON doc_meta(schema_iri);

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

type SearchRow = {
  doc_id: string
  title: string
  schema_iri: string
  snippet: string
  rank: number
}

export const createSQLiteStorage = (dataDir: string): HubStorage => {
  mkdirSync(dataDir, { recursive: true })
  mkdirSync(join(dataDir, 'blobs'), { recursive: true })

  const dbPath = join(dataDir, 'hub.db')
  const db = new Database(dbPath)

  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL')
  db.pragma('busy_timeout = 5000')

  db.exec(SCHEMA_SQL)

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
    insertBackup: db.prepare(`
      INSERT OR REPLACE INTO backups (key, doc_id, owner_did, size_bytes, content_type, blob_path, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `),
    getBackup: db.prepare('SELECT blob_path FROM backups WHERE key = ?'),
    listBackups: db.prepare('SELECT * FROM backups WHERE owner_did = ? ORDER BY created_at DESC'),
    deleteBackup: db.prepare('DELETE FROM backups WHERE key = ? RETURNING blob_path'),
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
    const blobPath = join(dataDir, 'blobs', key)
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

  const deleteBlob = async (key: string): Promise<void> => {
    const row = stmts.deleteBackup.get(key) as BackupRow
    if (row?.blob_path && existsSync(row.blob_path)) {
      unlinkSync(row.blob_path)
    }
  }

  const setDocMeta = async (docId: string, meta: DocMeta): Promise<void> => {
    stmts.upsertDocMeta.run(
      docId,
      meta.ownerDid,
      meta.schemaIri,
      meta.title,
      JSON.stringify(meta.properties ?? {}),
      meta.createdAt || Date.now(),
      meta.updatedAt || Date.now()
    )
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

  const close = async (): Promise<void> => {
    db.close()
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
    close
  }
}
