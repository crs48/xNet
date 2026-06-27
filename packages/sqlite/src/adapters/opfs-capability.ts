/**
 * @xnetjs/sqlite — OPFS capability detection (exploration 0238)
 *
 * The web adapter persists through the Origin Private File System. Which OPFS
 * backend is reachable depends on the runtime, and the difference matters most
 * inside a **mobile webview**:
 *
 * - `opfs-sahpool` (the fast path) needs synchronous access handles —
 *   `FileSystemSyncAccessHandle` — which land in **iOS 16.4+** and Chromium 108+
 *   (Android System WebView). This is what {@link WebSQLiteAdapter} installs.
 * - Below that (iOS 15.2–16.3, older WebViews) only the **async** OPFS VFS
 *   (`sqlite3.oo1.OpfsDb`) works — still durable, just slower I/O.
 * - With no OPFS at all (private mode, ancient engines) the adapter falls back
 *   to a non-durable in-memory database.
 *
 * The web adapter already walks that fallback chain at `open()`; this module
 * makes the decision *legible* — a pure, injectable predicate the adapter uses
 * to emit an accurate "why are we on the slow/no-persistence path" diagnostic,
 * and that the host app / tests can call directly to branch on capability.
 */

/** The durable OPFS backend a context can support, best first. */
export type OpfsPersistenceMode = 'sync-access-handle' | 'async-opfs' | 'memory'

/** Structured capability report for the current (or an injected) scope. */
export interface OpfsCapability {
  /** OPFS root is reachable (`navigator.storage.getDirectory`). */
  opfs: boolean
  /**
   * Synchronous access handles exist → the `opfs-sahpool` fast path is usable
   * (iOS 16.4+, Chromium 108+). When false on an OPFS-capable engine we are on
   * an older iOS/WebView and must use the async OPFS VFS.
   */
  syncAccessHandle: boolean
  /**
   * `SharedArrayBuffer` is present *and* the context is cross-origin isolated.
   * Required by the highest-performance sqlite-wasm mode; in a webview this is
   * what `capacitor://localhost` + COOP/COEP unlocks (exploration 0238).
   */
  crossOriginIsolated: boolean
  /** Best durable backend this context supports. */
  mode: OpfsPersistenceMode
  /** Human-readable explanation, useful for the iOS <16.4 async-fallback case. */
  reason: string
}

/**
 * The slice of global APIs capability detection reads. Injectable so the
 * shared (non-isolated) `unit` test pool can probe synthetic environments
 * without mutating real globals.
 */
export interface OpfsCapabilityScope {
  navigator?: { storage?: { getDirectory?: unknown } } | undefined
  FileSystemSyncAccessHandle?: unknown
  FileSystemFileHandle?: { prototype?: Record<string, unknown> } | undefined
  SharedArrayBuffer?: unknown
  crossOriginIsolated?: unknown
}

function resolveScope(scope?: OpfsCapabilityScope): OpfsCapabilityScope {
  if (scope) return scope
  const g = globalThis as unknown as OpfsCapabilityScope
  return g
}

/** True when the context exposes OPFS via `navigator.storage.getDirectory`. */
export function supportsOpfs(scope?: OpfsCapabilityScope): boolean {
  return typeof resolveScope(scope).navigator?.storage?.getDirectory === 'function'
}

/**
 * True when synchronous access handles are available — the gate for the
 * `opfs-sahpool` fast path (iOS 16.4+, Chromium 108+). Checks both the global
 * constructor and the `createSyncAccessHandle` method on the file-handle
 * prototype, since engines have shipped one or the other.
 */
export function supportsSyncAccessHandle(scope?: OpfsCapabilityScope): boolean {
  const s = resolveScope(scope)
  if (typeof s.FileSystemSyncAccessHandle !== 'undefined') return true
  const proto = s.FileSystemFileHandle?.prototype
  return Boolean(proto && 'createSyncAccessHandle' in proto)
}

/**
 * True when a `SharedArrayBuffer` can actually be used — present *and* the
 * context is cross-origin isolated (the browser ungated SAB behind COI).
 */
export function isCrossOriginIsolated(scope?: OpfsCapabilityScope): boolean {
  const s = resolveScope(scope)
  return typeof s.SharedArrayBuffer !== 'undefined' && s.crossOriginIsolated === true
}

/**
 * Report the best durable OPFS backend the given scope supports, with a reason.
 * Pure and synchronous — safe to call before any sqlite-wasm import.
 */
export function detectOpfsCapability(scope?: OpfsCapabilityScope): OpfsCapability {
  const opfs = supportsOpfs(scope)
  const syncAccessHandle = supportsSyncAccessHandle(scope)
  const crossOriginIsolated = isCrossOriginIsolated(scope)

  let mode: OpfsPersistenceMode
  let reason: string
  if (!opfs) {
    mode = 'memory'
    reason =
      'OPFS is unavailable in this context (private browsing or an unsupported engine); ' +
      'local data will not persist across reloads.'
  } else if (syncAccessHandle) {
    mode = 'sync-access-handle'
    reason = 'OPFS sync access handles available — using the durable opfs-sahpool fast path.'
  } else {
    mode = 'async-opfs'
    reason =
      'OPFS is available but sync access handles are not (iOS 15.2–16.3 or an older WebView); ' +
      'falling back to the slower async OPFS backend. Data still persists.'
  }

  return { opfs, syncAccessHandle, crossOriginIsolated, mode, reason }
}
