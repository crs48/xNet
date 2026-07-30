/**
 * Boot diagnostics (exploration 0210).
 *
 * The web app installed NO global error handlers, so a failure during the
 * pre-React module load or the SQLite/OPFS boot produced a blank screen with
 * zero signal — the "a friend tried to open the app, it didn't load, and we have
 * no data on why" gap.
 *
 * This module:
 *  1. installs `error` + `unhandledrejection` listeners as early as possible
 *     (imported second in `main.tsx`, right after `storage-scope`),
 *  2. records the most recent failure on `window.__xnetBootError` so the in-app
 *     "couldn't start" screen can show the failing stage, and
 *  3. forwards failures to an optional sink — the consent- and env-gated error
 *     reporter wired in `./error-reporter`. Until that sink registers, failures
 *     are queued so nothing is lost during early boot.
 *
 * It is dependency-free and must never throw: instrumentation cannot be allowed
 * to break a boot that would otherwise succeed.
 */
import { lastBootPhase } from './boot-timeline'

/** How a boot/runtime failure was observed. */
export type BootFailureKind =
  | 'window.onerror'
  | 'unhandledrejection'
  | 'init' // thrown inside the App initialize() try/catch
  | 'timeout' // boot watchdog fired — no error, just never finished
  | 'render' // caught by the top-level React ErrorBoundary after mount

export interface BootFailure {
  kind: BootFailureKind
  /** Furthest boot phase reached, e.g. `sqlite:open` (or `pre-react`). */
  stage: string
  message: string
  stack?: string
  /** Epoch ms. */
  at: number
}

type BootFailureSink = (failure: BootFailure, error?: unknown) => void

declare global {
  interface Window {
    /** Last observed fatal/boot error — read by the "couldn't start" fallback. */
    __xnetBootError?: BootFailure
  }
}

let sink: BootFailureSink | null = null
let installed = false
const queued: Array<{ failure: BootFailure; error?: unknown }> = []

function messageOf(value: unknown): string {
  if (value instanceof Error) return value.message
  if (typeof value === 'string') return value
  try {
    return String(value)
  } catch {
    return 'Unknown error'
  }
}

function stackOf(value: unknown): string | undefined {
  return value instanceof Error ? value.stack : undefined
}

/**
 * Record a boot/runtime failure: stamp `window.__xnetBootError`, log it, and
 * hand it to the reporter sink (or queue it until the sink registers).
 */
export function reportBootFailure(kind: BootFailureKind, error: unknown): BootFailure {
  const failure: BootFailure = {
    kind,
    stage: lastBootPhase() ?? 'pre-react',
    message: messageOf(error),
    stack: stackOf(error),
    at: Date.now()
  }
  try {
    window.__xnetBootError = failure
  } catch {
    /* window may be unavailable in non-DOM contexts */
  }
  // eslint-disable-next-line no-console
  console.error(`[xNet] boot failure (${kind} @ ${failure.stage}):`, error)
  if (sink) {
    try {
      sink(failure, error)
    } catch {
      /* a broken sink must not break boot */
    }
  } else {
    queued.push({ failure, error })
  }
  return failure
}

/**
 * Register the failure sink (the error reporter). Any failures observed before
 * the sink registered are flushed immediately so early-boot crashes are not
 * lost.
 */
export function onBootFailure(fn: BootFailureSink): void {
  sink = fn
  while (queued.length > 0) {
    const next = queued.shift()!
    try {
      fn(next.failure, next.error)
    } catch {
      /* ignore */
    }
  }
}

/** Install global `error` + `unhandledrejection` listeners. Idempotent. */
export function installBootDiagnostics(): void {
  if (installed || typeof window === 'undefined') return
  installed = true
  window.addEventListener('error', (event: ErrorEvent) => {
    reportBootFailure('window.onerror', event.error ?? event.message)
  })
  window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
    reportBootFailure('unhandledrejection', event.reason)
  })
}

/**
 * Last-resort fallback for the blank-screen case: if `#<rootId>` is still empty
 * after `delayMs` (React never mounted — e.g. a module-load error before the
 * first render), inject a minimal, inline-styled "couldn't start" notice so the
 * user is never left staring at a blank page. Uses no Tailwind/CSS so it works
 * even if the stylesheet failed to load.
 */
export function installBootFallback(rootId = 'root', delayMs = 12_000): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  window.setTimeout(() => {
    const root = document.getElementById(rootId)
    if (!root || root.childElementCount > 0) return // React mounted — nothing to do
    const failure = window.__xnetBootError
    const detail = failure
      ? `${failure.message} (at ${failure.stage})`
      : 'The app did not finish loading.'
    root.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;min-height:100vh;
                  font-family:system-ui,-apple-system,sans-serif;background:#0a0a0a;color:#e5e5e5;padding:24px">
        <div style="max-width:28rem;text-align:center">
          <div style="font-size:2.25rem;margin-bottom:1rem">⚠️</div>
          <h1 style="font-size:1.25rem;font-weight:600;margin:0 0 .5rem">xNet couldn't start</h1>
          <p style="color:#a3a3a3;margin:0 0 1rem;font-size:.875rem">${detail}</p>
          <button onclick="window.location.reload()"
                  style="padding:.5rem 1rem;border-radius:.375rem;border:0;cursor:pointer;
                         background:#e5e5e5;color:#0a0a0a;font-weight:500">Reload</button>
        </div>
      </div>`
  }, delayMs)
}

/** Test-only: reset module state. */
export function __resetBootDiagnostics(): void {
  sink = null
  installed = false
  queued.length = 0
}
