/**
 * Make the main and data processes visible to a CDP-attached agent (0413).
 *
 * An agent driving the app over CDP sees the **renderer console and nothing
 * else**. `main/` and `data-process/` write to the `pnpm dev` stdout, which is
 * a different channel with different semantics and is simply absent whenever a
 * human started the app. So a boot failure in the main process — the class of
 * failure that matters most — is invisible to the thing doing the verifying.
 *
 * This forwards main-process console output into the renderer's console, tagged
 * `[main]`, following `electron-log`'s IPC-transport pattern. Two details that
 * pattern alone does not give us:
 *
 *   1. **A ring buffer.** Records emitted before a window exists have nowhere
 *      to forward to, and those are the interesting ones. Everything is
 *      buffered and flushed once a renderer is listening.
 *   2. **`window.__xnetDev.logs()`.** The flush lands in the console, which is
 *      lossy across reloads; the buffer stays readable on demand.
 *
 * Development only — production logging is 0315's job, and this deliberately
 * has no file transport, no network transport and no retention.
 */
import { ipcMain, type BrowserWindow } from 'electron'

export const DEV_LOG_CHANNEL = 'xnet:dev:log'
export const DEV_LOG_LIST_CHANNEL = 'xnet:dev:logs'

const MAX_RECORDS = 500

export type DevLogLevel = 'log' | 'info' | 'warn' | 'error' | 'debug'
export type DevLogSource = 'main' | 'data'

export interface DevLogRecord {
  at: string
  source: DevLogSource
  level: DevLogLevel
  message: string
}

/** Bounded FIFO. Oldest records are dropped; the newest are the ones we want. */
const buffer: DevLogRecord[] = []
let target: BrowserWindow | null = null
let installed = false

export function recordDevLog(
  source: DevLogSource,
  level: DevLogLevel,
  message: string
): DevLogRecord {
  const record: DevLogRecord = { at: new Date().toISOString(), source, level, message }
  buffer.push(record)
  if (buffer.length > MAX_RECORDS) buffer.splice(0, buffer.length - MAX_RECORDS)
  forward(record)
  return record
}

function forward(record: DevLogRecord): void {
  if (!target || target.isDestroyed()) return
  try {
    target.webContents.send(DEV_LOG_CHANNEL, record)
  } catch {
    // A window mid-teardown is not a reason to lose the buffered copy.
  }
}

/** Every record captured so far, oldest first. */
export function devLogRecords(): DevLogRecord[] {
  return [...buffer]
}

/** Test seam — the buffer is module state and would otherwise leak across specs. */
export function resetDevLogBridge(): void {
  buffer.length = 0
  target = null
  installed = false
}

function format(args: unknown[]): string {
  return args
    .map((arg) => {
      if (typeof arg === 'string') return arg
      if (arg instanceof Error) return arg.stack || `${arg.name}: ${arg.message}`
      try {
        return JSON.stringify(arg)
      } catch {
        return String(arg)
      }
    })
    .join(' ')
}

/**
 * Patch the main process's console so everything it already logs is captured.
 *
 * Wrapping rather than replacing: the original still writes to stdout, so
 * `preview_logs` and a human's terminal keep working exactly as before. This
 * only *adds* a second reader.
 */
export function installDevLogBridge(): void {
  if (installed || process.env.NODE_ENV !== 'development') return
  installed = true

  const levels: DevLogLevel[] = ['log', 'info', 'warn', 'error', 'debug']
  for (const level of levels) {
    const original = console[level].bind(console)
    console[level] = (...args: unknown[]) => {
      original(...args)
      // Capture only — never re-enter the console from inside the patch.
      const record: DevLogRecord = {
        at: new Date().toISOString(),
        source: 'main',
        level,
        message: format(args)
      }
      buffer.push(record)
      if (buffer.length > MAX_RECORDS) buffer.splice(0, buffer.length - MAX_RECORDS)
      forward(record)
    }
  }

  ipcMain.handle(DEV_LOG_LIST_CHANNEL, () => devLogRecords())
}

/**
 * Point the bridge at a window and flush everything buffered before it existed.
 * Called once the renderer has finished loading — earlier and the flush races
 * the renderer's own listener registration.
 */
export function attachDevLogWindow(window: BrowserWindow): void {
  if (process.env.NODE_ENV !== 'development') return
  target = window
  for (const record of buffer) forward(record)
}
