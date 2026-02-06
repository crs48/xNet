/**
 * Change Handler Registry - Version-specific handlers for processing changes.
 *
 * This registry allows registering handlers by change type and version range,
 * enabling backward-compatible processing of older change formats.
 *
 * @example
 * ```typescript
 * const registry = new ChangeHandlerRegistry()
 *
 * registry.register({
 *   type: 'yjs-update',
 *   minVersion: 1,
 *   maxVersion: Infinity,
 *   canHandle: (change) => change.type === 'yjs-update',
 *   process: async (change, ctx) => { ... },
 *   validate: (change) => ({ valid: true, errors: [] })
 * })
 *
 * await registry.process(incomingChange, context)
 * ```
 */

import type { Change } from '../change'

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Result of validating a change.
 */
export interface ValidationResult {
  /** Whether the change is valid */
  valid: boolean
  /** Error messages if validation failed */
  errors: string[]
}

/**
 * Context provided to change handlers during processing.
 */
export interface HandlerContext {
  /** Store an unknown change for later processing */
  storeUnknown: (change: Change<unknown>) => Promise<void>
  /** Emit an event */
  emit: (event: string, data: Record<string, unknown>) => void
  /** The author DID of the current user */
  authorDID?: string
}

/**
 * Handler for processing a specific type and version range of changes.
 */
export interface ChangeHandler<T = unknown> {
  /** Change type this handler processes (e.g., 'yjs-update', 'record-create') */
  type: string
  /** Minimum protocol version this handler supports (inclusive) */
  minVersion: number
  /** Maximum protocol version this handler supports (inclusive, use Infinity for latest) */
  maxVersion: number

  /**
   * Check if this handler can process the given change.
   * Called after type and version matching for additional checks.
   */
  canHandle(change: Change<unknown>): boolean

  /**
   * Process the change and apply it to the store/state.
   */
  process(change: Change<T>, context: HandlerContext): Promise<void>

  /**
   * Validate the change structure and content.
   * Should check that all required fields are present and valid.
   */
  validate(change: Change<T>): ValidationResult
}

// ─── Registry ────────────────────────────────────────────────────────────────

/**
 * Registry for version-specific change handlers.
 *
 * Handlers are matched by:
 * 1. Change type (exact match)
 * 2. Protocol version (within handler's min/max range)
 * 3. Optional canHandle() for additional checks
 *
 * If no exact match is found, falls back to the newest handler that
 * can process older versions (for backward compatibility).
 */
export class ChangeHandlerRegistry {
  private handlers = new Map<string, ChangeHandler<unknown>[]>()
  private unknownTypeListeners: Array<(change: Change<unknown>) => void> = []
  private invalidChangeListeners: Array<(change: Change<unknown>, errors: string[]) => void> = []

  /**
   * Register a handler for a change type and version range.
   */
  register<T>(handler: ChangeHandler<T>): void {
    const existing = this.handlers.get(handler.type) ?? []
    existing.push(handler as ChangeHandler<unknown>)
    // Sort by version range (newest first) for efficient lookup
    existing.sort((a, b) => b.maxVersion - a.maxVersion)
    this.handlers.set(handler.type, existing)
  }

  /**
   * Unregister all handlers for a type.
   */
  unregister(type: string): boolean {
    return this.handlers.delete(type)
  }

  /**
   * Get the appropriate handler for a change.
   * Returns null if no handler can process this change.
   */
  getHandler(change: Change<unknown>): ChangeHandler<unknown> | null {
    const handlers = this.handlers.get(change.type)
    if (!handlers || handlers.length === 0) {
      return null
    }

    const version = change.protocolVersion ?? 0

    // First pass: find exact version match
    for (const handler of handlers) {
      if (version >= handler.minVersion && version <= handler.maxVersion) {
        if (handler.canHandle(change)) {
          return handler
        }
      }
    }

    // Second pass: fallback to handlers that accept any future version (maxVersion = Infinity)
    // This allows a handler registered with minVersion=0, maxVersion=Infinity to catch all
    for (const handler of handlers) {
      if (handler.maxVersion === Infinity && handler.minVersion <= version) {
        if (handler.canHandle(change)) {
          return handler
        }
      }
    }

    return null
  }

  /**
   * Check if any handler can process this change.
   */
  canProcess(change: Change<unknown>): boolean {
    return this.getHandler(change) !== null
  }

  /**
   * Process a change using the appropriate handler.
   */
  async process(change: Change<unknown>, context: HandlerContext): Promise<void> {
    const handler = this.getHandler(change)

    if (!handler) {
      // Unknown type - store but don't process
      await context.storeUnknown(change)
      context.emit('unknownChangeType', { change })
      this.notifyUnknownType(change)
      return
    }

    const validation = handler.validate(change)
    if (!validation.valid) {
      context.emit('invalidChange', { change, errors: validation.errors })
      this.notifyInvalidChange(change, validation.errors)
      return
    }

    await handler.process(change, context)
  }

