/**
 * ConsoleLogStore — provider-lifetime ring buffer for captured console output
 * (exploration 0275).
 *
 * The Logs panel used to own the console tap inside a React effect, so
 * switching tabs restored console.* and dropped the buffer. The store lives on
 * XNetDevToolsProvider instead (like DevToolsEventBus) so capture continues
 * while the tab — or the whole dock — is closed. It gets its own ring rather
 * than emitting into the shared event bus so a chatty debug channel can't
 * evict other panels' events.
 *
 * Session persistence ("Preserve log") is opt-in: while the flag is on, the
 * ring is snapshotted to sessionStorage (scrubbed, byte-capped) on
 * visibilitychange→hidden / pagehide plus a lazy dirty-flush, and hydrated
 * back on the next boot. sessionStorage is per-tab and cleared by the browser
 * on tab close, so preserved logs live exactly one session.
 */

export type LogLevel = 'debug' | 'log' | 'info' | 'warn' | 'error'
export type LogChannel = 'sync' | 'sqlite' | 'query' | 'boot' | 'trace' | 'general'

export interface LogEntry {
  id: number
  level: LogLevel
  channel: LogChannel
  message: string
  at: number
  /** Entry hydrated from a previous session's snapshot (renders behind a divider). */
  restored?: boolean
}

export type LogEntryInput = Omit<LogEntry, 'id'>

/** Best-effort channel tag from a log message's content. Ordered so the real
 *  emitters bucket correctly: the query-plan line comes from the SQLite adapter
 *  (`[SQLiteNodeStorageAdapter] query plan`), so match "query" before "sqlite";
 *  the WS provider logs `[WSSyncProvider:…]`, which contains "sync". */
export function classifyChannel(message: string): LogChannel {
  const m = message.toLowerCase()
  if (m.includes('query plan') || m.includes('[query') || m.includes('query:')) return 'query'
  if (m.includes('opfs') || m.includes('sqlite')) return 'sqlite'
  if (m.includes('sync') || m.includes('connectionmanager') || m.includes('websocket')) {
    return 'sync'
  }
  if (m.includes('boot')) return 'boot'
  if (m.includes('trace')) return 'trace'
  return 'general'
}

export function stringifyArgs(args: unknown[]): string {
  return args
    .map((arg) => {
      if (typeof arg === 'string') return arg
      if (arg instanceof Error) return `${arg.name}: ${arg.message}`
      try {
        return JSON.stringify(arg)
      } catch {
        return String(arg)
      }
    })
    .join(' ')
}

// Scrub patterns mirroring @xnetjs/telemetry's collection/scrubbing.ts (the
// devtools deliberately has no hard dep on the telemetry package). Applied
// only when log text leaves the live ring (snapshots, crash breadcrumbs) —
// the in-memory panel view stays raw.
const EMAIL = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi
const DID = /did:[a-z]+:[^\s,"')}]+/g
const TOKEN = /\b[a-zA-Z0-9_-]{32,}\b/g

/** Redact emails, UUIDs, DIDs and long token-like strings from log text. */
export function scrubLogText(text: string): string {
  return text
    .replace(EMAIL, '[EMAIL]')
    .replace(UUID, '[UUID]')
    .replace(DID, 'did:method:[REDACTED]')
    .replace(TOKEN, '[TOKEN]')
}

/** Minimal storage surface so tests can inject fakes. */
export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export const LOG_SNAPSHOT_KEY = 'xnet:devtools:logs:v1'
export const LOG_PRESERVE_FLAG = 'xnet:devtools:logs:preserve'

/** Remove a preserved-log snapshot (used by the local-data wipe paths). */
export function clearLogSnapshot(storage?: StorageLike | null): void {
  const target = storage ?? defaultSessionStorage()
  try {
    target?.removeItem(LOG_SNAPSHOT_KEY)
  } catch {
    /* storage unavailable — nothing to clear */
  }
}

function defaultSessionStorage(): StorageLike | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage
  } catch {
    return null // sandboxed iframes throw on access
  }
}

function defaultLocalStorage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

export interface ConsoleLogStoreOptions {
  /** Ring capacity (default: 1000). */
  maxEntries?: number
  /** Serialized-snapshot byte cap (default: 1 MB). */
  maxSnapshotBytes?: number
  /** Snapshot store (default: sessionStorage). */
  sessionStore?: StorageLike | null
  /** Preserve-flag store (default: localStorage, like the debug channels). */
  flagStore?: StorageLike | null
}

type Listener = () => void

export class ConsoleLogStore {
  private entries: LogEntry[] = []
  private nextId = 0
  private listeners = new Set<Listener>()
  private dirty = false

