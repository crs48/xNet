/**
 * Persisted warm-start query snapshots (exploration 0264, Wave 3).
 *
 * The 0263 read tier dies with the page: every reload boots to a spinner
 * until the first worker query lands — the recurring cold-open pain of
 * explorations 0249→0260. This module persists the loaded landing queries
 * (the WorkingSetPrewarm working set) at idle and re-seeds them on the next
 * boot as STALE cache entries, so the first paint renders yesterday's rows
 * while the live query revalidates. Seeding stale IS the snapshot-vs-live
 * race (Notion's lesson: never cache-first — the live query always runs).
 *
 * Safety stamps: entries are keyed to the identity DID and storage schema
 * version — a different user or a migrated schema treats the snapshot as a
 * miss and clears it. Correctness never depends on the stamps: seeded
 * entries are stale-by-construction and always revalidate.
 */
import type { WarmStartQuerySnapshot } from '@xnetjs/data-bridge'
import { SCHEMA_VERSION } from '@xnetjs/sqlite'

const STORAGE_KEY = 'xnet:warm-start:v1'
/** Serialized budget — beyond this the snapshot is skipped, not truncated. */
const MAX_SERIALIZED_CHARS = 400_000

interface WarmStartFile {
  v: 1
  did: string
  schemaVersion: number
  savedAt: number
  entries: WarmStartQuerySnapshot[]
}

/** Load snapshots for `did`, discarding mismatched or unreadable files. */
export function loadWarmStartSnapshots(did: string): WarmStartQuerySnapshot[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const file = JSON.parse(raw) as Partial<WarmStartFile>
    if (
      file.v !== 1 ||
      file.did !== did ||
      file.schemaVersion !== SCHEMA_VERSION ||
      !Array.isArray(file.entries)
    ) {
      localStorage.removeItem(STORAGE_KEY)
      return []
    }
    return file.entries
  } catch {
    return []
  }
}

/** Persist the current loaded entries for the next boot. Never throws. */
export function saveWarmStartSnapshots(did: string, entries: WarmStartQuerySnapshot[]): boolean {
  try {
    if (entries.length === 0) return false
    const file: WarmStartFile = {
      v: 1,
      did,
      schemaVersion: SCHEMA_VERSION,
      savedAt: Date.now(),
      entries
    }
    const serialized = JSON.stringify(file)
    if (serialized.length > MAX_SERIALIZED_CHARS) {
      // Oversized working sets aren't worth localStorage churn — the live
      // query path handles them; log so the budget is observable.
      // eslint-disable-next-line no-console
      console.info('[xNet] warm-start snapshot skipped (over budget)', {
        chars: serialized.length
      })
      return false
    }
    localStorage.setItem(STORAGE_KEY, serialized)
    return true
  } catch {
    return false
  }
}

/** Drop persisted snapshots (identity switch / storage reset). */
export function clearWarmStartSnapshots(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // storage unavailable — nothing to clear
  }
}
