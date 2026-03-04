/**
 * ScriptRunner - Reactive script execution system
 *
 * Manages script lifecycle:
 * - Registers scripts based on their trigger type
 * - Executes scripts when triggers fire
 * - Handles errors gracefully
 * - Updates script status (lastRun, lastError)
 */

import type { ScriptNode, ScriptOutputType } from '../schemas/script'
import { createScriptContext, type FlatNode } from './context'
import { ScriptSandbox, ScriptError, type TelemetryReporter } from './sandbox'

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Minimal store interface for the script runner.
 * This avoids a hard dependency on @xnetjs/data.
 */
export interface ScriptStore {
  /** List nodes matching a query */
  list(query: { schemaIRI?: string }): FlatNode[]
  /** Update a node by ID */
  update(id: string, payload: Partial<Record<string, unknown>>): Promise<void> | void
  /** Subscribe to node changes */
  subscribe(callback: (event: ScriptNodeChangeEvent) => void): () => void
}

export interface ScriptNodeChangeEvent {
  type: 'create' | 'update' | 'delete'
  node?: FlatNode
  change: {
    payload?: Record<string, unknown>
  }
}

export interface ScriptRunnerOptions {
  /** Store instance */
  store: ScriptStore
  /** Sandbox options */
  sandboxOptions?: {
    timeoutMs?: number
    validateAST?: boolean
  }
  /** Optional telemetry reporter */
  telemetry?: TelemetryReporter
}

export interface ScriptExecutionResult {
  /** Whether execution succeeded */
  success: boolean
  /** The script's return value (if successful) */
  result?: unknown
  /** Error message (if failed) */
  error?: string
  /** Execution time in milliseconds */
  durationMs: number
}

// ─── ScriptRunner ────────────────────────────────────────────────────────────

/**
 * Manages reactive script execution.
 *
 * @example
 * ```typescript
 * const runner = new ScriptRunner({ store })
 *
 * // Start listening for triggers
 * await runner.start()
 *
 * // Execute a script manually
 * const result = await runner.executeManual(code, targetNode)
 *
 * // Stop all listeners
 * runner.stop()
 * ```
 */
export class ScriptRunner {
  private sandbox: ScriptSandbox
  private store: ScriptStore
  private subscriptions: Array<() => void> = []
  private scriptSubscriptions = new Map<string, () => void>()
  private started = false
  private telemetry?: TelemetryReporter

  constructor(options: ScriptRunnerOptions) {
    this.store = options.store
    this.telemetry = options.telemetry
    this.sandbox = new ScriptSandbox({ ...options.sandboxOptions, telemetry: options.telemetry })
  }

  /**
   * Start the script runner.
   * Registers all enabled scripts and sets up triggers.
   */
  async start(): Promise<void> {
    if (this.started) return
    this.started = true

    // Get all script nodes
    const scripts = this.store.list({ schemaIRI: 'xnet://xnet.dev/Script' })

    // Register enabled scripts
    for (const script of scripts) {
      if ((script as unknown as ScriptNode).enabled) {
        this.registerScript(script as unknown as ScriptNode)
      }
    }

    // Watch for script changes (new scripts, enable/disable, delete)
    const unsubScripts = this.store.subscribe((event) => {
      if (event.node?.schemaIRI === 'xnet://xnet.dev/Script') {
        this.handleScriptChange(event)
      }
    })
    this.subscriptions.push(unsubScripts)
  }

  /**
   * Stop the script runner.
   * Removes all triggers and subscriptions.
   */
  stop(): void {
    this.started = false

    // Unsubscribe from store
    for (const unsub of this.subscriptions) {
      unsub()
    }
    this.subscriptions = []

    // Unsubscribe script-specific listeners
    for (const unsub of this.scriptSubscriptions.values()) {
      unsub()
    }
    this.scriptSubscriptions.clear()
  }

  /**
   * Execute a script manually for testing/preview.
   * Does not update lastRun/lastError on the script node.
   */
  async executeManual(code: string, node: FlatNode): Promise<ScriptExecutionResult> {
    const startTime = Date.now()

    try {
      const context = createScriptContext(node, (schemaIRI) => this.store.list({ schemaIRI }))

      const result = await this.sandbox.execute(code, context)

      return {
        success: true,
        result,
        durationMs: Date.now() - startTime
      }
    } catch (err) {
      const errorMsg =
        err instanceof ScriptError
          ? err.details.join('; ')
          : err instanceof Error
            ? err.message
            : String(err)

      return {
        success: false,
        error: errorMsg,
        durationMs: Date.now() - startTime
      }
    }
  }

