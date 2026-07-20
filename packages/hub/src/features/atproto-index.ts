/**
 * @xnetjs/hub - The atproto index engine (explorations 0374/0382/0383 W3).
 *
 * The index role's engine: enumerate the adopted public collections
 * (`site.standard.*` — 0372's adopt-don't-mint rule), fetch the records, and
 * serve a derived, deterministic snapshot. Three properties are load-bearing:
 *
 * - **Derived-only.** The index holds no authoritative state: its entire
 *   dataset rebuilds from public inputs, so restart-from-source IS the
 *   disaster recovery (Bobbin's model, 0381). The role refuses to start on a
 *   data dir holding tenant state — derived and authoritative state never
 *   share a directory (`assertDerivedOnlyDataDir`).
 * - **Deterministic.** The snapshot artifact contains no wall-clock and is
 *   sorted by URI, so two rebuilds from the same inputs are byte-identical —
 *   0374's "a stranger rebuilds and diffs to zero" receipt, enforceable in CI
 *   as an ordinary test.
 * - **Not the legacy stack.** This engine never touches `search_index` or the
 *   shard tables (0367 documented their defects); its only artifacts carry the
 *   `idx_` prefix (0383 W2's table discipline, applied to files).
 *
 * The network is injected (`IndexSource`), so tests run on fixtures and the
 * default source speaks `com.atproto.sync.listReposByCollection` +
 * `com.atproto.repo.listRecords` exactly as 0372 measured them.
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import type { HubFeature } from './types'

/** The adopted collections (0372). Adding one is a one-line change — the point. */
export const DEFAULT_INDEX_COLLECTIONS = [
  'site.standard.publication',
  'site.standard.document'
] as const

/** One indexed record. The artifact's row type — changing it is a break. */
export interface IndexEntry {
  uri: string
  cid: string
  did: string
  collection: string
  /** The record's own claimed fields we surface (title/name, path, publishedAt…). */
  value: Record<string, unknown>
}

/** The canonical, deterministic artifact: NO wall-clock, sorted by URI. */
export interface IndexSnapshot {
  collections: string[]
  entries: IndexEntry[]
}

/** Injected network surface; the default impl speaks atproto, tests use fixtures. */
export interface IndexSource {
  /** DIDs holding at least one record in `collection` (relay enumeration). */
  listRepos(collection: string): Promise<string[]>
  /** Records in `collection` for one DID. */
  listRecords(did: string, collection: string): Promise<Array<Omit<IndexEntry, 'collection'>>>
}

export interface AtprotoIndexConfig {
  enabled: boolean
  /**
   * Refuse to start on a data dir holding tenant (authoritative) state.
   * Default true — turning it off is for tests only.
   */
  derivedOnly?: boolean
  collections?: string[]
  /** Rebuild from source at startup (the Bobbin model). Default true. */
  rebuildOnStart?: boolean
  /** Injected source (fixtures in tests); default speaks atproto over fetch. */
  source?: IndexSource
  /** Relay for enumeration (default: relay1.us-west.bsky.network, 0372). */
  relayUrl?: string
  fetchImpl?: typeof fetch
}

const SENTINEL = 'idx_role.json'

/**
 * The derived-only startup guard (0383 W3). A data dir is claimed for the
 * index role by a sentinel file; an existing `hub.db` WITHOUT the sentinel is
 * tenant state and boot must refuse rather than mingle derived rows with an
 * authoritative log.
 */
export function assertDerivedOnlyDataDir(dataDir: string): void {
  const sentinel = join(dataDir, SENTINEL)
  if (existsSync(sentinel)) return
  if (existsSync(join(dataDir, 'hub.db'))) {
    throw new Error(
      `[atproto-index] refusing to start: ${dataDir} contains tenant state (hub.db) ` +
        `and no ${SENTINEL} claim. The index role holds DERIVED state only — point it ` +
        `at a fresh data dir (0383 W3; derived and authoritative state never share a file).`
    )
  }
  mkdirSync(dataDir, { recursive: true })
  writeFileSync(sentinel, JSON.stringify({ role: 'index', claimedAt: Date.now() }, null, 2))
}

