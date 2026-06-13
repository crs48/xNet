/**
 * @xnetjs/hub - Litestream-aware SQLite pragmas.
 *
 * When the managed fleet runs the hub under Litestream (replicating the SQLite WAL
 * to R2 — exploration 0178), SQLite must NOT autocheckpoint: Litestream holds a long
 * read transaction to control checkpointing, and a competing autocheckpoint silently
 * drops WAL frames. Self-host (no `LITESTREAM` env) keeps SQLite's default behavior so
 * the WAL stays bounded without Litestream. Pure + unit-testable.
 */

/** Extra pragmas to apply when Litestream owns checkpointing; `[]` otherwise. */
export function litestreamWalPragmas(env: NodeJS.ProcessEnv = process.env): string[] {
  return env.LITESTREAM === '1' ? ['wal_autocheckpoint = 0'] : []
}
