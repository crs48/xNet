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
  if (!metadata) return source
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
      CREATE TABLE IF NOT EXISTS work(resource_id TEXT NOT NULL, capability TEXT NOT NULL, version TEXT NOT NULL, language TEXT NOT NULL, state TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, next_at INTEGER NOT NULL DEFAULT 0, reason TEXT, PRIMARY KEY(resource_id, capability, version, language));
      CREATE INDEX IF NOT EXISTS work_due ON work(state, next_at);
      CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS provider_pause(platform TEXT PRIMARY KEY, until_ms INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS attempts(resource_id TEXT NOT NULL, capability TEXT NOT NULL, version TEXT NOT NULL, at_ms INTEGER NOT NULL, state TEXT NOT NULL, reason TEXT);
      CREATE VIRTUAL TABLE IF NOT EXISTS search USING fts5(resource_id UNINDEXED, title, body, start_ms UNINDEXED, tokenize='unicode61');
      PRAGMA user_version = 1;
    `)
    this.db
      .prepare(
        "UPDATE work SET state = 'queued', reason = 'Interrupted; ready to resume' WHERE state = 'running'"
      )
      .run()
  }
  close(): void {
    if (this.db.open) this.db.close()
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
  put(resource: LibraryResource): void {
    this.db
      .prepare(
        'INSERT INTO resources VALUES (@id,@url,@platform,@title,@payload,@addedAt) ON CONFLICT(id) DO UPDATE SET url=excluded.url, platform=excluded.platform, title=excluded.title, payload=excluded.payload'
      )
      .run({
        ...resource,
        title: resource.metadata?.title || resource.title,
        payload: JSON.stringify(resource)
      })
  }
  seed(resource: LibraryResource): void {
    this.db.transaction(() => {
      const previous = this.get(resource.id)
      this.put(
        previous
          ? {
              ...resource,
              metadata: previous.metadata,
              thumbnail: previous.thumbnail,
              transcript: previous.transcript,
              notes: previous.notes,
              addedAt: previous.addedAt
            }
          : resource
      )
      if (
        !previous ||
        previous.sourceText !== resource.sourceText ||
        previous.title !== resource.title
      )
        this.index(this.get(resource.id)!)
      for (const capability of CAPABILITIES) this.enqueue(resource.id, capability)
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
        "UPDATE work SET state='queued',next_at=0,reason=NULL WHERE resource_id=? AND capability='index' AND version=?"
      )
      .run(id, LIBRARY_PROVIDER_VERSION)
  }
  next(now: number): LibraryJob | null {
    const row = this.db
      .prepare(
        `SELECT w.* FROM work w JOIN resources r ON r.id=w.resource_id
      LEFT JOIN provider_pause p ON p.platform=r.platform
      WHERE w.version=? AND w.state IN ('queued','retry') AND w.next_at<=? AND (p.until_ms IS NULL OR p.until_ms<=? OR w.capability='index')
      AND (w.capability IN ('metadata','index') OR NOT EXISTS (SELECT 1 FROM work m WHERE m.resource_id=w.resource_id AND m.capability='metadata' AND m.version=w.version AND m.state IN ('queued','running','retry')))
      ORDER BY CASE w.capability WHEN 'index' THEN 0 ELSE 1 END, r.added_at DESC, r.id, CASE w.capability WHEN 'metadata' THEN 0 WHEN 'thumbnail' THEN 1 ELSE 2 END LIMIT 1`
      )
      .get(LIBRARY_PROVIDER_VERSION, now, now) as JobRow | undefined
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
      this.db
        .prepare('INSERT INTO attempts VALUES (?,?,?,?,?,?)')
        .run(job.resourceId, job.capability, job.version, Date.now(), state, reason)
    })()
  }
  pauseProvider(platform: string, until: number): void {
    this.db.prepare('INSERT OR REPLACE INTO provider_pause VALUES (?,?)').run(platform, until)
  }
  retry(id?: string): void {
    if (id)
      this.db
        .prepare(
          "UPDATE work SET state='queued',next_at=0,reason=NULL WHERE resource_id=? AND state IN ('blocked','retry','partial','unavailable')"
        )
        .run(id)
    else
      this.db
        .prepare(
          "UPDATE work SET state='queued',next_at=0,reason=NULL WHERE state IN ('blocked','retry','partial')"
        )
        .run()
    this.db.prepare('DELETE FROM provider_pause').run()
  }
  index(resource: LibraryResource): void {
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM search WHERE resource_id=?').run(resource.id)
      const insert = this.db.prepare(
        'INSERT INTO search(resource_id,title,body,start_ms) VALUES (?,?,?,?)'
      )
      const title = resource.metadata?.title || resource.title
      insert.run(
        resource.id,
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
      for (const cue of resource.transcript?.cues ?? [])
        insert.run(resource.id, title, cue.text, cue.startMs)
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
          "SELECT payload FROM resources WHERE (?='' OR platform=?) ORDER BY added_at DESC,id LIMIT ? OFFSET ?"
        )
        .all(platform, platform, limit, offset) as { payload: string }[]
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
        "SELECT w.*, r.title FROM work w JOIN resources r ON r.id=w.resource_id WHERE w.state IN ('blocked','retry','partial','unavailable') ORDER BY w.next_at DESC LIMIT 20"
      )
      .all() as (JobRow & { title: string })[]
    return {
      paused: this.paused,
      resources: (this.db.prepare('SELECT COUNT(*) AS n FROM resources').get() as { n: number }).n,
      counts,
      recent: recent.map((row) => ({ ...jobFor(row), title: row.title })),
      providerVersion: LIBRARY_PROVIDER_VERSION
    }
  }
}
