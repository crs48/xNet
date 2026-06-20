import { describe, expect, it } from 'vitest'
import { measureDataUsage, type DataUsageFs } from './data-usage'

/** Build a fake fs from a flat map of path → { size, mtimeMs, dir? }. */
function fakeFs(
  tree: Record<string, { size?: number; mtimeMs?: number; dir?: boolean }>
): DataUsageFs {
  return {
    readdir(dir) {
      const prefix = dir.endsWith('/') ? dir : dir + '/'
      const names = new Set<string>()
      for (const p of Object.keys(tree)) {
        if (p.startsWith(prefix)) {
          const rest = p.slice(prefix.length)
          names.add(rest.split('/')[0])
        }
      }
      return [...names]
    },
    stat(path) {
      const node = tree[path]
      if (!node) throw new Error('ENOENT ' + path)
      return {
        isDirectory: () => Boolean(node.dir),
        isFile: () => !node.dir,
        size: node.size ?? 0,
        mtimeMs: node.mtimeMs ?? 0
      }
    }
  }
}

describe('measureDataUsage', () => {
  it('sums file bytes and reports the newest *.db mtime', () => {
    const fs = fakeFs({
      '/data/hub.db': { size: 4096, mtimeMs: 1000 },
      '/data/hub.db-wal': { size: 512, mtimeMs: 1500 },
      '/data/telemetry.db': { size: 2048, mtimeMs: 3000 },
      '/data/blobs': { dir: true },
      '/data/blobs/a.bin': { size: 100, mtimeMs: 500 }
    })
    const out = measureDataUsage('/data', fs)
    expect(out.usedBytes).toBe(4096 + 512 + 2048 + 100)
    // newest *.db mtime is telemetry.db at 3000 (wal isn't a .db; blob isn't a .db)
    expect(out.lastWriteMs).toBe(3000)
  })

  it('returns zero usage and null mtime for a missing/empty dir', () => {
    expect(measureDataUsage('/nope', fakeFs({}))).toEqual({ usedBytes: 0, lastWriteMs: null })
  })

  it('respects maxDepth (does not descend past the bound)', () => {
    const fs = fakeFs({
      '/d/a.db': { size: 10, mtimeMs: 1 },
      '/d/sub': { dir: true },
      '/d/sub/deep.bin': { size: 999, mtimeMs: 2 }
    })
    // maxDepth 0 → only top-level files counted, no descent into sub/
    expect(measureDataUsage('/d', fs, 0).usedBytes).toBe(10)
    expect(measureDataUsage('/d', fs, 1).usedBytes).toBe(10 + 999)
  })

  it('tolerates a file that stats with an error mid-walk', () => {
    const base = fakeFs({
      '/d/ok.db': { size: 5, mtimeMs: 7 },
      '/d/locked': { size: 1, mtimeMs: 0 }
    })
    const fs: DataUsageFs = {
      readdir: base.readdir,
      stat: (p) => {
        if (p.endsWith('locked')) throw new Error('EACCES')
        return base.stat(p)
      }
    }
    expect(measureDataUsage('/d', fs)).toEqual({ usedBytes: 5, lastWriteMs: 7 })
  })
})
