/**
 * QuickJS-WASM runtime — untrusted JS with HARD limits (exploration 0180).
 *
 * This is the rung the SES Compartment cannot be: a separate JS engine in its
 * own WASM memory with a wall-clock interrupt handler and a byte-level memory
 * cap. It is the model Figma uses for plugin logic — nothing is ambient (no
 * DOM, no fetch, no timers), code runs to a deadline, and a memory bomb hits a
 * ceiling instead of taking down the tab.
 *
 * v1 executes synchronous code only (its sweet spot: deterministic compute).
 * Labs that need async host tools use the SES rung. The heavy WASM module is
 * lazy-loaded so importing this file stays cheap.
 */

import type { LabRunInput, LabRunResult } from './types'
import { formatLogArgs, sanitizeValue } from './types'

// Structural typing of the slice of `quickjs-emscripten` we use, so this file
// type-checks without a hard static dependency on its (large) type surface.
interface QuickJSHandle {
  dispose(): void
}
interface QuickJSContext {
  global: QuickJSHandle
  newObject(): QuickJSHandle
  newFunction(name: string, fn: (...args: QuickJSHandle[]) => void): QuickJSHandle
  setProp(target: QuickJSHandle, key: string, value: QuickJSHandle): void
  dump(handle: QuickJSHandle): unknown
  evalCode(code: string): { error?: QuickJSHandle; value?: QuickJSHandle }
  dispose(): void
}
interface QuickJSRuntime {
  setMemoryLimit(bytes: number): void
  setInterruptHandler(handler: () => boolean): void
  newContext(): QuickJSContext
  dispose(): void
}
interface QuickJSWASMModule {
  newRuntime(): QuickJSRuntime
}
interface QuickJSLib {
  getQuickJS(): Promise<QuickJSWASMModule>
  shouldInterruptAfterDeadline(deadline: number): () => boolean
}

let libPromise: Promise<QuickJSLib | null> | null = null

async function loadLib(): Promise<QuickJSLib | null> {
  if (!libPromise) {
    libPromise = import('quickjs-emscripten')
      .then((mod) => mod as unknown as QuickJSLib)
      .catch(() => null)
  }
  return libPromise
}

/** Reset the cached module loader (test seam). */
export function __resetQuickjsForTests(): void {
  libPromise = null
}

export async function isQuickjsAvailable(): Promise<boolean> {
  return (await loadLib()) !== null
}

export async function runQuickjs(input: LabRunInput): Promise<LabRunResult> {
  const start = Date.now()
  const lib = await loadLib()
  if (!lib) {
    return {
      ok: false,
      logs: [],
      error: 'QuickJS runtime is unavailable in this environment',
      durationMs: Date.now() - start,
      engine: 'quickjs'
    }
  }

  const timeoutMs = input.timeoutMs ?? 1000
  const memoryBytes = input.memoryBytes ?? 16 * 1024 * 1024

  const mod = await lib.getQuickJS()
  const runtime = mod.newRuntime()
  runtime.setMemoryLimit(memoryBytes)
  runtime.setInterruptHandler(lib.shouldInterruptAfterDeadline(Date.now() + timeoutMs))

  const ctx = runtime.newContext()
  const logs: string[] = []

  try {
    // Capturing console.log (the only endowment — nothing else is ambient).
    const consoleObj = ctx.newObject()
    const logFn = ctx.newFunction('log', (...args: QuickJSHandle[]) => {
      logs.push(formatLogArgs(args.map((handle) => ctx.dump(handle))))
    })
    ctx.setProp(consoleObj, 'log', logFn)
    ctx.setProp(ctx.global, 'console', consoleObj)
    logFn.dispose()
    consoleObj.dispose()

    // Wrap so a top-level `return` yields the completion value.
    const result = ctx.evalCode(`(function () {\n${input.code}\n})()`)

    if (result.error) {
      const dumped = ctx.dump(result.error)
      result.error.dispose()
      const message =
        dumped && typeof dumped === 'object' && 'message' in (dumped as Record<string, unknown>)
          ? String((dumped as Record<string, unknown>).message)
          : String(dumped)
      return {
        ok: false,
        logs: logs.map((message) => ({ level: 'log', message })),
        error: message,
        durationMs: Date.now() - start,
        engine: 'quickjs'
      }
    }

    const value = result.value ? ctx.dump(result.value) : undefined
    result.value?.dispose()
    return {
      ok: true,
      value: sanitizeValue(value),
      logs: logs.map((message) => ({ level: 'log', message })),
      durationMs: Date.now() - start,
      engine: 'quickjs'
    }
  } catch (err) {
    return {
      ok: false,
      logs: logs.map((message) => ({ level: 'log', message })),
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - start,
      engine: 'quickjs'
    }
  } finally {
    ctx.dispose()
    runtime.dispose()
  }
}
