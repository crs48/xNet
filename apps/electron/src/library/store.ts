import type { CaptureIntent } from './capture'
import type { GraphResource } from './graph'
import type {
  Capability,
  LibraryJob,
  LibraryResource,
  LibrarySearchResult,
  LibraryStatus,
  WorkState
} from './types'
import Database from 'better-sqlite3'
import { requireCompatibleDatabase } from '../storage/compatibility'
import { validateCapture } from './capture'
import { hashtagsIn } from './graph'
import { queueProvider } from './source'
import { CAPABILITIES, LIBRARY_PROVIDER_VERSION } from './types'

export const inspectLibraryDatabase = (path: string): void =>
  requireCompatibleDatabase(path, 'library')

type JobRow = {
  resource_id: string
  capability: Capability
  version: string
  language: string
  state: WorkState
  attempts: number
  next_at: number
  reason: string | null
}
const jobFor = (row: JobRow): LibraryJob => ({
  resourceId: row.resource_id,
  capability: row.capability,
  version: row.version,
  language: row.language,
  state: row.state,
  attempts: row.attempts,
  nextAt: row.next_at,
  reason: row.reason
})

const cardFor = (resource: LibraryResource): LibrarySearchResult => {
  const { transcript, metadata, notes, ...source } = resource
  void transcript
  void notes
  if (!metadata) return { ...source, sourceText: source.sourceText.slice(0, 600) }
  const { evidence, tracks, ...summary } = metadata
  void evidence
  void tracks
  return {
    ...source,
    sourceText: source.sourceText.slice(0, 600),
    metadata: { ...summary, description: summary.description?.slice(0, 600) }
  }
}

