/**
 * In-memory bundle sink/source — the reference implementation used by
 * tests, and by the browser to assemble a bundle before zipping/download.
 */

import type { BundleSink, BundleSource } from './types'
import { decodeUtf8 } from './serialize'

export class MemoryBundleSink implements BundleSink {
  readonly entries = new Map<string, Uint8Array>()

  writeEntry(path: string, data: Uint8Array): void {
    this.entries.set(path, data)
  }

  toSource(): MemoryBundleSource {
    return new MemoryBundleSource(this.entries)
  }
}

export class MemoryBundleSource implements BundleSource {
  constructor(private readonly entries: ReadonlyMap<string, Uint8Array>) {}

  async readEntry(path: string): Promise<Uint8Array | null> {
    return this.entries.get(path) ?? null
  }

  async *readLines(path: string): AsyncIterable<string> {
    const bytes = this.entries.get(path)
    if (!bytes) return
    let start = 0
    const text = decodeUtf8(bytes)
    while (start < text.length) {
      let end = text.indexOf('\n', start)
      if (end === -1) end = text.length
      const line = text.slice(start, end)
      if (line.length > 0) yield line
      start = end + 1
    }
  }

  async listEntries(prefix: string): Promise<string[]> {
    return [...this.entries.keys()].filter((p) => p.startsWith(prefix)).sort()
  }
}
