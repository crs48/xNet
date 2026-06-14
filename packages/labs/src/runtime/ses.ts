/**
 * SES (Compartment) runtime — the deterministic default rung (exploration 0180).
 *
 * Lab code runs inside a SES Compartment whose global object exposes ONLY the
 * endowments below: a capturing `console`, `JSON`/`Math`, and (if granted) the
 * `xnet` host bridge. No window, no document, no fetch, no timers. After
 * `lockdown()` the shared intrinsics are frozen, so code cannot tamper with
 * `Array.prototype` et al. to escape.
 *
 * In the browser this same evaluator is hosted inside a terminable Web Worker
 * (see `worker.ts`) which adds CPU isolation — a `while(true)` stalls that
 * thread, not the app, and the host can `terminate()` it. The in-process path
 * here (used by tests/SSR) has the same capability scoping without the thread.
 */

import 'ses'
import type { LabHostBridge, LabRunInput, LabRunResult } from './types'
import { bridgeToGlobal } from '../host'
import { formatLogArgs, sanitizeValue } from './types'

let lockedDown = false

/**
 * Freeze shared intrinsics once per realm. Safe to call repeatedly. In jsdom
 * test realms `lockdown` can throw on already-tampered intrinsics — evaluation
 * still proceeds with compartment scoping, which is the isolation we assert.
 */
export function lockdownRealm(): boolean {
  if (lockedDown) return true
  try {
    lockdown({ errorTaming: 'unsafe', overrideTaming: 'severe' })
    lockedDown = true
  } catch {
    // Intrinsics already modified (e.g. test polyfills) — scoping still applies.
  }
  return lockedDown
}

interface EvalOutcome {
  value: unknown
  logs: string[]
}

/**
 * Evaluate Lab `code` as the body of an async function. The code may `return`
 * a value and may `await` host tools. Returns the sanitized value + captured
 * console lines.
 */
async function evaluateInCompartment(
  code: string,
  host: LabHostBridge | undefined,
  signal: AbortSignal | undefined
): Promise<EvalOutcome> {
  lockdownRealm()

  const logs: string[] = []
  const makeLogger =
    (prefix: string) =>
    (...args: unknown[]) => {
      logs.push(prefix ? `[${prefix}] ${formatLogArgs(args)}` : formatLogArgs(args))
    }

  const endowments: Record<string, unknown> = {
    console: {
      log: makeLogger(''),
      info: makeLogger('info'),
      warn: makeLogger('warn'),
      error: makeLogger('error')
    },
    JSON,
    Math
  }
  if (host) {
    endowments.xnet = bridgeToGlobal(host)
  }

  const compartment = new Compartment({
    globals: endowments,
    __options__: true
  })

  // Wrap so top-level `return` and `await` work; the IIFE yields a promise.
  const wrapped = `(async () => {\n${code}\n})()`
  const result = compartment.evaluate(wrapped) as Promise<unknown>

  signal?.throwIfAborted()
  const value = await result
  return { value: sanitizeValue(value), logs }
}

/**
 * Run with a wall-clock deadline that rejects if user code never RESOLVES.
 *
 * Caveat: this deadline is a host-realm `setTimeout`, so it only catches
 * ASYNCHRONOUS hangs (e.g. `await new Promise(() => {})`). A SYNCHRONOUS busy
 * loop (`while (true) {}`) blocks the event loop and cannot be interrupted
 * in-process — that is precisely what the terminable Worker (`worker.ts`) and
 * the QuickJS rung (a real interrupt handler) are for. Treat this in-process
 * path as deterministic scoping for trusted-ish JS, not CPU containment.
 */
export async function runSes(input: LabRunInput): Promise<LabRunResult> {
  const start = Date.now()
  const timeoutMs = input.timeoutMs ?? 1000
  let timer: ReturnType<typeof setTimeout> | undefined

  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Lab timed out after ${timeoutMs}ms`)), timeoutMs)
  })

  try {
    const outcome = await Promise.race([
      evaluateInCompartment(input.code, input.host, input.signal),
      deadline
    ])
    return {
      ok: true,
      value: outcome.value,
      logs: outcome.logs.map((message) => ({ level: 'log', message })),
      durationMs: Date.now() - start,
      engine: 'ses'
    }
  } catch (err) {
    return {
      ok: false,
      logs: [],
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - start,
      engine: 'ses'
    }
  } finally {
    if (timer) clearTimeout(timer)
  }
}
