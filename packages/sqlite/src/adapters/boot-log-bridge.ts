/**
 * @xnetjs/sqlite - Boot-debug log bridge (worker → main thread)
 *
 * The SQLite Web Worker emits boot-debug diagnostics — per-op queue/exec timing
 * (`[xNet] sqlite op`) and one-shot DB stats (`[xNet] db stats @ open`),
 * exploration 0229 — via `console.*`. Those land only in the *worker's* console,
 * which the in-app Logs panel (a main-thread `console` tap) never sees. So every
 * capture/export came back missing exactly the lines that localize the boot
 * stall, which is a big part of why the stall took several attempts to pin down.
 *
 * This bridge lets the worker forward each boot-debug line to the main thread
 * (via `postMessage`), where the proxy re-emits it on the main console and it is
 * captured like any other log. The message carries a dedicated discriminator key
 * so it can never be confused with a Comlink RPC response on the same port.
 */

/** Discriminator key marking a boot-log message (vs. a Comlink RPC message). */
const BOOT_LOG_KEY = '__xnetSqliteBootLog'

export interface BootLogMessage {
  [BOOT_LOG_KEY]: unknown[]
}

/**
 * Wrap the original `console.*` args as a structured-cloneable message for
 * `postMessage`. Callers pass the same args they would log, e.g.
 * `bootLogMessage(['[xNet] db stats @ open', { bytes }])`.
 */
export function bootLogMessage(args: unknown[]): BootLogMessage {
  return { [BOOT_LOG_KEY]: args }
}

/**
 * Extract the console args from a worker message, or `null` when it isn't a
 * boot-log message — e.g. a Comlink RPC response, which must be left untouched.
 */
export function readBootLogArgs(data: unknown): unknown[] | null {
  if (
    typeof data === 'object' &&
    data !== null &&
    Array.isArray((data as Record<string, unknown>)[BOOT_LOG_KEY])
  ) {
    return (data as Record<string, unknown[]>)[BOOT_LOG_KEY]
  }
  return null
}
