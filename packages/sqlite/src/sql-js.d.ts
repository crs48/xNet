/**
 * Type declarations for sql.js
 */
declare module 'sql.js' {
  interface SqlJsDatabase {
    exec(sql: string, params?: unknown[]): Array<{ columns: string[]; values: unknown[][] }>
    run(sql: string, params?: unknown[]): void
    prepare(sql: string): SqlJsStatement
    close(): void
    getRowsModified(): number
  }

  interface SqlJsStatement {
    bind(params?: unknown[]): boolean
    step(): boolean
    getAsObject(): Record<string, unknown>
    reset(): void
    free(): void
    run(params?: unknown[]): void
  }

  interface SqlJsStatic {
    Database: new (data?: ArrayLike<number>) => SqlJsDatabase
  }

  interface InitOptions {
    locateFile?: (filename: string) => string
  }

  function initSqlJs(options?: InitOptions): Promise<SqlJsStatic>
  export default initSqlJs

  export type { SqlJsDatabase, SqlJsStatement, SqlJsStatic }
}
