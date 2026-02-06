/**
 * Version-specific change handlers.
 *
 * This module provides a registry for change handlers that can process
 * changes based on their type and protocol version, enabling backward
 * compatibility and graceful handling of unknown change types.
 */

export type {
  ChangeHandler,
  HandlerContext,
  ValidationResult,
  ValidationError,
  ValidationWarning,
  HandlerEvent
} from './types'

export {
  ChangeHandlerRegistry,
  createTestContext,
  type ProcessResult,
  type RegistryStats
} from './registry'
