/**
 * Types for version-specific change handlers.
 *
 * Change handlers process changes based on their type and protocol version,
 * enabling backward compatibility and graceful handling of unknown change types.
 */

import type { Change } from '../change'

// ─── Validation ───────────────────────────────────────────────────────────────

/**
 * Result of validating a change before processing.
 */
export interface ValidationResult {
  /** Whether the change is valid */
  valid: boolean
  /** Validation errors (if any) */
  errors: ValidationError[]
  /** Warnings that don't prevent processing */
  warnings: ValidationWarning[]
}

export interface ValidationError {
  /** Error code for programmatic handling */
  code: string
  /** Human-readable message */
  message: string
  /** Field that failed validation (if applicable) */
  field?: string
}

export interface ValidationWarning {
  /** Warning code */
  code: string
  /** Human-readable message */
  message: string
}

// ─── Handler Context ──────────────────────────────────────────────────────────

/**
 * Context provided to change handlers during processing.
 */
export interface HandlerContext {
  /** Store an unknown change type for future processing */
  storeUnknown(change: Change<unknown>): Promise<void>

  /** Emit an event to listeners */
  emit(event: string, data: unknown): void

  /** Get the current protocol version */
  protocolVersion: number

  /** Check if a feature is enabled */
  isFeatureEnabled(feature: string): boolean
}

// ─── Change Handler ───────────────────────────────────────────────────────────

/**
 * Handler for a specific change type and version range.
 *
 * Handlers are registered with the ChangeHandlerRegistry and selected
 * based on the change's type and protocolVersion.
 */
export interface ChangeHandler<T = unknown> {
  /** The change type this handler processes (e.g., 'node-change', 'yjs-update') */
  type: string

  /** Minimum protocol version this handler supports */
  minVersion: number

  /** Maximum protocol version this handler supports */
  maxVersion: number

  /** Human-readable description of this handler */
  description?: string

  /**
   * Check if this handler can process the given change.
   * Called after version matching to allow additional filtering.
   */
  canHandle(change: Change<unknown>): boolean

  /**
   * Validate a change before processing.
   * Returns errors if the change is malformed or invalid.
   */
  validate(change: Change<T>): ValidationResult

  /**
   * Process a validated change.
   * This is where the actual work happens (applying to storage, updating state, etc.)
   */
  process(change: Change<T>, context: HandlerContext): Promise<void>

  /**
   * Optional: Transform a change from an older format to the handler's expected format.
   * Called when processing changes from older protocol versions.
   */
  upgrade?(change: Change<unknown>): Change<T>
}

// ─── Handler Events ───────────────────────────────────────────────────────────

/**
 * Events emitted by the handler registry.
 */
export type HandlerEvent =
  | { type: 'unknown-change-type'; change: Change<unknown> }
  | { type: 'invalid-change'; change: Change<unknown>; errors: ValidationError[] }
  | { type: 'handler-error'; change: Change<unknown>; error: Error }
  | { type: 'change-processed'; change: Change<unknown>; handlerType: string }