/** Default source: the 0372-measured endpoints, resolution via plc.directory. */
export function httpIndexSource(
  relayUrl = 'https://relay1.us-west.bsky.network',
  fetchImpl: typeof fetch = fetch
): IndexSource {
  const pdsCache = new Map<string, string>()

  const pdsFor = async (did: string): Promise<string | null> => {
    const cached = pdsCache.get(did)
    if (cached) return cached
    const res = await fetchImpl(`https://plc.directory/${did}`)
    if (!res.ok) return null
    const doc = (await res.json()) as {
      service?: Array<{ id: string; serviceEndpoint: string }>
    }
    const pds = doc.service?.find((s) => s.id === '#atproto_pds')?.serviceEndpoint
    if (pds) pdsCache.set(did, pds)
    return pds ?? null
  }

  return {
    async listRepos(collection) {
      const dids: string[] = []
      let cursor: string | undefined
      do {
        const url = new URL(`${relayUrl}/xrpc/com.atproto.sync.listReposByCollection`)
        url.searchParams.set('collection', collection)
        url.searchParams.set('limit', '2000')
        if (cursor) url.searchParams.set('cursor', cursor)
        const res = await fetchImpl(url)
        if (!res.ok) break
        const body = (await res.json()) as { repos: Array<{ did: string }>; cursor?: string }
        dids.push(...body.repos.map((r) => r.did))
        cursor = body.cursor
      } while (cursor)
      return dids
    },
    async listRecords(did, collection) {
      const pds = await pdsFor(did)
      if (!pds) return []
      const out: Array<Omit<IndexEntry, 'collection'>> = []
      let cursor: string | undefined
      do {
        const url = new URL(`${pds}/xrpc/com.atproto.repo.listRecords`)
        url.searchParams.set('repo', did)
        url.searchParams.set('collection', collection)
        url.searchParams.set('limit', '100')
        if (cursor) url.searchParams.set('cursor', cursor)
        const res = await fetchImpl(url)
        if (!res.ok) break
        const body = (await res.json()) as {
          records: Array<{ uri: string; cid: string; value: Record<string, unknown> }>
          cursor?: string
        }
        out.push(...body.records.map((r) => ({ uri: r.uri, cid: r.cid, did, value: r.value })))
        cursor = body.cursor
      } while (cursor)
      return out
    }
  }
}

export class AtprotoIndexService {
  private entries = new Map<string, IndexEntry>()
  private lastRebuildAt: number | null = null
  private readonly collections: string[]
  private readonly source: IndexSource

  constructor(
    private readonly dataDir: string,
    config: AtprotoIndexConfig
  ) {
    this.collections = config.collections ?? [...DEFAULT_INDEX_COLLECTIONS]
    this.source = config.source ?? httpIndexSource(config.relayUrl, config.fetchImpl)
  }

  /**
   * Rebuild the whole dataset from source. Records are validated minimally
   * (0367 E22: production records ARE malformed — quarantine, never crash):
   * a record without a string uri/cid/did is counted and dropped.
   */
  async rebuild(): Promise<{ entries: number; quarantined: number }> {
    const next = new Map<string, IndexEntry>()
    let quarantined = 0
    for (const collection of this.collections) {
      const dids = await this.source.listRepos(collection)
      for (const did of dids) {
        for (const record of await this.source.listRecords(did, collection)) {
          if (
            typeof record.uri !== 'string' ||
            typeof record.cid !== 'string' ||
            typeof record.did !== 'string' ||
            record.value === null ||
            typeof record.value !== 'object'
          ) {
            quarantined++
            continue
          }
          next.set(record.uri, { ...record, collection })
        }
      }
    }
    this.entries = next
    this.lastRebuildAt = Date.now()
    this.persist()
    return { entries: next.size, quarantined }
  }

  /** The canonical artifact: sorted, wall-clock-free, byte-stable. */
  snapshot(): IndexSnapshot {
    return {
      collections: [...this.collections].sort(),
      entries: [...this.entries.values()].sort((a, b) => (a.uri < b.uri ? -1 : 1))
    }
  }

  status(): { entries: number; collections: string[]; lastRebuildAt: number | null } {
    return {
      entries: this.entries.size,
      collections: [...this.collections],
      lastRebuildAt: this.lastRebuildAt
    }
  }

  /** Persist the canonical artifact (an `idx_` file — the W2 discipline). */
  private persist(): void {
    mkdirSync(this.dataDir, { recursive: true })
    writeFileSync(join(this.dataDir, 'idx_snapshot.json'), JSON.stringify(this.snapshot()))
  }

  /** Load a previously persisted artifact (serving continuity across boots). */
  loadPersisted(): boolean {
    const path = join(this.dataDir, 'idx_snapshot.json')
    if (!existsSync(path)) return false
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as IndexSnapshot
    this.entries = new Map(parsed.entries.map((e) => [e.uri, e]))
    return true
  }
}

/**
 * The index role's engine as a feature module. Routes are read-only and
 * unauthenticated (the index is a public good — 0366: reads free, forever);
 * rebuild is a loop owned by the registry.
 */
export function atprotoIndexFeature(dataDir: string, config: AtprotoIndexConfig): HubFeature {
  const service = new AtprotoIndexService(dataDir, config)

  return {
    id: 'fyi.xnet.hub.atproto-index',
    services: () => ({ service }),
    mount: ({ app }) => {
      app.get('/index/status', (c) => c.json(service.status()))
      app.get('/index/snapshot', (c) => c.json(service.snapshot()))
    },
    loops:
      config.rebuildOnStart !== false
        ? [
            {
              id: 'rebuild-from-source',
              start: async () => {
                service.loadPersisted()
                await service.rebuild()
              },
              stop: () => {}
            }
          ]
        : []
  }
}
