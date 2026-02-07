/**
 * @xnet/sqlite - SQL query building helpers
 */

/**
 * Build a parameterized INSERT statement.
 */
export function buildInsert(
  table: string,
  columns: string[],
  options?: { orReplace?: boolean; orIgnore?: boolean }
): { sql: string; placeholders: string } {
  const placeholders = columns.map(() => '?').join(', ')
  const columnList = columns.join(', ')

  let prefix = 'INSERT'
  if (options?.orReplace) prefix = 'INSERT OR REPLACE'
  if (options?.orIgnore) prefix = 'INSERT OR IGNORE'

  return {
    sql: `${prefix} INTO ${table} (${columnList}) VALUES (${placeholders})`,
    placeholders
  }
}

/**
 * Build a parameterized UPDATE statement.
 */
export function buildUpdate(table: string, columns: string[], whereColumns: string[]): string {
  const setClause = columns.map((c) => `${c} = ?`).join(', ')
  const whereClause = whereColumns.map((c) => `${c} = ?`).join(' AND ')

  return `UPDATE ${table} SET ${setClause} WHERE ${whereClause}`
}

/**
 * Build a parameterized SELECT statement with optional filters.
 */
export function buildSelect(
  table: string,
  columns: string[] = ['*'],
  options?: {
    where?: string[]
    orderBy?: string
    limit?: number
    offset?: number
  }
): string {
  let sql = `SELECT ${columns.join(', ')} FROM ${table}`

  if (options?.where && options.where.length > 0) {
    sql += ` WHERE ${options.where.map((c) => `${c} = ?`).join(' AND ')}`
  }

  if (options?.orderBy) {
    sql += ` ORDER BY ${options.orderBy}`
  }

  if (options?.limit !== undefined) {
    sql += ` LIMIT ${options.limit}`
  }

  if (options?.offset !== undefined) {
    sql += ` OFFSET ${options.offset}`
  }

  return sql
}

/**
 * Escape a string for use in LIKE patterns.
 */
export function escapeLike(value: string): string {
  return value.replace(/[%_\\]/g, '\\$&')
}

/**
 * Build a batch INSERT statement for multiple rows.
 */
export function buildBatchInsert(table: string, columns: string[], rowCount: number): string {
  const placeholders = columns.map(() => '?').join(', ')
  const valuesList = Array(rowCount).fill(`(${placeholders})`).join(', ')
  const columnList = columns.join(', ')

  return `INSERT INTO ${table} (${columnList}) VALUES ${valuesList}`
}
