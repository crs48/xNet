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
 * Ordering: lamport time, then wall time, then — for changes at protocol
 * version ≥ 4 — a grinding-resistant tiebreak key, else the author DID.
 * All string comparisons are UTF-16 code units, NEVER `localeCompare` —
 * locale collation is non-deterministic across ICU versions and would break
 * CRDT convergence (see the `0004-tie-author-case-codeunit` golden vector).
 *
 * ## Grinding-resistant final tiebreak (exploration 0300)
 *
 * The pre-v4 final tiebreak was the raw `author` DID: "higher DID wins". Since
 * a `did:key` is a free, attacker-chosen function of a keypair, an attacker
 * could grind a vanity DID that sorts highest and win *every* concurrent-write
 * tie against every honest peer, permanently. The v4 rule replaces that with a
 * {@link computeLwwTiebreakKey} — `blake3(author ‖ property ‖ value)` — so the
 * winner of a tie is a random-oracle function of *what is being written*, not a
 * pre-computable property of identity. A ground identity is re-randomised per
 * (property, value), so it wins no durable, universal advantage. The rule is
 * gated on both stamps carrying a key (i.e. both changes are v4+); a v4-vs-v3
 * or v3-vs-v3 comparison falls back to the author DID so mixed fleets still
 * agree on the legacy vectors.
 */
import { blake3 } from '@noble/hashes/blake3.js'

/** Protocol version at which the grinding-resistant tiebreak key activates. */
export const LWW_TIEBREAK_KEY_VERSION = 4

const US = '\x1f' // ASCII unit separator — delimits key fields, cannot collide

/**
 * Recursively sort object keys for a canonical JSON representation — the same
 * discipline the change hash uses, so every kernel derives byte-identical
 * tiebreak keys.
 */
function canonicalize(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(canonicalize)
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    out[key] = canonicalize((value as Record<string, unknown>)[key])
  }
  return out
}

function toHex(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += b.toString(16).padStart(2, '0')
  return s
}

/**
 * The grinding-resistant LWW final tiebreak key (exploration 0300):
 * `blake3_hex( author ‖ US ‖ propertyKey ‖ US ‖ canonicalJSON(value) )`.
 *
 * Portable by construction — a kernel in any language reproduces it from
 * canonical JSON of the value (which every kernel already computes for the
 * change hash). A deletion (`value === undefined`) canonicalises as `null`.
 */
export function computeLwwTiebreakKey(author: string, propertyKey: string, value: unknown): string {
  const canonical = JSON.stringify(canonicalize(value === undefined ? null : value))
  const bytes = new TextEncoder().encode(`${author}${US}${propertyKey}${US}${canonical}`)
  return toHex(blake3(bytes))
}

/** The timestamp every LWW comparison runs on. */
export interface LwwStamp {
  lamport: number
  wallTime: number
  author: string
  /**
   * Grinding-resistant tiebreak key ({@link computeLwwTiebreakKey}), present
   * only for changes at protocol version ≥ {@link LWW_TIEBREAK_KEY_VERSION}.
   * Absent (legacy) stamps fall back to the author-DID tiebreak.
   */
  tiebreakKey?: string
}

/**
 * Spec comparator (§L1.7): negative when `a` loses to `b`, positive when `a`
 * beats `b`, zero only for identical stamps.
 */
export function compareLwwStamps(a: LwwStamp, b: LwwStamp): number {
  if (a.lamport !== b.lamport) return a.lamport - b.lamport
  if (a.wallTime !== b.wallTime) return a.wallTime - b.wallTime
  // v4+ grinding-resistant rung: when both stamps carry a key, the larger key
  // wins outright (author is irrelevant). Falls through to author when either
  // key is absent (legacy change) or the keys are equal (same author+value).
  const aK = a.tiebreakKey
  const bK = b.tiebreakKey
  if (aK !== undefined && bK !== undefined && aK !== bK) {
    return aK < bK ? -1 : 1
  }
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
 * collation, which matches the code-unit rule for our ASCII DID/hex strings.
 *
 * When `tiebreakKeyColumn` is supplied, the final rung mirrors
 * {@link compareLwwStamps}: on a `lamport`+`wallTime` tie, if BOTH rows carry a
 * non-null tiebreak key the larger key wins outright (author irrelevant);
 * otherwise (either key null, or keys equal) the author DID decides. The stored
 * key is precomputed in application code ({@link computeLwwTiebreakKey}), so SQL
 * only ever compares the opaque hex — never recomputes it — keeping the JS and
 * SQL paths byte-identical without a user-defined function.
 */
export function lwwUpdateGuardSql(input: {
  table: string
  lamportColumn: string
  wallTimeColumn: string
  authorColumn: string
  tiebreakKeyColumn?: string
}): string {
  const { table, lamportColumn, wallTimeColumn, authorColumn, tiebreakKeyColumn } = input
  const finalRung = tiebreakKeyColumn
    ? `(excluded.${tiebreakKeyColumn} IS NOT NULL\n` +
      `                              AND ${table}.${tiebreakKeyColumn} IS NOT NULL\n` +
      `                              AND excluded.${tiebreakKeyColumn} > ${table}.${tiebreakKeyColumn})\n` +
      `                         OR (NOT (excluded.${tiebreakKeyColumn} IS NOT NULL\n` +
      `                                  AND ${table}.${tiebreakKeyColumn} IS NOT NULL\n` +
      `                                  AND excluded.${tiebreakKeyColumn} <> ${table}.${tiebreakKeyColumn})\n` +
      `                             AND excluded.${authorColumn} > ${table}.${authorColumn})`
    : `excluded.${authorColumn} > ${table}.${authorColumn}`
  return (
    `excluded.${lamportColumn} > ${table}.${lamportColumn}\n` +
    `            OR (excluded.${lamportColumn} = ${table}.${lamportColumn}\n` +
    `                AND (excluded.${wallTimeColumn} > ${table}.${wallTimeColumn}\n` +
    `                     OR (excluded.${wallTimeColumn} = ${table}.${wallTimeColumn}\n` +
    `                         AND (${finalRung}))))`
  )
}
