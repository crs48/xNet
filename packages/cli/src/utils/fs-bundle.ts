/**
 * Filesystem-backed `.xnetpack` bundle sink/source (exploration 0344).
 *
 * A bundle on disk is a plain directory using the layout from
 * `@xnetjs/data/portability` — `manifest.json`, `changes.ndjson`,
 * `blobs/<algo>/<hex>`, `yjs/docs.ndjson` — so it rsyncs, diffs, and
 * inspects with ordinary tools.
 */
import type { BundleSink, BundleSource } from '@xnetjs/data'
import { createReadStream } from 'node:fs'
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { dirname, join, relative, sep } from 'node:path'
import { createInterface } from 'node:readline'

export class FsBundleSink implements BundleSink {
  constructor(private readonly root: string) {}

  async writeEntry(path: string, data: Uint8Array): Promise<void> {
    const target = join(this.root, path)
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, data)
  }
}

export class FsBundleSource implements BundleSource {
  constructor(private readonly root: string) {}

  async readEntry(path: string): Promise<Uint8Array | null> {
    try {
      return new Uint8Array(await readFile(join(this.root, path)))
    } catch {
      return null
    }
  }

  async *readLines(path: string): AsyncIterable<string> {
    const target = join(this.root, path)
    try {
      await stat(target)
    } catch {
      return
    }
    const rl = createInterface({ input: createReadStream(target), crlfDelay: Infinity })
    for await (const line of rl) {
      if (line.length > 0) yield line
    }
  }

  async listEntries(prefix: string): Promise<string[]> {
    const results: string[] = []
    const walk = async (dir: string): Promise<void> => {
      let entries
      try {
        entries = await readdir(dir, { withFileTypes: true })
      } catch {
        return
      }
      for (const entry of entries) {
        const full = join(dir, entry.name)
        if (entry.isDirectory()) await walk(full)
        else {
          const rel = relative(this.root, full).split(sep).join('/')
          if (rel.startsWith(prefix)) results.push(rel)
        }
      }
    }
    await walk(this.root)
    return results.sort()
  }
}