  /**
   * Execute a script as a computed value (synchronous).
   * Used for computed columns in table views.
   */
  computeValue(code: string, node: FlatNode): unknown {
    const context = createScriptContext(node, (schemaIRI) => this.store.list({ schemaIRI }))

    return this.sandbox.executeSync(code, context)
  }

  // ─── Private Methods ───────────────────────────────────────────────────────

  /**
   * Register a script and set up its trigger.
   */
  private registerScript(script: ScriptNode): void {
    // Unregister first if already registered
    this.unregisterScript(script.id)

    const trigger = script.triggerType

    switch (trigger) {
      case 'onChange':
        this.registerOnChangeTrigger(script)
        break

      case 'manual':
        // Manual scripts don't need automatic triggers
        break

      case 'onView':
        // onView scripts are computed on-demand, no automatic trigger
        break

      case 'scheduled':
        // TODO: Implement cron scheduling
        console.warn(`Scheduled triggers not yet implemented for script: ${script.name}`)
        break
    }
  }

  /**
   * Unregister a script's trigger.
   */
  private unregisterScript(scriptId: string): void {
    const unsub = this.scriptSubscriptions.get(scriptId)
    if (unsub) {
      unsub()
      this.scriptSubscriptions.delete(scriptId)
    }
  }

  /**
   * Register an onChange trigger for a script.
   */
  private registerOnChangeTrigger(script: ScriptNode): void {
    if (!script.inputSchema) {
      console.warn(`onChange script '${script.name}' has no inputSchema`)
      return
    }

    const unsub = this.store.subscribe(async (event) => {
      // Only handle updates to matching schema
      if (event.type !== 'update' && event.type !== 'create') return
      if (!event.node || event.node.schemaIRI !== script.inputSchema) return

      // Check property filter if specified
      if (script.triggerProperty && event.change.payload) {
        if (!(script.triggerProperty in event.change.payload)) {
          return // Property not in this change
        }
      }

      // Execute the script
      await this.executeScript(script, event.node)
    })

    this.scriptSubscriptions.set(script.id, unsub)
  }

  /**
   * Execute a script and handle results.
   */
  private async executeScript(script: ScriptNode, targetNode: FlatNode): Promise<void> {
    const startTime = Date.now()

    try {
      const context = createScriptContext(targetNode, (schemaIRI) => this.store.list({ schemaIRI }))

      const result = await this.sandbox.execute(script.code, context)

      // Handle output based on outputType
      if (result && typeof result === 'object') {
        const outputType = script.outputType as ScriptOutputType

        if (outputType === 'mutation') {
          // Apply mutations to target node
          await this.store.update(targetNode.id, result as Record<string, unknown>)
        } else if (outputType === 'decoration') {
          // Decorations could be stored separately or on the node
          // For now, store as _decoration property
          await this.store.update(targetNode.id, { _decoration: result })
        }
        // 'value' and 'void' outputs are not persisted automatically
      }

      // Track successful script execution
      this.telemetry?.reportPerformance('plugins.script_execution', Date.now() - startTime)

      // Update script status
      await this.store.update(script.id, {
        lastRun: Date.now(),
        lastError: null
      })
    } catch (err) {
      const errorMsg =
        err instanceof ScriptError
          ? err.details.join('; ')
          : err instanceof Error
            ? err.message
            : String(err)

      // Track crash recovery event
      this.telemetry?.reportUsage('plugins.crash_recovery', 1)

      // Update script with error
      await this.store.update(script.id, {
        lastRun: Date.now(),
        lastError: errorMsg
      })

      console.error(`Script '${script.name}' failed:`, errorMsg)
    }
  }

  /**
   * Handle changes to script nodes.
   */
  private handleScriptChange(event: ScriptNodeChangeEvent): void {
    const script = event.node as unknown as ScriptNode | undefined
    if (!script) return

    switch (event.type) {
      case 'create':
        if (script.enabled) {
          this.registerScript(script)
        }
        break

      case 'update':
        // Re-register (will unregister first)
        if (script.enabled) {
          this.registerScript(script)
        } else {
          this.unregisterScript(script.id)
        }
        break

      case 'delete':
        this.unregisterScript(script.id)
        break
    }
  }
}
