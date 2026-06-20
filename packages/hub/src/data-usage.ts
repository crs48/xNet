/**
 * Hub on-disk data usage for the cloud dashboard (exploration 0207).
 *
 * Measures the hub's data footprint (total bytes under the data dir) and the
 * newest `*.db` mtime — a "your data as of" signal. With continuous Litestream
 * replication (1s sync-interval) the R2 replica is at most ~1s behind this mtime,
 * so it doubles as "last backed up ≈". Surfaced on `GET /health` so the control
 * plane can render a storage bar + a last-backup line without an admin token.
 *
 * Pure over an injectable `fs` slice so it's unit-testable; never throws (a
 * missing/locked path just contributes nothing).
 */

import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

export interface DataUsage {
  usedBytes: number
  /** Newest *.db mtime in ms, or null if no db file was found. */
  lastWriteMs: number | null
}

export interface DataUsageFs {
  readdir(dir: string): string[]
  stat(path: string): { isDirectory(): boolean; isFile(): boolean; size: number; mtimeMs: number }
}

const realFs: DataUsageFs = {
  readdir: (d) => readdirSync(d),
  stat: (p) => statSync(p)
}

/** Sum file bytes under `dir` (bounded depth) + the newest `*.db` mtime. */
export function measureDataUsage(dir: string, fs: DataUsageFs = realFs, maxDepth = 3): DataUsage {
  let usedBytes = 0
  let lastWriteMs: number | null = null
  const walk = (d: string, depth: number): void => {
    let names: string[]
    try {
      names = fs.readdir(d)
    } catch {
      return
    }
    for (const name of names) {
      const p = join(d, name)
      let s: ReturnType<DataUsageFs['stat']>
      try {
        s = fs.stat(p)
      } catch {
        continue
      }
      if (s.isDirectory()) {
        if (depth < maxDepth) walk(p, depth + 1)
      } else if (s.isFile()) {
        usedBytes += s.size
        if (name.endsWith('.db') && (lastWriteMs === null || s.mtimeMs > lastWriteMs)) {
          lastWriteMs = s.mtimeMs
        }
      }
    }
  }
  walk(dir, 0)
  return { usedBytes, lastWriteMs }
}