  private readonly maxEntries: number
  private readonly maxSnapshotBytes: number
  private readonly sessionStore: StorageLike | null
  private readonly flagStore: StorageLike | null

  /** Tap master switch — when false, pushes are dropped entirely. */
  capturing = true
  /** Temporary hold — when true, pushes are dropped but capture stays "on". */
  paused = false

  constructor(options: ConsoleLogStoreOptions = {}) {
    this.maxEntries = options.maxEntries ?? 1000
    this.maxSnapshotBytes = options.maxSnapshotBytes ?? 1_000_000
    this.sessionStore =
      options.sessionStore !== undefined ? options.sessionStore : defaultSessionStorage()
    this.flagStore = options.flagStore !== undefined ? options.flagStore : defaultLocalStorage()
  }

  /** Whether the tap should record right now. */
  get recording(): boolean {
    return this.capturing && !this.paused
  }

  push(input: LogEntryInput): void {
    this.entries.push({ ...input, id: this.nextId++ })
    if (this.entries.length > this.maxEntries) {
      this.entries.splice(0, this.entries.length - this.maxEntries)
    }
    this.dirty = true
    this.notify()
  }

  getEntries(): LogEntry[] {
    return this.entries.slice()
  }

  getRecent(n: number): LogEntry[] {
    return this.entries.slice(-n)
  }

  get size(): number {
    return this.entries.length
  }

  clear(): void {
    this.entries = []
    this.dirty = true
    this.notify()
  }

  /** Subscribe to store changes; returns an unsubscribe function. */
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private notify(): void {
    this.listeners.forEach((fn) => {
      try {
        fn()
      } catch {
        /* a broken listener must not break capture */
      }
    })
  }

  // ─── Session persistence (Preserve log) ─────────────────

  get preserveEnabled(): boolean {
    try {
      return this.flagStore?.getItem(LOG_PRESERVE_FLAG) === 'true'
    } catch {
      return false
    }
  }

  setPreserve(on: boolean): void {
    try {
      if (on) {
        this.flagStore?.setItem(LOG_PRESERVE_FLAG, 'true')
        this.snapshotNow()
      } else {
        this.flagStore?.removeItem(LOG_PRESERVE_FLAG)
        clearLogSnapshot(this.sessionStore)
      }
    } catch {
      /* best-effort */
    }
    this.notify()
  }

  /**
   * Snapshot the ring to sessionStorage (scrubbed, byte-capped). No-op unless
   * preserve is on. Best-effort by design: quota errors are swallowed.
   */
  snapshotNow(): void {
    this.dirty = false
    if (!this.preserveEnabled || !this.sessionStore) return

    let entries = this.entries.map((e) => ({ ...e, message: scrubLogText(e.message) }))
    let json = JSON.stringify(entries)
    while (json.length > this.maxSnapshotBytes && entries.length > 50) {
      entries = entries.slice(Math.ceil(entries.length / 4)) // drop oldest quarter
      json = JSON.stringify(entries)
    }
    try {
      this.sessionStore.setItem(LOG_SNAPSHOT_KEY, json)
    } catch {
      /* quota — session persistence is best-effort */
    }
  }

  /** Load a previous session's snapshot into the ring (entries flagged `restored`). */
  hydrate(): void {
    if (!this.preserveEnabled || !this.sessionStore) return
    let raw: string | null = null
    try {
      raw = this.sessionStore.getItem(LOG_SNAPSHOT_KEY)
    } catch {
      return
    }
    if (!raw) return
    try {
      const parsed = JSON.parse(raw) as LogEntry[]
      for (const e of parsed) {
        this.entries.push({
          level: e.level,
          channel: e.channel,
          message: e.message,
          at: e.at,
          restored: true,
          id: this.nextId++
        })
      }
      if (this.entries.length > this.maxEntries) {
        this.entries.splice(0, this.entries.length - this.maxEntries)
      }
      this.notify()
    } catch {
      clearLogSnapshot(this.sessionStore)
    }
  }

  /**
   * Hydrate the previous snapshot and wire the flush triggers:
   * visibilitychange→hidden and pagehide (the reliable end-of-session events)
   * plus a 5s dirty-flush. Returns a detach function. Safe to call in
   * non-browser environments (returns a no-op detach).
   */
  attachSessionPersistence(): () => void {
    this.hydrate()
    if (typeof document === 'undefined' || typeof window === 'undefined') {
      return () => {}
    }

    const flush = () => this.snapshotNow()
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', flush)
    const interval = setInterval(() => {
      if (this.dirty) flush()
    }, 5_000)

    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', flush)
      clearInterval(interval)
    }
  }
}
