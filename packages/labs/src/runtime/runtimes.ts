/**
 * Concrete runtime rungs + the default ladder factory (exploration 0180).
 *
 * Each rung wraps a `run*` function in the {@link LabRuntime} contract. The
 * heavy ones (QuickJS, Python, server) advertise availability so the UI can
 * grey out tiers this environment cannot run.
 */

import type { LabRuntime } from './types'
import type { ServerRuntimeOptions } from './server'
import type { Transpiler } from './transpile'
import { RuntimeLadder } from './ladder'
import { isQuickjsAvailable, runQuickjs } from './quickjs'
import { isPythonAvailable, runPython } from './python'
import { runApp } from './app'
import { runSes } from './ses'
import { createServerRuntimeRunner } from './server'

/** SES Compartment — always available, deterministic JS. */
export const sesRuntime: LabRuntime = {
  id: 'ses',
  label: 'Sandbox · SES',
  tier: 'sandbox',
  languages: ['javascript'],
  deterministic: true,
  isAvailable: () => true,
  run: runSes
}

/** QuickJS-WASM — deterministic JS with hard CPU/memory limits. */
export const quickjsRuntime: LabRuntime = {
  id: 'quickjs',
  label: 'Sandbox · QuickJS',
  tier: 'sandbox',
  languages: ['javascript'],
  deterministic: true,
  isAvailable: isQuickjsAvailable,
  run: runQuickjs
}

/** App rung — DOM mini-app in a sandboxed iframe (host-driven, non-deterministic). */
export const appRuntime: LabRuntime = {
  id: 'app',
  label: 'App · iframe',
  tier: 'app',
  languages: ['javascript'],
  deterministic: false,
  isAvailable: () => typeof document !== 'undefined',
  run: runApp
}

/** Python rung — Pyodide in a Worker (seam; available only when a loader is set). */
export const pythonRuntime: LabRuntime = {
  id: 'pyodide',
  label: 'Sandbox · Python',
  tier: 'sandbox',
  languages: ['python'],
  deterministic: true,
  isAvailable: isPythonAvailable,
  run: runPython
}

/** Build a server rung (Rust/C) over an injected exec backend. */
export function createServerRuntime(options: ServerRuntimeOptions): LabRuntime {
  const run = createServerRuntimeRunner(options)
  return {
    id: 'server',
    label: 'Server · compile + run',
    tier: 'server',
    languages: ['rust', 'c'],
    // Compilation happens off-device; from the client's view it is not a pure,
    // reproducible computation — never allowed for computed/onView Labs.
    deterministic: false,
    isAvailable: () => true,
    run
  }
}

export interface DefaultLadderOptions {
  transpiler?: Transpiler
  /** Optional server backend; when present a Rust/C rung is added. */
  server?: ServerRuntimeOptions
  /** Include the QuickJS rung (default true). */
  includeQuickjs?: boolean
  /** Include the App (iframe) rung (default true). */
  includeApp?: boolean
  /** Include the Python rung (default true; still gated by loader availability). */
  includePython?: boolean
}

/**
 * Assemble the standard ladder. SES is always present; the rest are opt-in but
 * default-on, each self-reporting availability.
 */
export function createDefaultLadder(options: DefaultLadderOptions = {}): RuntimeLadder {
  const runtimes: LabRuntime[] = [sesRuntime]
  if (options.includeQuickjs !== false) runtimes.push(quickjsRuntime)
  if (options.includeApp !== false) runtimes.push(appRuntime)
  if (options.includePython !== false) runtimes.push(pythonRuntime)
  if (options.server) runtimes.push(createServerRuntime(options.server))
  return new RuntimeLadder(runtimes, options.transpiler)
}
