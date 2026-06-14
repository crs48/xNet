/**
 * Core types for the Lab runtime ladder (exploration 0180).
 *
 * A {@link LabRuntime} is one rung of the ladder — a way to execute Lab code
 * with a particular capability/isolation tradeoff. Every rung returns the same
 * {@link LabRunResult} shape so the UI and the extension publisher never care
 * which engine actually ran.
 */

/** Source language authored in a Lab. */
export type LabLanguage = 'javascript' | 'typescript' | 'python' | 'rust' | 'c'

/**
 * The ladder rung a Lab is allowed to use. Orthogonal to (and gated by) the
 * trust tier: `sandbox` is deterministic compute, `app` renders DOM in an
 * iframe, `server` compiles/executes off-device.
 */
export type LabRuntimeTier = 'sandbox' | 'app' | 'server'

/**
 * Capability follows provenance, never self-declaration. Assigned by the host
 * from where the Lab/extension came from — mirrors `WidgetTrustTier`.
 */
export type LabTrustTier = 'first-party' | 'user' | 'marketplace'

export type LabLogLevel = 'log' | 'info' | 'warn' | 'error'

export interface LabLogEntry {
  level: LabLogLevel
  /** Already-stringified, JSON-pure — never a live reference into the sandbox. */
  message: string
}

export interface LabRunResult {
  ok: boolean
  /** The Lab's return value, JSON-sanitized. Present only when `ok`. */
  value?: unknown
  logs: LabLogEntry[]
  /** Present only when `!ok`. */
  error?: string
  durationMs: number
  /** Which concrete engine executed this run (e.g. `ses`, `quickjs`). */
  engine: string
}

/**
 * A capability the host grants to Lab code (the QuickJS/Figma model: nothing is
 * ambient — every tool is an explicit, named, permission-gated import).
 */
export interface LabHostTool {
  name: string
  description: string
  /** Invoked by Lab code. `args` are JSON values; the return is JSON-sanitized. */
  invoke: (args: Record<string, unknown>) => unknown | Promise<unknown>
}

export interface LabHostBridge {
  readonly tools: readonly LabHostTool[]
  get(name: string): LabHostTool | undefined
}

export interface LabRunInput {
  code: string
  language: LabLanguage
  /** Explicit host capabilities exposed to the code as `xnet.<tool>(...)`. */
  host?: LabHostBridge
  /** Wall-clock kill switch (default 1000ms). */
  timeoutMs?: number
  /** Memory ceiling in bytes where the engine supports it (QuickJS). */
  memoryBytes?: number
  signal?: AbortSignal
}

export interface LabRuntime {
  readonly id: string
  readonly label: string
  readonly tier: LabRuntimeTier
  readonly languages: readonly LabLanguage[]
  /**
   * No DOM, no network, no ambient time/randomness → safe to feed a computed
   * column / `onView` trigger. The ladder refuses non-deterministic rungs for
   * those uses.
   */
  readonly deterministic: boolean
  /** Cheap, may be async (e.g. probing for a WASM module / WebGPU). */
  isAvailable(): boolean | Promise<boolean>
  run(input: LabRunInput): Promise<LabRunResult>
}

/** Sanitize any value to JSON-pure data, dropping functions/cycles/live refs. */
export function sanitizeValue(value: unknown): unknown {
  if (value === undefined) return undefined
  try {
    return JSON.parse(JSON.stringify(value ?? null)) as unknown
  } catch {
    return String(value)
  }
}

/** Format a console argument list into a single JSON-pure log line. */
export function formatLogArgs(args: unknown[]): string {
  return args
    .map((arg) => {
      if (typeof arg === 'string') return arg
      try {
        return JSON.stringify(arg)
      } catch {
        return String(arg)
      }
    })
    .join(' ')
}
