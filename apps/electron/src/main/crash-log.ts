/**
 * Main-process crash capture (exploration 0315 P0).
 *
 * The desktop shell previously had NO `uncaughtException` handling: a main-
 * process throw killed the app with nothing on disk. This module installs
 * `uncaughtException` + `unhandledRejection` handlers that write one structured
 * JSON line per failure to stderr AND to a bounded local crash file under
 * `userData` — local-first, never transmitted. The renderer can read the file
 * back over IPC so a user-triggered debug report (0315 P2) may attach it, but
 * nothing leaves the machine without that explicit action.
 *
 * Deliberately NOT Electron's `crashReporter`/Crashpad: native minidumps are
 * memory snapshots that can embed env vars, paths, and in-memory secrets and
 * cannot be meaningfully redacted client-side (see exploration 0315, External
 * Research). JS-level capture keeps the payload shape fully under our control.
 *
 * Like the boot trace above it, this must never throw — instrumentation cannot
 * be allowed to take down a process that would otherwise limp on.
 */
import { appendFileSync, readFileSync, statSync, renameSync } from 'fs'
import { join } from 'path'

/** One captured main-process failure, as persisted (one JSON object per line). */
export interface MainCrashEntry {
  kind: 'uncaughtException' | 'unhandledRejection'
  message: string
  stack?: string
  /** Epoch ms. */
  at: number
}

/** Rotate once the log passes this size; one previous generation is kept. */
const MAX_LOG_BYTES = 256 * 1024
/** Cap entries returned to the renderer (newest last). */
const MAX_READ_ENTRIES = 50

const CRASH_LOG_NAME = 'main-crash.log'

let crashLogPath: string | null = null
let installed = false

const toEntry = (kind: MainCrashEntry['kind'], reason: unknown): MainCrashEntry => ({
  kind,
  message:
    reason instanceof Error ? reason.message : typeof reason === 'string' ? reason : String(reason),
  stack: reason instanceof Error ? reason.stack : undefined,
  at: Date.now()
})

const writeEntry = (entry: MainCrashEntry): void => {
  const line = JSON.stringify(entry)
  process.stderr.write(`[crash] ${line}\n`)
  if (!crashLogPath) return
  try {
    try {
      if (statSync(crashLogPath).size > MAX_LOG_BYTES) {
        renameSync(crashLogPath, `${crashLogPath}.1`)
      }
    } catch {
      // first write — file doesn't exist yet
    }
    appendFileSync(crashLogPath, `${line}\n`)
  } catch {
    // crash logging must never crash
  }
}

/**
 * Install the handlers. Call once, as early as possible in main. `userDataDir`
 * comes from `app.getPath('userData')` (after any profile override).
 *
 * Registering an `uncaughtException` listener replaces Electron's default
 * (error dialog) with log-and-continue: the window, SQLite, and Yjs live in
 * separate processes, so a main-process throw is survivable and evidence on
 * disk beats a dialog nobody screenshots.
 */
export function installMainCrashLog(userDataDir: string): void {
  if (installed) return
  installed = true
  crashLogPath = join(userDataDir, CRASH_LOG_NAME)

  process.on('uncaughtException', (error) => {
    writeEntry(toEntry('uncaughtException', error))
  })
  process.on('unhandledRejection', (reason) => {
    writeEntry(toEntry('unhandledRejection', reason))
  })
}

/**
 * Read the most recent crash entries (newest last) for the renderer's
 * user-triggered debug report. Returns [] when there is no log.
 */
export function readMainCrashLog(): MainCrashEntry[] {
  if (!crashLogPath) return []
  const lines: string[] = []
  for (const path of [`${crashLogPath}.1`, crashLogPath]) {
    try {
      lines.push(...readFileSync(path, 'utf8').split('\n'))
    } catch {
      // missing generation is normal
    }
  }
  const entries: MainCrashEntry[] = []
  for (const line of lines) {
    if (!line.trim()) continue
    try {
      const parsed = JSON.parse(line) as MainCrashEntry
      if (parsed && typeof parsed.message === 'string') entries.push(parsed)
    } catch {
      // skip torn/corrupt lines
    }
  }
  return entries.slice(-MAX_READ_ENTRIES)
}

/** Test-only: reset module state. */
export function __resetMainCrashLog(): void {
  crashLogPath = null
  installed = false
}
