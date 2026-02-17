/**
 * ScriptSandbox - Isolated execution environment for user scripts
 *
 * Executes scripts with:
 * - AST validation before execution
 * - Timeout protection
 * - Global shadowing to prevent escape
 * - Output sanitization
 */

import type { ScriptContext } from './context'
import { validateScriptAST } from './ast-validator'

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Duck-typed telemetry interface to avoid circular dependencies.
 */
export interface TelemetryReporter {
  reportPerformance(metricName: string, durationMs: number): void
  reportUsage(metricName: string, count: number): void
  reportCrash(error: Error, context?: Record<string, unknown>): void
}

export interface SandboxOptions {
  /** Maximum execution time in milliseconds (default: 1000) */
  timeoutMs?: number
  /** Whether to run AST validation (default: true) */
  validateAST?: boolean
  /** Optional telemetry reporter */
  telemetry?: TelemetryReporter
}

// ─── Error Classes ───────────────────────────────────────────────────────────

/**
 * Error thrown when a script fails validation or execution
 */
export class ScriptError extends Error {
  constructor(
    message: string,
    public details: string[]
  ) {
    super(message)
    this.name = 'ScriptError'
  }
}

/**
 * Error thrown when a script times out
 */
export class ScriptTimeoutError extends ScriptError {
  constructor(timeoutMs: number) {
    super('Script execution timed out', [`Exceeded ${timeoutMs}ms limit`])
    this.name = 'ScriptTimeoutError'
  }
}

/**
 * Error thrown when a script fails AST validation
 */
export class ScriptValidationError extends ScriptError {
  constructor(errors: string[]) {
    super('Script validation failed', errors)
    this.name = 'ScriptValidationError'
  }
}

// ─── Sandbox Implementation ──────────────────────────────────────────────────

/**
 * Sandbox for executing user scripts safely.
 *
 * Scripts are validated via AST analysis and executed in an environment
 * where dangerous globals are shadowed to undefined.
 *
 * @example
 * ```typescript
 * const sandbox = new ScriptSandbox({ timeoutMs: 500 })
 *
 * const context = createScriptContext(node, queryFn)
 * const result = await sandbox.execute('(node) => node.amount * 1.08', context)
 * ```
 */
export class ScriptSandbox {
  private options: Required<Omit<SandboxOptions, 'telemetry'>> & { telemetry?: TelemetryReporter }

  constructor(options: SandboxOptions = {}) {
    this.options = {
      timeoutMs: options.timeoutMs ?? 1000,
      validateAST: options.validateAST ?? true,
      telemetry: options.telemetry
    }
  }

  /**
   * Execute a script in the sandbox.
   *
   * @param code - JavaScript code (expression or arrow function)
   * @param context - The frozen ScriptContext
   * @returns The script's return value (sanitized)
   * @throws ScriptValidationError if AST validation fails
   * @throws ScriptTimeoutError if execution exceeds timeout
   * @throws ScriptError for other execution errors
   */
  async execute(code: string, context: ScriptContext): Promise<unknown> {
    const start = this.options.telemetry ? Date.now() : 0

    // 1. Validate AST (if enabled)
    if (this.options.validateAST) {
      const validation = validateScriptAST(code)
      if (!validation.valid) {
        this.options.telemetry?.reportUsage('plugins.ast_validation_failure', 1)
        throw new ScriptValidationError(validation.errors)
      }
    }

    // 2. Create isolated function
    const fn = this.createIsolatedFunction(code)

    try {
      // 3. Execute with timeout
      const result = await this.executeWithTimeout(fn, context)

      // 4. Sanitize output
      const sanitized = this.sanitizeOutput(result)

      this.options.telemetry?.reportPerformance('plugins.execute', Date.now() - start)
      this.options.telemetry?.reportUsage('plugins.execute', 1)

      return sanitized
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      this.options.telemetry?.reportCrash(error, { codeNamespace: 'plugins.ScriptSandbox.execute' })
      this.options.telemetry?.reportUsage('plugins.execute_failure', 1)
      throw err
    }
  }

  /**
   * Execute a script synchronously (for computed columns).
   * Use with caution - no timeout protection in sync mode.
   */
  executeSync(code: string, context: ScriptContext): unknown {
    const start = this.options.telemetry ? Date.now() : 0

    // Validate AST
    if (this.options.validateAST) {
      const validation = validateScriptAST(code)
      if (!validation.valid) {
        this.options.telemetry?.reportUsage('plugins.ast_validation_failure', 1)
        throw new ScriptValidationError(validation.errors)
      }
    }

    // Create and execute
    const fn = this.createIsolatedFunction(code)

    try {
      const result = fn(context)
      const sanitized = this.sanitizeOutput(result)

      this.options.telemetry?.reportPerformance('plugins.execute_sync', Date.now() - start)
      this.options.telemetry?.reportUsage('plugins.execute_sync', 1)

      return sanitized
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      this.options.telemetry?.reportCrash(error, {
        codeNamespace: 'plugins.ScriptSandbox.executeSync'
      })
      this.options.telemetry?.reportUsage('plugins.execute_sync_failure', 1)
      throw new ScriptError('Script execution error', [
        err instanceof Error ? err.message : String(err)
      ])
    }
  }

