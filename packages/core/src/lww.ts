/**
 * The ONE Last-Write-Wins ordering for xNet (docs/specs/protocol §L1.7,
 * exploration 0276).
 *
 * Per-property conflict resolution and change-log application ordering were
 * previously re-implemented in three places (`NodeStore.applyChange`, the
 * SQLite adapter's ON CONFLICT guards, and the hub storages' change
 * ordering) — a drift class on the protocol's core convergence invariant.
 * Every implementation now derives from this module, and the golden-vector
 * conformance suite (exploration 0200) pins them equal.
 *
 * Ordering: lamport time, then wall time, then author DID compared by UTF-16
 * code units. NEVER `localeCompare` — locale collation is non-deterministic
 * across ICU versions and would break CRDT convergence (see the
 * `0004-tie-author-case-codeunit` golden vector).
 */

/** The timestamp triple every LWW comparison runs on. */
export interface LwwStamp {
  lamport: number
  wallTime: number
  author: string
}

/**
 * Spec comparator (§L1.7): negative when `a` loses to `b`, positive when `a`
 * beats `b`, zero only for identical stamps.
 */
export function compareLwwStamps(a: LwwStamp, b: LwwStamp): number {
  if (a.lamport !== b.lamport) return a.lamport - b.lamport
  if (a.wallTime !== b.wallTime) return a.wallTime - b.wallTime
  // UTF-16 code-unit order (not localeCompare) for deterministic convergence.
  return a.author < b.author ? -1 : a.author > b.author ? 1 : 0
}

/** Whether an incoming write replaces the existing one under LWW. */
export function lwwWins(incoming: LwwStamp, existing: LwwStamp): boolean {
  return compareLwwStamps(incoming, existing) > 0
}

/**
 * Deterministic application order for change logs: lamport time, then author
 * by code units. Used when replaying/relaying batches so every peer folds
 * changes in the same sequence (matches the hub's
 * `ORDER BY lamport_time ASC, lamport_author ASC`).
 */
export function compareChangeApplicationOrder(
  a: { lamport: number; author: string },
  b: { lamport: number; author: string }
): number {
  if (a.lamport !== b.lamport) return a.lamport - b.lamport
  return a.author < b.author ? -1 : a.author > b.author ? 1 : 0
}

/**
 * SQL `ON CONFLICT … DO UPDATE … WHERE` guard implementing {@link lwwWins}
 * inside SQLite (the `excluded.` pseudo-table is the incoming row). Column
 * text comparison (`>`) is byte order under SQLite's default BINARY
 * collation, which matches the code-unit rule for our ASCII DID strings.
 */
export function lwwUpdateGuardSql(input: {
  table: string
  lamportColumn: string
  wallTimeColumn: string
  authorColumn: string
}): string {
  const { table, lamportColumn, wallTimeColumn, authorColumn } = input
  return (
    `excluded.${lamportColumn} > ${table}.${lamportColumn}\n` +
    `            OR (excluded.${lamportColumn} = ${table}.${lamportColumn}\n` +
    `                AND (excluded.${wallTimeColumn} > ${table}.${wallTimeColumn}\n` +
    `                     OR (excluded.${wallTimeColumn} = ${table}.${wallTimeColumn}\n` +
    `                         AND excluded.${authorColumn} > ${table}.${authorColumn})))`
  )
}
