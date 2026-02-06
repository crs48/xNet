/**
 * ChangeHandlerRegistry - Registry for version-specific change handlers.
 *
 * The registry manages handlers for different change types and protocol versions,
 * enabling backward compatibility and graceful handling of unknown changes.
 *
 * @example
 * ```typescript
 * const registry = new ChangeHandlerRegistry()
 *
 * // Register a handler for node changes (protocol v1+)
 * registry.register(nodeChangeHandler)
 *
 * // Process a change
 * const result = await registry.process(change, context)
 * if (!result.success) {
 *   console.error('Failed to process:', result.error)
 * }
 * ```
 */

import type { Change } from '../change'
import type { ChangeHandler, HandlerContext, ValidationResult, HandlerEvent } from './types'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProcessResult {
  /** Whether processing succeeded */
  success: boolean
  /** Error message if processing failed */
  error?: string
  /** The handler that processed the change (if any) */
  handlerType?: string
  /** Validation result (if validation was performed) */
  validation?: ValidationResult
}

export interface RegistryStats {
  /** Number of registered handler types */
  handlerTypes: number
  /** Total number of handlers */
  totalHandlers: number
  /** Handlers by type */
  byType: Record<string, number>
}

type EventListener = (event: HandlerEvent) => void

// ─── Registry ─────────────────────────────────────────────────────────────────

/**
 * Registry for version-specific change handlers.
 */
export class ChangeHandlerRegistry {
  private handlers = new Map<string, ChangeHandler<unknown>[]>()
  private listeners = new Set<EventListener>()

  /**
   * Register a change handler.
   *
   * Handlers are sorted by version range (newest first) for efficient lookup.
   * Multiple handlers can be registered for the same type with different version ranges.
   */
  register<T>(handler: ChangeHandler<T>): void {
    const existing = this.handlers.get(handler.type) ?? []
    existing.push(handler as ChangeHandler<unknown>)

    // Sort by maxVersion descending for efficient lookup (newest first)
    existing.sort((a, b) => b.maxVersion - a.maxVersion)

    this.handlers.set(handler.type, existing)
  }

  /**
   * Unregister a handler by type and version range.
   */
  unregister(type: string, minVersion: number, maxVersion: number): boolean {
    const handlers = this.handlers.get(type)
    if (!handlers) return false

    const index = handlers.findIndex(
      (h) => h.minVersion === minVersion && h.maxVersion === maxVersion
    )

    if (index === -1) return false

    handlers.splice(index, 1)
    if (handlers.length === 0) {
      this.handlers.delete(type)
    }

    return true
  }

  /**
   * Get the handler for a specific change.
   *
   * Selection order:
   * 1. Find handlers for the change type
   * 2. Filter by version range (change.protocolVersion must be in [minVersion, maxVersion])
   * 3. Check canHandle() for additional filtering
   * 4. Return first matching handler (newest version first)
   */
  getHandler(change: Change<unknown>): ChangeHandler<unknown> | null {
    const handlers = this.handlers.get(change.type)
    if (!handlers || handlers.length === 0) return null

    const version = change.protocolVersion ?? 0

    // Find handler that matches version range
    for (const handler of handlers) {
      if (version >= handler.minVersion && version <= handler.maxVersion) {
        if (handler.canHandle(change)) {
          return handler
        }
      }
    }

    // Fallback: try handlers that support upgrade() for older versions
    // This allows v2 handlers to process v1 changes by upgrading them
    for (const handler of handlers) {
      if (handler.upgrade && version < handler.minVersion && handler.canHandle(change)) {
        return handler
      }
    }

    return null
  }

  /**
   * Check if a handler exists for a change type.
   */
  hasHandler(type: string): boolean {
    return this.handlers.has(type) && (this.handlers.get(type)?.length ?? 0) > 0
  }

  /**
   * Get all registered handler types.
   */
  getTypes(): string[] {
    return Array.from(this.handlers.keys())
  }

