/**
 * @xnetjs/sqlite - Bounded prepared-statement cache for the web adapter
 *
 * The oo1 `db.exec()` path re-parses SQL on every call. The hot path repeats a
 * small set of statements (node hydrate joins, property upserts, change-log
 * inserts), so an LRU of `sqlite3.oo1.Stmt` handles keyed by SQL text removes
 * the per-call prepare cost (exploration 0263; SQLocal's batch API proved the
 * pattern for browser SQLite).
 *
 * Correctness constraint that shapes the API: `db.prepare()` silently compiles
 * only the FIRST statement of a multi-statement string, while `db.exec()` runs
 * them all. Callers must route any SQL with an interior semicolon around the
 * cache — {@link hasInteriorSemicolon} is the (deliberately conservative)
 * guard. A semicolon inside a string literal false-positives to the slower
 * exec path, which is safe.
 */

/** The subset of `sqlite3.oo1.Stmt` the cache needs to manage a handle. */
export interface FinalizableStmt {
  finalize(): unknown
}

/** Default handle capacity — statements beyond this evict least-recently-used. */
export const DEFAULT_STMT_CACHE_CAPACITY = 64

/**
 * True when `sql` contains a semicolon that is not merely trailing — i.e. it
 * *may* hold multiple statements and MUST NOT be served from a prepared
 * statement. Trailing semicolons/whitespace are fine (single statement).
 */
export function hasInteriorSemicolon(sql: string): boolean {
  const trimmed = sql.replace(/[\s;]+$/, '')
  return trimmed.includes(';')
}

/**
 * Bounded LRU of prepared statements keyed by exact SQL text. Evicted and
 * cleared entries are finalized so the underlying C handles are released —
 * leaked handles pin database resources past `close()`.
 */
export class StmtCache<S extends FinalizableStmt> {
  private readonly entries = new Map<string, S>()

  constructor(private readonly capacity: number = DEFAULT_STMT_CACHE_CAPACITY) {
    if (capacity < 1) {
      throw new Error('StmtCache capacity must be >= 1')
    }
  }

  get size(): number {
    return this.entries.size
  }

  /** Look up a cached statement, refreshing its recency. */
  get(sql: string): S | undefined {
    const stmt = this.entries.get(sql)
    if (stmt !== undefined) {
      // Map preserves insertion order; delete+set moves the key to the tail
      // (most recently used) so eviction below always takes the head.
      this.entries.delete(sql)
      this.entries.set(sql, stmt)
    }
    return stmt
  }

  /** Insert a statement, finalizing the least-recently-used one if over capacity. */
  set(sql: string, stmt: S): void {
    const existing = this.entries.get(sql)
    if (existing !== undefined && existing !== stmt) {
      this.safeFinalize(existing)
    }
    this.entries.delete(sql)
    this.entries.set(sql, stmt)

    while (this.entries.size > this.capacity) {
      const oldest = this.entries.keys().next().value as string
      const evicted = this.entries.get(oldest)
      this.entries.delete(oldest)
      if (evicted !== undefined) {
        this.safeFinalize(evicted)
      }
    }
  }

  /**
   * Finalize and drop every cached statement. Called on DDL (`exec`) — where a
   * dropped table would otherwise leave poisoned handles — and on `close()`.
   */
  clear(): void {
    for (const stmt of this.entries.values()) {
      this.safeFinalize(stmt)
    }
    this.entries.clear()
  }

  /** finalize() must never throw into a caller that is already unwinding. */
  private safeFinalize(stmt: S): void {
    try {
      stmt.finalize()
    } catch {
      // A statement whose table was dropped can throw on finalize; the handle
      // is gone either way.
    }
  }
}
