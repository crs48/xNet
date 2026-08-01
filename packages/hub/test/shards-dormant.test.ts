/**
 * The shard ring is DORMANT (exploration 0423).
 *
 * `ShardRegistry` / `ShardIngestRouter` / `ShardQueryRouter` / `ShardRebalancer`
 * are complete and tested, and nothing can turn them on: there are no `SHARD_*`
 * environment variables and `resolveConfig` never populates `config.shards`.
 * 0381 found that state and read it as an oversight; it is a decision (0367 on
 * the legacy search stack, 0381 on warm-tier margin, 0374/0383 on the ATProto
 * index plane replacing it).
 *
 * This file is the decidable pass condition for that decision. It fails if the
 * ring quietly acquires a configuration surface — which is how "unreachable
 * scaffolding" becomes "a second search architecture nobody chose".
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveConfig } from '../src/config'
import { HUB_ROLES } from '../src/roles'

const SRC = join(__dirname, '..', 'src')

describe('shard ring dormancy', () => {
  it('resolveConfig leaves config.shards unset', () => {
    expect(resolveConfig({}).shards).toBeUndefined()
  })

  it('no SHARD_* environment variable is read anywhere in the hub', () => {
    // A grep, deliberately: the claim is about the whole package's surface, not
    // one function's return value.
    const offenders: string[] = []
    const walk = (dir: string): void => {
      for (const entry of readdirSyncSafe(dir)) {
        const path = join(dir, entry)
        if (isDir(path)) {
          walk(path)
          continue
        }
        if (!entry.endsWith('.ts')) continue
        const text = readFileSync(path, 'utf8')
        if (/process\.env\.SHARD_|env\[['"]SHARD_/.test(text)) offenders.push(path)
      }
    }
    walk(SRC)
    expect(offenders).toEqual([])
  })

  it('the index role explicitly turns shards off', () => {
    expect(HUB_ROLES.index.shards).toEqual({ enabled: false })
  })

  it('the registry role is the only preset that owns the ring', () => {
    const owners = Object.entries(HUB_ROLES)
      .filter(([, preset]) => preset.shards?.enabled === true)
      .map(([name]) => name)
    expect(owners).toEqual(['registry'])
  })
})

// Tiny local fs helpers so the walk above stays readable.
function readdirSyncSafe(dir: string): string[] {
  try {
    return readdirSync(dir)
  } catch {
    return []
  }
}
function isDir(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}