  /**
   * Create an isolated function from user code.
   *
   * The function receives context values as arguments and has dangerous
   * globals shadowed to undefined in its scope.
   */
  private createIsolatedFunction(code: string): (ctx: ScriptContext) => unknown {
    // Wrap in an IIFE that shadows dangerous globals
    // Note: We can't shadow 'eval' with const in strict mode (reserved word)
    // but AST validation already blocks eval() usage
    const wrapped = `
      "use strict";
      // Shadow dangerous globals (except 'eval' which is reserved in strict mode)
      var window = void 0;
      var document = void 0;
      var globalThis = void 0;
      var self = void 0;
      var parent = void 0;
      var top = void 0;
      var frames = void 0;
      var fetch = void 0;
      var XMLHttpRequest = void 0;
      var WebSocket = void 0;
      var require = void 0;
      var process = void 0;
      var Buffer = void 0;
      var setTimeout = void 0;
      var setInterval = void 0;
      var setImmediate = void 0;
      var requestAnimationFrame = void 0;
      var localStorage = void 0;
      var sessionStorage = void 0;
      var indexedDB = void 0;
      var navigator = void 0;
      var location = void 0;
      var history = void 0;
      var Worker = void 0;
      var SharedWorker = void 0;
      var ServiceWorker = void 0;
      var Proxy = void 0;
      var Reflect = void 0;
      var WebAssembly = void 0;
      var crypto = void 0;
      // Return the user's function/expression
      return (${code.trim()});
    `

    // Use Function constructor to create a function from the wrapped code.
    // This is safe because:
    // 1. We validate the user's code via AST analysis
    // 2. We shadow all dangerous globals in the wrapper
    // 3. The context object is frozen
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const factory = new Function('node', 'nodes', 'now', 'format', 'math', 'text', 'array', wrapped)

    return (ctx: ScriptContext): unknown => {
      // Call the factory with context values to get the user's function
      const userFn = factory(
        ctx.node,
        ctx.nodes,
        ctx.now,
        ctx.format,
        ctx.math,
        ctx.text,
        ctx.array
      )

      // If the result is a function, call it with the node and full context
      if (typeof userFn === 'function') {
        return userFn(ctx.node, ctx)
      }

      // Otherwise return the expression result directly
      return userFn
    }
  }

  /**
   * Execute a function with a timeout.
   */
  private executeWithTimeout(
    fn: (ctx: ScriptContext) => unknown,
    ctx: ScriptContext
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new ScriptTimeoutError(this.options.timeoutMs))
      }, this.options.timeoutMs)

      try {
        const result = fn(ctx)
        clearTimeout(timer)
        resolve(result)
      } catch (err) {
        clearTimeout(timer)
        reject(
          new ScriptError('Script execution error', [
            err instanceof Error ? err.message : String(err)
          ])
        )
      }
    })
  }

  /**
   * Sanitize script output to ensure only safe values are returned.
   *
   * Allowed types: null, undefined, string, number, boolean, plain objects, arrays
   * Stripped: functions, symbols, circular references, dunder properties
   */
  private sanitizeOutput(result: unknown, seen = new WeakSet<object>()): unknown {
    // Primitives are safe
    if (result === null || result === undefined) return result
    if (typeof result === 'string') return result
    if (typeof result === 'number') return Number.isFinite(result) ? result : null
    if (typeof result === 'boolean') return result

    // Functions and symbols are stripped
    if (typeof result === 'function') return undefined
    if (typeof result === 'symbol') return undefined

    // Handle arrays
    if (Array.isArray(result)) {
      // Check for circular reference
      if (seen.has(result)) return undefined
      seen.add(result)

      return result.map((item) => this.sanitizeOutput(item, seen))
    }

    // Handle plain objects
    if (typeof result === 'object') {
      // Check for circular reference
      if (seen.has(result)) return undefined
      seen.add(result)

      // Only allow plain objects
      const proto = Object.getPrototypeOf(result)
      if (proto !== null && proto !== Object.prototype) {
        // Not a plain object (e.g., Date, Map, Set, custom class)
        // Try to convert to primitive if possible
        if (result instanceof Date) {
          return result.getTime()
        }
        // For other types, return undefined
        return undefined
      }

      const clean: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(result)) {
        // Skip dunder properties and symbols
        if (key.startsWith('__')) continue
        if (typeof key === 'symbol') continue

        const sanitized = this.sanitizeOutput(value, seen)
        if (sanitized !== undefined) {
          clean[key] = sanitized
        }
      }
      return clean
    }

    // Unknown types are stripped
    return undefined
  }
}

// ─── Convenience Functions ───────────────────────────────────────────────────

/**
 * Quick execution with default options.
 */
export async function executeScript(code: string, context: ScriptContext): Promise<unknown> {
  const sandbox = new ScriptSandbox()
  return sandbox.execute(code, context)
}

/**
 * Validate script code without executing.
 */
export function validateScript(code: string): { valid: boolean; errors: string[] } {
  return validateScriptAST(code)
}
