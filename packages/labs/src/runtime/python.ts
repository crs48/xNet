/**
 * Python rung — Pyodide in a Worker (exploration 0180).
 *
 * Pyodide (CPython→WASM) is large (~6.4MB core, multi-second cold start) and
 * loads its WASM from a CDN at runtime, so it is NOT a hard dependency here.
 * Instead the engine is INJECTED: the web app lazily `loadPyodide()`s in a
 * Worker and hands us a structural {@link PyodideLike}. With no engine the
 * runtime simply reports unavailable. This mirrors how the WebLLM provider
 * keeps `@xnetjs/plugins` free of its heavy library.
 */

import type { LabRunInput, LabRunResult } from './types'
import { formatLogArgs, sanitizeValue } from './types'

/** The slice of a Pyodide instance we drive. */
export interface PyodideLike {
  runPythonAsync(code: string): Promise<unknown>
  setStdout?(options: { batched: (line: string) => void }): void
  setStderr?(options: { batched: (line: string) => void }): void
}

export type PyodideLoader = () => Promise<PyodideLike>

let loader: PyodideLoader | null = null
let cached: Promise<PyodideLike> | null = null

/** Register the Pyodide loader (called once by the web app). */
export function setPyodideLoader(next: PyodideLoader | null): void {
  loader = next
  cached = null
}

export function isPythonAvailable(): boolean {
  return loader !== null
}

async function getPyodide(): Promise<PyodideLike> {
  if (!loader) throw new Error('Python runtime is not configured (no Pyodide loader registered)')
  if (!cached) cached = loader()
  return cached
}

export async function runPython(input: LabRunInput): Promise<LabRunResult> {
  const start = Date.now()
  if (!loader) {
    return {
      ok: false,
      logs: [],
      error: 'Python runtime is unavailable (Pyodide not loaded)',
      durationMs: Date.now() - start,
      engine: 'pyodide'
    }
  }

  const logs: string[] = []
  try {
    const py = await getPyodide()
    py.setStdout?.({ batched: (line) => logs.push(line) })
    py.setStderr?.({ batched: (line) => logs.push(formatLogArgs([line])) })
    const value = await py.runPythonAsync(input.code)
    return {
      ok: true,
      value: sanitizeValue(value),
      logs: logs.map((message) => ({ level: 'log', message })),
      durationMs: Date.now() - start,
      engine: 'pyodide'
    }
  } catch (err) {
    return {
      ok: false,
      logs: logs.map((message) => ({ level: 'log', message })),
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - start,
      engine: 'pyodide'
    }
  }
}
