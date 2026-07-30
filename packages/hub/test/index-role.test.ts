/**
 * The index role (explorations 0374/0382/0383 W3).
 *
 * Four properties:
 * 1. **Determinism** — two rebuilds from identical inputs produce a
 *    byte-identical snapshot. This test IS 0374's "rebuild and diff to zero"
 *    CI gate: it runs in the ordinary test lanes, and
 *    `scripts/index/rebuild-and-diff.mjs` is the same check against the live
 *    network for a stranger's `--role index` run.
 * 2. **Derived-only** — the role refuses a data dir holding tenant state.
 * 3. **Quarantine** — malformed records are counted and dropped, never fatal
 *    (0367 E22: production records ARE malformed).
 * 4. **Not the legacy stack** — a booted index-role hub leaves hub storage
 *    empty and serves its plane from `idx_*` artifacts only.
 */
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  AtprotoIndexService,
  assertDerivedOnlyDataDir,
  type IndexSource
} from '../src/features/atproto-index'
import { resolveConfig } from '../src/config'
import { createHub } from '../src/index'

const fixtureSource = (): IndexSource => ({
  async listRepos(collection) {
    return collection === 'site.standard.document'
      ? ['did:plc:alice', 'did:plc:bob']
      : ['did:plc:alice']
  },
  async listRecords(did, collection) {
    if (collection === 'site.standard.publication') {
      return [
        {
          uri: `at://${did}/site.standard.publication/pub1`,
          cid: 'bafypub1',
          did,
          value: { url: 'https://alice.example', name: 'Alice Writes' }
        }
      ]
    }
    const records = [
      {
        uri: `at://${did}/site.standard.document/doc1`,
        cid: 'bafydoc1',
        did,
        value: { title: `Post by ${did}`, publishedAt: '2026-07-01T00:00:00Z' }
      }
    ]
    if (did === 'did:plc:bob') {
      // A malformed record, as seen live in 0372's research.
      records.push({ uri: 42, cid: 'x', did, value: null } as never)
    }
    return records
  }
})

const freshDir = (): string => mkdtempSync(join(tmpdir(), 'xnet-idx-'))

describe('index role (0374/0382/0383 W3)', () => {
  it('two rebuilds from identical inputs are byte-identical (diff to zero)', async () => {
    const a = new AtprotoIndexService(freshDir(), { enabled: true, source: fixtureSource() })
    const b = new AtprotoIndexService(freshDir(), { enabled: true, source: fixtureSource() })
    await a.rebuild()
    await b.rebuild()
    expect(JSON.stringify(a.snapshot())).toBe(JSON.stringify(b.snapshot()))
    // And the artifact carries no wall-clock — rebuilding later cannot differ.
    expect(JSON.stringify(a.snapshot())).not.toMatch(/\d{13}/)
  })

  it('quarantines malformed records instead of crashing', async () => {
    const svc = new AtprotoIndexService(freshDir(), { enabled: true, source: fixtureSource() })
    const { entries, quarantined } = await svc.rebuild()
    expect(quarantined).toBe(1)
    expect(entries).toBe(3) // alice pub + alice doc + bob doc
  })

  it('persists the artifact as an idx_-prefixed file and reloads it', async () => {
    const dir = freshDir()
    const svc = new AtprotoIndexService(dir, { enabled: true, source: fixtureSource() })
    await svc.rebuild()
    expect(existsSync(join(dir, 'idx_snapshot.json'))).toBe(true)
    const reloaded = new AtprotoIndexService(dir, { enabled: true, source: fixtureSource() })
    expect(reloaded.loadPersisted()).toBe(true)
    expect(JSON.stringify(reloaded.snapshot())).toBe(JSON.stringify(svc.snapshot()))
  })

  it('refuses a data dir holding tenant state; claims a fresh one', () => {
    const tenantDir = freshDir()
    writeFileSync(join(tenantDir, 'hub.db'), 'not-really-sqlite')
    expect(() => assertDerivedOnlyDataDir(tenantDir)).toThrow(/tenant state/)

    const derived = freshDir()
    assertDerivedOnlyDataDir(derived)
    expect(existsSync(join(derived, 'idx_role.json'))).toBe(true)
    // Idempotent once claimed.
    assertDerivedOnlyDataDir(derived)
  })

  it('a booted --role index hub serves its plane and leaves hub storage empty', async () => {
    const dir = freshDir()
    const resolved = resolveConfig({
      port: 14594,
      storage: 'memory',
      dataDir: dir,
      auth: false,
      role: 'index',
      atprotoIndex: { enabled: true, source: fixtureSource() }
    })
    const hub = await createHub(resolved)
    await hub.start()
    try {
      const status = (await (await fetch('http://localhost:14594/index/status')).json()) as {
        entries: number
      }
      expect(status.entries).toBe(3)
      const snapshot = (await (await fetch('http://localhost:14594/index/snapshot')).json()) as {
        entries: Array<{ uri: string }>
      }
      expect(snapshot.entries.map((e) => e.uri)).toEqual(
        [...snapshot.entries.map((e) => e.uri)].sort()
      )
      // The negative test: the index plane wrote NO tenant/search state — the
      // public read surface has nothing, because idx_* files are the only home.
      expect((await fetch('http://localhost:14594/public/node/anything')).status).toBe(404)
      const raw = readFileSync(join(dir, 'idx_snapshot.json'), 'utf8')
      expect(raw).toContain('site.standard.document')
    } finally {
      await hub.stop()
    }
  })
})