  /**
   * Get registry statistics.
   */
  getStats(): RegistryStats {
    const byType: Record<string, number> = {}
    let totalHandlers = 0

    for (const [type, handlers] of this.handlers) {
      byType[type] = handlers.length
      totalHandlers += handlers.length
    }

    return {
      handlerTypes: this.handlers.size,
      totalHandlers,
      byType
    }
  }

  /**
   * Process a change using the appropriate handler.
   *
   * Processing steps:
   * 1. Find a handler for the change type and version
   * 2. If no handler found, store as unknown and emit event
   * 3. Validate the change
   * 4. If invalid, emit event and return failure
   * 5. Optionally upgrade the change format
   * 6. Process the change
   */
  async process(change: Change<unknown>, context: HandlerContext): Promise<ProcessResult> {
    const handler = this.getHandler(change)

    if (!handler) {
      // Unknown change type - store but don't process
      try {
        await context.storeUnknown(change)
      } catch (err) {
        // Ignore storage errors for unknown changes
      }

      this.emit({ type: 'unknown-change-type', change })
      context.emit('unknownChangeType', { change })

      return {
        success: true, // Not an error, just unknown
        error: `No handler for change type "${change.type}" at protocol v${change.protocolVersion ?? 0}`
      }
    }

    // Upgrade if needed
    let processableChange = change
    if (handler.upgrade && (change.protocolVersion ?? 0) < handler.minVersion) {
      try {
        processableChange = handler.upgrade(change)
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err)
        return {
          success: false,
          error: `Failed to upgrade change: ${error}`,
          handlerType: handler.type
        }
      }
    }

    // Validate
    const validation = handler.validate(processableChange)
    if (!validation.valid) {
      this.emit({ type: 'invalid-change', change, errors: validation.errors })
      context.emit('invalidChange', { change, errors: validation.errors })

      return {
        success: false,
        error: `Validation failed: ${validation.errors.map((e) => e.message).join(', ')}`,
        handlerType: handler.type,
        validation
      }
    }

    // Process
    try {
      await handler.process(processableChange, context)
      this.emit({ type: 'change-processed', change, handlerType: handler.type })

      return {
        success: true,
        handlerType: handler.type,
        validation
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      this.emit({ type: 'handler-error', change, error })

      return {
        success: false,
        error: `Handler error: ${error.message}`,
        handlerType: handler.type,
        validation
      }
    }
  }

  /**
   * Process multiple changes in order.
   */
  async processAll(
    changes: Change<unknown>[],
    context: HandlerContext
  ): Promise<{ results: ProcessResult[]; successful: number; failed: number }> {
    const results: ProcessResult[] = []
    let successful = 0
    let failed = 0

    for (const change of changes) {
      const result = await this.process(change, context)
      results.push(result)

      if (result.success) {
        successful++
      } else {
        failed++
      }
    }

    return { results, successful, failed }
  }

  // ─── Event Handling ─────────────────────────────────────────────────────────

  /**
   * Subscribe to registry events.
   */
  on(listener: EventListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit(event: HandlerEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event)
      } catch {
        // Ignore listener errors
      }
    }
  }

  // ─── Utilities ──────────────────────────────────────────────────────────────

  /**
   * Clear all registered handlers.
   */
  clear(): void {
    this.handlers.clear()
  }
}

/**
 * Create a simple handler context for testing.
 */
export function createTestContext(options: Partial<HandlerContext> = {}): HandlerContext {
  const unknownChanges: Change<unknown>[] = []
  const events: Array<{ event: string; data: unknown }> = []

  return {
    storeUnknown: async (change) => {
      unknownChanges.push(change)
    },
    emit: (event, data) => {
      events.push({ event, data })
    },
    protocolVersion: options.protocolVersion ?? 1,
    isFeatureEnabled: options.isFeatureEnabled ?? (() => true),
    // Expose for testing
    ...({ _unknownChanges: unknownChanges, _events: events } as unknown as object)
  }
}