/** Device-local work queue; source facts and shared projections stay in NodeStore. */
export class LibraryStore {
  private db: Database.Database
  constructor(path: string) {
    inspectLibraryDatabase(path)
    this.db = new Database(path)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('synchronous = FULL')
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS resources(id TEXT PRIMARY KEY, url TEXT NOT NULL, platform TEXT NOT NULL, title TEXT NOT NULL, payload TEXT NOT NULL, added_at INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS resource_url ON resources(url);
      CREATE INDEX IF NOT EXISTS resource_added ON resources(added_at DESC,id);
      CREATE INDEX IF NOT EXISTS resource_platform_added ON resources(platform,added_at DESC,id);
      CREATE TABLE IF NOT EXISTS work(resource_id TEXT NOT NULL, capability TEXT NOT NULL, version TEXT NOT NULL, language TEXT NOT NULL, state TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, next_at INTEGER NOT NULL DEFAULT 0, reason TEXT, PRIMARY KEY(resource_id, capability, version, language));
      CREATE INDEX IF NOT EXISTS work_due ON work(state, next_at);
      CREATE INDEX IF NOT EXISTS work_pending_capability ON work(version,capability,next_at) WHERE state IN ('queued','retry');
      CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS provider_pause(platform TEXT PRIMARY KEY, until_ms INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS resource_providers(resource_id TEXT PRIMARY KEY, platform TEXT NOT NULL);
      INSERT OR IGNORE INTO resource_providers SELECT id,COALESCE(json_extract(payload,'$.networkPlatform'),platform) FROM resources;
      CREATE TABLE IF NOT EXISTS attempts(resource_id TEXT NOT NULL, capability TEXT NOT NULL, version TEXT NOT NULL, at_ms INTEGER NOT NULL, state TEXT NOT NULL, reason TEXT);
      CREATE VIRTUAL TABLE IF NOT EXISTS search USING fts5(resource_id UNINDEXED, title, body, start_ms UNINDEXED, tokenize='unicode61');
      CREATE TABLE IF NOT EXISTS search_rows(row_id INTEGER PRIMARY KEY, resource_id TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS search_rows_resource ON search_rows(resource_id);
      PRAGMA user_version = 1;
    `)
    // FTS's UNINDEXED resource_id otherwise scans every saved passage on each update.
    // Reconcile on open so an older app can still write this disposable search cache.
    this.db.transaction(() => {
      this.db.exec(`
        DELETE FROM search_rows WHERE row_id NOT IN (SELECT rowid FROM search);
        INSERT OR REPLACE INTO search_rows SELECT rowid,resource_id FROM search;
      `)
    })()
    if (!this.db.prepare("SELECT 1 FROM settings WHERE key='queue-hosts-v1'").get()) {
      this.db.transaction(() => {
        const update = this.db.prepare(
          'UPDATE resource_providers SET platform=? WHERE resource_id=?'
        )
        for (let offset = 0; ; offset += 500) {
          const rows = this.db
            .prepare('SELECT id,payload FROM resources ORDER BY id LIMIT 500 OFFSET ?')
            .all(offset) as { id: string; payload: string }[]
          for (const source of rows)
            update.run(queueProvider(JSON.parse(source.payload) as LibraryResource), source.id)
          if (rows.length < 500) break
        }
        this.db.prepare("INSERT INTO settings VALUES ('queue-hosts-v1','true')").run()
      })()
    }
    // A new provider version gets a complete, resumable pass over existing resources.
    // Retain older jobs as evidence; current successful work is never reset on restart.
    this.db.transaction(() => {
      // Preserve results from the newest compatible pass. Only newly supported
      // providers and unresolved captions need another attempt in desktop-4.
      for (const previous of [
        'desktop-3/youtube-page-1/instagram-embed-1/yt-dlp-2026.07.04',
        'desktop-2/youtube-page-1/yt-dlp-2026.07.04'
      ]) {
        const unchanged = previous.startsWith('desktop-3')
          ? "('youtube','instagram')"
          : "('youtube')"
        this.db
          .prepare(
            `
          INSERT OR IGNORE INTO work(resource_id,capability,version,language,state,attempts,next_at,reason)
          SELECT w.resource_id,w.capability,?,w.language,w.state,w.attempts,w.next_at,w.reason
          FROM work w JOIN resources r ON r.id=w.resource_id
          WHERE w.version=? AND (
            w.capability='index'
            OR (w.capability='metadata' AND r.platform IN ${unchanged})
            OR (w.capability='thumbnail' AND (w.state='complete' OR r.platform IN ${unchanged}))
            OR (w.capability='transcript' AND w.state='complete'))
        `
          )
          .run(LIBRARY_PROVIDER_VERSION, previous)
      }
      for (const capability of CAPABILITIES)
        this.db
          .prepare(
            "INSERT OR IGNORE INTO work(resource_id,capability,version,language,state) SELECT id,?,?,'preferred','queued' FROM resources"
          )
          .run(capability, LIBRARY_PROVIDER_VERSION)
    })()
    if (!this.db.prepare("SELECT 1 FROM settings WHERE key='page-text-v2'").get()) {
      this.db.transaction(() => {
        this.db
          .prepare(
            `UPDATE work SET state='queued',attempts=0,next_at=0,reason=NULL
          WHERE version=? AND capability='metadata' AND state IN ('partial','complete')
          AND resource_id IN (SELECT id FROM resources WHERE json_extract(payload,'$.metadata.provider') IN ('github-page/1','public-page/1'))`
          )
          .run(LIBRARY_PROVIDER_VERSION)
        this.db.prepare("INSERT INTO settings VALUES ('page-text-v2','true')").run()
      })()
    }
    this.db
      .prepare(
        "UPDATE work SET state = 'queued', attempts=MAX(0,attempts-1), reason = 'Interrupted; ready to resume' WHERE state = 'running'"
      )
      .run()
    this.db
      .prepare(
        `UPDATE work SET next_at=-1 WHERE version=?
      AND capability IN ('thumbnail','transcript') AND state='queued' AND next_at=0
      AND EXISTS (SELECT 1 FROM work m WHERE m.resource_id=work.resource_id
        AND m.version=work.version AND m.capability='metadata' AND m.state IN ('complete','partial'))`
      )
      .run(LIBRARY_PROVIDER_VERSION)
  }
  close(): void {
    if (this.db.open) this.db.close()
  }
  private readCapture(raw: string): CaptureIntent {
    const value = JSON.parse(raw) as CaptureIntent
    if (
      value.version !== 1 ||
      !value.authorDID ||
      !value.result?.pageId ||
      !value.result.resourceId ||
      !value.resource?.url ||
      typeof value.completed !== 'boolean' ||
      !Array.isArray(value.document) ||
      value.document.some((byte) => !Number.isInteger(byte) || byte < 0 || byte > 255)
    )
      throw new Error('Capture recovery record is unreadable; it was preserved.')
    validateCapture(value.input)
    return value
  }
  captureIntent(requestId: string): CaptureIntent | null {
    const row = this.db
      .prepare('SELECT value FROM settings WHERE key=?')
      .get(`capture:${requestId}`) as { value: string } | undefined
    return row ? this.readCapture(row.value) : null
  }
  pendingCaptures(): CaptureIntent[] {
    const rows = this.db.prepare("SELECT value FROM settings WHERE key LIKE 'capture:%'").all() as {
      value: string
    }[]
    return rows.map((row) => this.readCapture(row.value)).filter((intent) => !intent.completed)
  }
  saveCaptureIntent(intent: CaptureIntent): void {
    const value = JSON.stringify(intent)
    this.readCapture(value)
    this.db
      .prepare('INSERT OR REPLACE INTO settings(key,value) VALUES (?,?)')
      .run(`capture:${intent.input.requestId}`, value)
  }
  get paused(): boolean {
    return (
      (
        this.db.prepare("SELECT value FROM settings WHERE key='paused'").get() as
          | { value: string }
          | undefined
      )?.value !== 'false'
    )
  }
  setPaused(value: boolean): void {
    this.db.prepare("INSERT OR REPLACE INTO settings VALUES ('paused', ?)").run(String(value))
  }
  get(id: string): LibraryResource | null {
    const row = this.db.prepare('SELECT payload FROM resources WHERE id=?').get(id) as
      | { payload: string }
      | undefined
    return row ? (JSON.parse(row.payload) as LibraryResource) : null
  }
  byUrl(url: string): LibraryResource | null {
    const row = this.db.prepare('SELECT payload FROM resources WHERE url=? LIMIT 1').get(url) as
      | { payload: string }
      | undefined
    return row ? (JSON.parse(row.payload) as LibraryResource) : null
  }
  cards(ids: unknown): (LibrarySearchResult | null)[] {
    if (
      !Array.isArray(ids) ||
      ids.length > 100 ||
      ids.some((id) => typeof id !== 'string' || !id || id.length > 500)
    )
      throw new Error('Library cards require at most 100 valid resource IDs.')
    return ids.map((id: string) => {
      const resource = this.get(id)
      return resource ? cardFor(resource) : null
    })
  }
  graphResources(): GraphResource[] {
    // Read text only while extracting explicit hashtags; never send transcripts,
    // source bodies or provider evidence with the overview's compact nodes.
    const rows = this.db
      .prepare(
        `SELECT id,url,title,platform,
      COALESCE(json_extract(payload,'$.networkPlatform'),platform) AS provider,
      COALESCE(NULLIF(json_extract(payload,'$.metadata.author'),''),json_extract(payload,'$.actor'),'') AS author,
      COALESCE(json_extract(payload,'$.sourceText'),'') || char(10) ||
      COALESCE(json_extract(payload,'$.metadata.description'),'') AS body
      FROM resources WHERE lower(url) LIKE 'https://%' OR lower(url) LIKE 'http://%' ORDER BY id`
      )
      .iterate()
    return Array.from(rows, (value) => {
      const { body, ...resource } = value as Omit<GraphResource, 'hashtags'> & { body: string }
      return { ...resource, hashtags: hashtagsIn(body) }
    })
  }
  put(resource: LibraryResource): void {
    resource = { ...resource, networkPlatform: queueProvider(resource) }
    this.db.transaction(() => {
      this.db
        .prepare(
          'INSERT INTO resources VALUES (@id,@url,@platform,@title,@payload,@addedAt) ON CONFLICT(id) DO UPDATE SET url=excluded.url, platform=excluded.platform, title=excluded.title, payload=excluded.payload'
        )
        .run({
          ...resource,
          title: resource.metadata?.title || resource.title,
          payload: JSON.stringify(resource)
        })
      this.db
        .prepare(
          'INSERT INTO resource_providers VALUES (?,?) ON CONFLICT(resource_id) DO UPDATE SET platform=excluded.platform'
        )
        .run(resource.id, resource.networkPlatform)
    })()
  }
  seed(resource: LibraryResource): void {
    this.db.transaction(() => {
      const previous = this.get(resource.id)
      const next = previous
        ? {
            ...previous,
            ...resource,
            kind: resource.kind,
            metadata: previous.metadata,
            thumbnail: previous.thumbnail,
            transcript: previous.transcript,
            notes: previous.notes,
            addedAt: previous.addedAt
          }
        : resource
      if (!previous || JSON.stringify(previous) !== JSON.stringify(next)) this.put(next)
      if (
        !previous ||
        previous.sourceText !== resource.sourceText ||
        previous.title !== resource.title
      )
        this.index(this.get(resource.id)!)
      for (const capability of CAPABILITIES) this.enqueue(resource.id, capability)
      if (previous?.kind && !resource.kind)
        this.db
          .prepare(
            "UPDATE work SET state='queued',reason=NULL WHERE resource_id=? AND version=? AND capability!='index' AND state='not-applicable'"
          )
          .run(resource.id, LIBRARY_PROVIDER_VERSION)
      if (resource.kind)
        this.db
          .prepare(
            "UPDATE work SET state='not-applicable',reason='Text is imported locally; there is no public source to fetch.' WHERE resource_id=? AND version=? AND capability!='index'"
          )
          .run(resource.id, LIBRARY_PROVIDER_VERSION)
    })()
  }
  enqueue(id: string, capability: Capability, language = 'preferred'): void {
    this.db
      .prepare(
        "INSERT OR IGNORE INTO work(resource_id,capability,version,language,state) VALUES (?,?,?,?,'queued')"
      )
      .run(id, capability, LIBRARY_PROVIDER_VERSION, language)
  }
  replaceSourceNotes(notes: Map<string, NonNullable<LibraryResource['notes']>>): void {
    this.db.transaction(() => {
      const rows = this.db.prepare('SELECT id FROM resources').all() as { id: string }[]
      for (const row of rows) {
        const resource = this.get(row.id)!
        const next = notes.get(resource.id) ?? []
        if (JSON.stringify(resource.notes ?? []) === JSON.stringify(next)) continue
        const updated = { ...resource, notes: next }
        this.put(updated)
        this.index(updated)
      }
    })()
  }
  reindex(id: string): void {
    this.db
      .prepare(
        "UPDATE work SET state='queued',next_at=?,reason=NULL WHERE resource_id=? AND capability='index' AND version=?"
      )
      .run(-Date.now(), id, LIBRARY_PROVIDER_VERSION)
  }
  next(
    now: number,
    capabilities: readonly Capability[] = CAPABILITIES,
    excludedProviders: readonly string[] = []
  ): LibraryJob | null {
    if (!capabilities.length) return null
    let row: JobRow | undefined
    // The index supplies queue order directly; never sort the entire import backlog per claim.
    const ordered = capabilities.includes('index')
      ? ['index' as const, ...capabilities.filter((capability) => capability !== 'index')]
      : capabilities
    for (const capability of ordered) {
      row =
        capability === 'index'
          ? (this.db
              .prepare(
                "SELECT * FROM work WHERE version=? AND capability='index' AND state IN ('queued','retry') AND next_at<=? ORDER BY next_at LIMIT 1"
              )
              .get(LIBRARY_PROVIDER_VERSION, now) as JobRow | undefined)
          : (this.db
              .prepare(
                `SELECT w.* FROM work w INDEXED BY work_pending_capability
      JOIN resource_providers rp ON rp.resource_id=w.resource_id
      LEFT JOIN provider_pause p ON p.platform=rp.platform
      LEFT JOIN provider_pause lane ON lane.platform=rp.platform || ':' || w.capability
      WHERE w.version=? AND w.capability=? AND w.state IN ('queued','retry') AND w.next_at<=?
      AND (p.until_ms IS NULL OR p.until_ms<=?) AND (lane.until_ms IS NULL OR lane.until_ms<=?)
      ${excludedProviders.length ? `AND rp.platform NOT IN (${excludedProviders.map(() => '?').join(',')})` : ''}
      AND (w.capability='metadata' OR NOT EXISTS (SELECT 1 FROM work m WHERE m.resource_id=w.resource_id AND m.capability='metadata' AND m.version=w.version AND m.state IN ('queued','running','retry')))
      ORDER BY w.next_at LIMIT 1`
              )
              .get(LIBRARY_PROVIDER_VERSION, capability, now, now, now, ...excludedProviders) as
              | JobRow
              | undefined)
      if (row) break
    }
    if (!row) return null
    const job = jobFor(row)
    this.db
      .prepare(
        "UPDATE work SET state='running', attempts=attempts+1 WHERE resource_id=? AND capability=? AND version=? AND language=?"
      )
      .run(job.resourceId, job.capability, job.version, job.language)
    return { ...job, state: 'running', attempts: job.attempts + 1 }
  }
  finish(job: LibraryJob, state: WorkState, reason: string | null = null, nextAt = 0): void {
    this.db.transaction(() => {
      this.db
        .prepare(
          'UPDATE work SET state=?,reason=?,next_at=? WHERE resource_id=? AND capability=? AND version=? AND language=?'
        )
        .run(state, reason, nextAt, job.resourceId, job.capability, job.version, job.language)
      if (state === 'queued' && job.state === 'running')
        this.db
          .prepare(
            'UPDATE work SET attempts=MAX(0,attempts-1) WHERE resource_id=? AND capability=? AND version=? AND language=?'
          )
          .run(job.resourceId, job.capability, job.version, job.language)
      if (job.capability === 'metadata' && (state === 'complete' || state === 'partial'))
        this.db
          .prepare(
            "UPDATE work SET state='queued',attempts=0,next_at=MIN(next_at,-1),reason=NULL WHERE resource_id=? AND version=? AND capability IN ('thumbnail','transcript') AND state IN ('queued','blocked','unavailable')"
          )
          .run(job.resourceId, job.version)
      this.db
        .prepare('INSERT INTO attempts VALUES (?,?,?,?,?,?)')
        .run(job.resourceId, job.capability, job.version, Date.now(), state, reason)
    })()
  }
  pauseProvider(platform: string, until: number): void {
    this.db
      .prepare(
        'INSERT INTO provider_pause VALUES (?,?) ON CONFLICT(platform) DO UPDATE SET until_ms=MAX(provider_pause.until_ms,excluded.until_ms)'
      )
      .run(platform, until)
  }
  retry(id?: string): void {
    if (id)
      this.db
        .prepare(
          "UPDATE work SET state='queued',attempts=0,next_at=?,reason=NULL WHERE resource_id=? AND version=? AND state IN ('queued','blocked','retry','partial','unavailable')"
        )
        .run(-Date.now(), id, LIBRARY_PROVIDER_VERSION)
    else
      this.db
        .prepare(
          "UPDATE work SET state='queued',attempts=0,next_at=0,reason=NULL WHERE version=? AND state IN ('blocked','retry','partial')"
        )
        .run(LIBRARY_PROVIDER_VERSION)
  }
  index(resource: LibraryResource): void {
    this.db.transaction(() => {
      this.db
        .prepare(
          'DELETE FROM search WHERE rowid IN (SELECT row_id FROM search_rows WHERE resource_id=?)'
        )
        .run(resource.id)
      this.db.prepare('DELETE FROM search_rows WHERE resource_id=?').run(resource.id)
      const insert = this.db.prepare(
        'INSERT INTO search(resource_id,title,body,start_ms) VALUES (?,?,?,?)'
      )
      const owner = this.db.prepare('INSERT INTO search_rows(row_id,resource_id) VALUES (?,?)')
      const passage = (title: string, body: string, startMs: number | null) => {
        const result = insert.run(resource.id, title, body, startMs)
        owner.run(result.lastInsertRowid, resource.id)
      }
      const title = resource.metadata?.title || resource.title
      passage(
        title,
        [
          resource.url,
          resource.actor,
          resource.sourceText,
          resource.metadata?.description,
          ...(resource.notes ?? []).map((note) => `${note.title}\n${note.text}\n${note.url}`)
        ]
          .filter(Boolean)
          .join('\n'),
        null
      )
      for (const cue of resource.transcript?.cues ?? []) passage(title, cue.text, cue.startMs)
    })()
  }
  search(options: {
    text?: string
    platform?: string
    offset?: number
    limit?: number
  }): LibrarySearchResult[] {
    const limit = Math.min(100, Math.max(1, options.limit ?? 40))
    const offset = Math.max(0, options.offset ?? 0)
    const platform = options.platform || ''
    const words = options.text?.trim().split(/\s+/).filter(Boolean) ?? []
    if (words.length) {
      const query = words.map((word) => `"${word.replaceAll('"', '""')}"`).join(' AND ')
      const rows = this.db
        .prepare(
          `SELECT r.payload, snippet(search,2,'','', ' … ',32) AS snippet, search.start_ms FROM search JOIN resources r ON r.id=search.resource_id WHERE search MATCH ? AND (?='' OR r.platform=?) ORDER BY rank LIMIT ? OFFSET ?`
        )
        .all(query, platform, platform, limit, offset) as {
        payload: string
        snippet: string
        start_ms: number | null
      }[]
      return rows.map((row) => ({
        ...cardFor(JSON.parse(row.payload) as LibraryResource),
        snippet: row.snippet,
        ...(row.start_ms !== null ? { startMs: row.start_ms } : {})
      }))
    }
    return (
      this.db
        .prepare(
          `SELECT payload FROM resources ${platform ? 'WHERE platform=?' : ''} ORDER BY added_at DESC,id LIMIT ? OFFSET ?`
        )
        .all(...(platform ? [platform] : []), limit, offset) as { payload: string }[]
    ).map((row) => cardFor(JSON.parse(row.payload) as LibraryResource))
  }
  status(): LibraryStatus {
    const counts = this.db
      .prepare(
        'SELECT capability,state,COUNT(*) AS count FROM work WHERE version=? GROUP BY capability,state'
      )
      .all(LIBRARY_PROVIDER_VERSION) as LibraryStatus['counts']
    const recent = this.db
      .prepare(
        "SELECT w.*, r.title FROM work w JOIN resources r ON r.id=w.resource_id WHERE w.version=? AND w.state IN ('blocked','retry','partial','unavailable') ORDER BY w.next_at DESC LIMIT 20"
      )
      .all(LIBRARY_PROVIDER_VERSION) as (JobRow & { title: string })[]
    const running = this.db
      .prepare(
        "SELECT w.*,r.title FROM work w JOIN resources r ON r.id=w.resource_id WHERE w.version=? AND w.state='running' LIMIT 8"
      )
      .all(LIBRARY_PROVIDER_VERSION) as (JobRow & { title: string })[]
    const due = this.db
      .prepare(
        `SELECT MIN(MAX(w.next_at,COALESCE(p.until_ms,0),COALESCE(lane.until_ms,0))) AS at
      FROM work w JOIN resources r ON r.id=w.resource_id
      LEFT JOIN resource_providers rp ON rp.resource_id=r.id
      LEFT JOIN provider_pause p ON p.platform=COALESCE(rp.platform,r.platform)
      LEFT JOIN provider_pause lane ON lane.platform=COALESCE(rp.platform,r.platform) || ':' || w.capability
      WHERE w.version=? AND w.state IN ('queued','retry') AND w.capability!='index'
      AND (w.capability='metadata' OR NOT EXISTS (SELECT 1 FROM work m WHERE m.resource_id=w.resource_id AND m.capability='metadata' AND m.version=w.version AND m.state IN ('queued','running','retry')))`
      )
      .get(LIBRARY_PROVIDER_VERSION) as { at: number | null }
    return {
      paused: this.paused,
      running: running.map((row) => ({ ...jobFor(row), title: row.title })),
      nextAt: due.at,
      resources: (this.db.prepare('SELECT COUNT(*) AS n FROM resources').get() as { n: number }).n,
      counts,
      recent: recent.map((row) => ({ ...jobFor(row), title: row.title })),
      providerVersion: LIBRARY_PROVIDER_VERSION
    }
  }
}