  /**
   * Get all registered handler types.
   */
  getTypes(): string[] {
    return Array.from(this.handlers.keys())
  }

  /**
   * Get handlers for a specific type.
   */
  getHandlersForType(type: string): ChangeHandler<unknown>[] {
    return this.handlers.get(type) ?? []
  }

  /**
   * Subscribe to unknown change type events.
   */
  onUnknownType(listener: (change: Change<unknown>) => void): () => void {
    this.unknownTypeListeners.push(listener)
    return () => {
      const idx = this.unknownTypeListeners.indexOf(listener)
      if (idx !== -1) this.unknownTypeListeners.splice(idx, 1)
    }
  }

  /**
   * Subscribe to invalid change events.
   */
  onInvalidChange(listener: (change: Change<unknown>, errors: string[]) => void): () => void {
    this.invalidChangeListeners.push(listener)
    return () => {
      const idx = this.invalidChangeListeners.indexOf(listener)
      if (idx !== -1) this.invalidChangeListeners.splice(idx, 1)
    }
  }

  /**
   * Clear all registered handlers.
   */
  clear(): void {
    this.handlers.clear()
  }

  // ─── Private Methods ─────────────────────────────────────────────────────

  private notifyUnknownType(change: Change<unknown>): void {
    for (const listener of this.unknownTypeListeners) {
      try {
        listener(change)
      } catch (err) {
        console.error('[ChangeHandlerRegistry] Error in unknownType listener:', err)
      }
    }
  }

  private notifyInvalidChange(change: Change<unknown>, errors: string[]): void {
    for (const listener of this.invalidChangeListeners) {
      try {
        listener(change, errors)
      } catch (err) {
        console.error('[ChangeHandlerRegistry] Error in invalidChange listener:', err)
      }
    }
  }
}

// ─── Default Registry ────────────────────────────────────────────────────────

/**
 * Default global change handler registry instance.
 */
export const changeHandlerRegistry = new ChangeHandlerRegistry()

// ─── Helper Functions ────────────────────────────────────────────────────────

/**
 * Create a simple handler that accepts all versions.
 */
export function createHandler<T>(
  type: string,
  process: (change: Change<T>, context: HandlerContext) => Promise<void>,
  validate?: (change: Change<T>) => ValidationResult
): ChangeHandler<T> {
  return {
    type,
    minVersion: 0,
    maxVersion: Infinity,
    canHandle: () => true,
    process,
    validate: validate ?? (() => ({ valid: true, errors: [] }))
  }
}

/**
 * Create a handler for a specific version range.
 */
export function createVersionedHandler<T>(
  type: string,
  minVersion: number,
  maxVersion: number,
  process: (change: Change<T>, context: HandlerContext) => Promise<void>,
  validate?: (change: Change<T>) => ValidationResult
): ChangeHandler<T> {
  return {
    type,
    minVersion,
    maxVersion,
    canHandle: () => true,
    process,
    validate: validate ?? (() => ({ valid: true, errors: [] }))
  }
}

/**
 * Create a mock context for testing handlers.
 */
export function createTestContext(overrides?: Partial<HandlerContext>): HandlerContext {
  return {
    storeUnknown: async () => {},
    emit: () => {},
    authorDID: 'did:key:test',
    ...overrides
  }
}

// ─── Additional Types (for API consistency) ──────────────────────────────────

/**
 * A validation error with optional context.
 */
export interface ValidationError {
  /** Error code */
  code: string
  /** Human-readable message */
  message: string
  /** Property path if applicable */
  path?: string
}

/**
 * A validation warning (non-fatal issue).
 */
export interface ValidationWarning {
  /** Warning code */
  code: string
  /** Human-readable message */
  message: string
  /** Property path if applicable */
  path?: string
}

/**
 * Events emitted during change processing.
 */
export type HandlerEvent =
  | { type: 'unknownChangeType'; change: Change<unknown> }
  | { type: 'invalidChange'; change: Change<unknown>; errors: string[] }
  | { type: 'processed'; change: Change<unknown>; duration: number }

/**
 * Result of processing a change.
 */
export interface ProcessResult {
  /** Whether processing succeeded */
  success: boolean
  /** Handler that processed the change (if any) */
  handlerType?: string
  /** Processing duration in ms */
  duration: number
  /** Errors if processing failed */
  errors?: string[]
}

/**
 * Statistics about the registry.
 */
export interface RegistryStats {
  /** Number of registered handler types */
  typeCount: number
  /** Total number of handlers */
  handlerCount: number
  /** Types with multiple version-specific handlers */
  versionedTypes: string[]
}
