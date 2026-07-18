/**
 * SQL text snapshot (exploration 0344, Tier 2).
 */
import { describe, expect, it } from 'vitest'
import { buildSqlDump, sqlLiteral, type QueryFn } from './sql-dump'

describe('sqlLiteral', () => {
  it('encodes scalars, blobs, and strings safely', () => {
    expect(sqlLiteral(null)).toBe('NULL')
    expect(sqlLiteral(42)).toBe('42')
    expect(sqlLiteral(true)).toBe('1')
    expect(sqlLiteral("O'Brien")).toBe("'O''Brien'")
    expect(sqlLiteral(new Uint8Array([0xde, 0xad, 0x01]))).toBe("X'dead01'")
  })
})

describe('buildSqlDump', () => {
  const fakeDb: Record<string, Array<Record<string, unknown>>> = {
    sqlite_master: [
      { name: 'nodes', sql: 'CREATE TABLE nodes (id TEXT PRIMARY KEY, title TEXT)' },
      { name: 'nodes_fts', sql: 'CREATE VIRTUAL TABLE nodes_fts USING fts5(title)' },
      { name: 'nodes_fts_data', sql: 'CREATE TABLE nodes_fts_data (block BLOB)' },
      { name: 'sqlite_sequence', sql: 'CREATE TABLE sqlite_sequence (name, seq)' }
    ],
    nodes: [
      { id: 'n1', title: "It's here" },
      { id: 'n2', title: null }
    ]
  }
  const query: QueryFn = async (sql) => {
    if (sql.includes('sqlite_master')) return fakeDb.sqlite_master
    const match = /FROM "(\w+)"/.exec(sql)
    return fakeDb[match?.[1] ?? ''] ?? []
  }

  it('dumps real tables and skips FTS/shadow/internal tables', async () => {
    const dump = await buildSqlDump(query)
    expect(dump).toContain('CREATE TABLE nodes (id TEXT PRIMARY KEY, title TEXT);')
    expect(dump).toContain(`INSERT INTO "nodes" ("id", "title") VALUES ('n1', 'It''s here');`)
    expect(dump).toContain(`VALUES ('n2', NULL);`)
    expect(dump).not.toContain('nodes_fts')
    expect(dump).not.toContain('sqlite_sequence')
    expect(dump.trim().endsWith('COMMIT;')).toBe(true)
  })
})
