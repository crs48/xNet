/**
 * Instant-shell landing snapshot (exploration 0249, F2).
 *
 * The cold-open stall is that the FIRST query on a cold OPFS database faults its
 * working set synchronously on the single SQLite worker (~15 s in the capture),
 * so the landing surface can't paint until it finishes — even though the data is
 * local. A page-cache or mmap can't help the first read, and any query routed
 * through that one worker pays the same cold cost.
 *
 * This keeps a tiny, **localStorage-backed** snapshot of the last-N rows per
 * landing schema. localStorage is read synchronously on the main thread and is
 * NOT behind the cold SQLite worker, so the landing surface can paint from it in
 * well under a second while the worker warms up in the background. When the real
 * query resolves it overwrites the snapshot (write-through) so the next cold boot
 * shows the freshest data. The snapshot is intentionally minimal — just enough to
 * render a list row (id, title, updatedAt) — to stay small and cheap to parse.
 *
 * It is a cache, never a source of truth: a returning user may briefly see a
 * row that was deleted on another device since their last local session, until
 * the live query (and write-through) replaces it a beat later.
 */

/** The minimal fields a landing list row needs to render before live data. */
export interface LandingSnapshotRow {
  id: string
  title?: string
  updatedAt: number
}

interface SnapshotFile {
  /** When the snapshot was last written (ms epoch). */
  savedAt: number
  /** Rows keyed by a stable per-surface key (e.g. 'page', 'database'). */
  bySchema: Record<string, LandingSnapshotRow[]>
}

const STORAGE_KEY = 'xnet:landing-snapshot:v1'
/** Cap rows per key so the blob stays small and localStorage-quota-safe. */
const MAX_ROWS_PER_KEY = 50
/** Cap title length so one giant title can't bloat the blob. */
const MAX_TITLE_LEN = 200

// Read-through memo so repeated reads in a render don't re-parse the blob.
// `undefined` = not read yet; `null` = read, absent/invalid.
let memo: SnapshotFile | null | undefined

function hasStorage(): boolean {
  try {
    return typeof localStorage !== 'undefined'
  } catch {
    return false
  }
}

function isRow(value: unknown): value is LandingSnapshotRow {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as LandingSnapshotRow).id === 'string' &&
    typeof (value as LandingSnapshotRow).updatedAt === 'number'
  )
}

function parse(raw: string | null): SnapshotFile | null {
  if (!raw) return null
  try {
    const data = JSON.parse(raw) as SnapshotFile
    if (typeof data !== 'object' || data === null) return null
    const bySchema = data.bySchema
    if (typeof bySchema !== 'object' || bySchema === null) return null
    // Drop any malformed keys defensively rather than rejecting the whole blob.
    const clean: Record<string, LandingSnapshotRow[]> = {}
    for (const [key, rows] of Object.entries(bySchema)) {
      if (Array.isArray(rows)) clean[key] = rows.filter(isRow)
    }
    return { savedAt: typeof data.savedAt === 'number' ? data.savedAt : 0, bySchema: clean }
  } catch {
    return null
  }
}

function read(): SnapshotFile | null {
  if (memo !== undefined) return memo
  memo = hasStorage() ? parse(localStorage.getItem(STORAGE_KEY)) : null
  return memo
}

/**
 * The cached rows for a landing surface, or `null` when there is no usable
 * snapshot (first ever boot, evicted localStorage, or an empty list).
 */
export function readLandingRows(schemaKey: string): LandingSnapshotRow[] | null {
  const file = read()
  const rows = file?.bySchema[schemaKey]
  return Array.isArray(rows) && rows.length > 0 ? rows : null
}

/**
 * Write-through the latest rows for a surface. Strips each row to the minimal
 * render fields, caps the count, skips the write when nothing changed, and never
 * throws — a full localStorage or a serialization failure must not break the app.
 */
export function writeLandingRows(
  schemaKey: string,
  rows: ReadonlyArray<{ id: string; title?: string; updatedAt?: number }>
): void {
  if (!hasStorage()) return
  try {
    const compact: LandingSnapshotRow[] = rows.slice(0, MAX_ROWS_PER_KEY).map((row) => ({
      id: row.id,
      ...(row.title ? { title: String(row.title).slice(0, MAX_TITLE_LEN) } : {}),
      updatedAt: Number(row.updatedAt) || 0
    }))
    const current = read() ?? { savedAt: 0, bySchema: {} }
    // Cheap idempotence: skip the localStorage write if this key is unchanged.
    if (JSON.stringify(current.bySchema[schemaKey]) === JSON.stringify(compact)) return
    const next: SnapshotFile = {
      savedAt: Date.now(),
      bySchema: { ...current.bySchema, [schemaKey]: compact }
    }
    memo = next
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Quota exceeded / serialization error / no localStorage — best-effort only.
  }
}

/** Test-only: clear the in-memory memo (and optionally the stored blob). */
export function __resetLandingSnapshot(clearStorage = false): void {
  memo = undefined
  if (clearStorage && hasStorage()) {
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      // ignore
    }
  }
}
