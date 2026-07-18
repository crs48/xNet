/**
 * SQL-text snapshot of the live database through the adapter's `query()`
 * surface (exploration 0344, Tier 2).
 *
 * The browser build cannot `VACUUM INTO` a file (OPFS + worker RPC), so the
 * portable snapshot is the classic dump: CREATE TABLE statements from
 * sqlite_master plus INSERTs, restorable with `sqlite3 new.db < dump.sql`.
 * Derived structures (indexes, FTS/shadow tables, sqlite_ internals) are
 * skipped — they rebuild from the DDL of the app that opens the dump.
 */

export type QueryFn = (sql: string) => Promise<Array<Record<string, unknown>>>

const INTERNAL_TABLE = /^sqlite_/i
/** FTS5 shadow tables (`x_fts`, `x_fts_data`, …) rebuild via `rebuild`. */
const FTS_TABLE = /_fts(_|$)/i

function quoteIdentifier(name: string): string {
  return `"${name.replace(/"/g, '""')}"`
}

export function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL'
  if (typeof value === 'bigint') return value.toString()
  if (typeof value === 'boolean') return value ? '1' : '0'
  if (value instanceof Uint8Array || ArrayBuffer.isView(value)) {
    const bytes = value instanceof Uint8Array ? value : new Uint8Array(value.buffer)
    let hex = ''
    for (const b of bytes) hex += b.toString(16).padStart(2, '0')
    return `X'${hex}'`
  }
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  return `'${text.replace(/'/g, "''")}'`
}

export async function buildSqlDump(query: QueryFn): Promise<string> {
  const lines: string[] = [
    `-- xNet SQLite snapshot (SQL text dump), ${new Date().toISOString()}`,
    '-- Restore with: sqlite3 restored.db < this-file.sql',
    '-- Derived structures (indexes, FTS shadow tables) are omitted; the app rebuilds them.',
    'PRAGMA foreign_keys=OFF;',
    'BEGIN TRANSACTION;'
  ]

  const tables = (await query(
    "SELECT name, sql FROM sqlite_master WHERE type = 'table' AND sql IS NOT NULL ORDER BY name"
  )) as Array<{ name: string; sql: string }>

  for (const table of tables) {
    if (INTERNAL_TABLE.test(table.name) || FTS_TABLE.test(table.name)) continue
    // Virtual tables (fts5 etc.) are skipped wholesale.
    if (/^\s*CREATE\s+VIRTUAL\s+TABLE/i.test(table.sql)) continue

    lines.push(`${table.sql.trim().replace(/;?$/, '')};`)
    const rows = await query(`SELECT * FROM ${quoteIdentifier(table.name)}`)
    for (const row of rows) {
      const columns = Object.keys(row)
      if (columns.length === 0) continue
      const columnSql = columns.map(quoteIdentifier).join(', ')
      const valueSql = columns.map((c) => sqlLiteral(row[c])).join(', ')
      lines.push(`INSERT INTO ${quoteIdentifier(table.name)} (${columnSql}) VALUES (${valueSql});`)
    }
  }

  lines.push('COMMIT;')
  return lines.join('\n') + '\n'
}
