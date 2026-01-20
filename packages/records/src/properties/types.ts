/**
 * @xnet/records - Property Handler Types
 *
 * Defines the PropertyHandler interface that all property types must implement.
 */

import type { PropertyType, PropertyConfig, FilterOperator } from '../types'

/**
 * Result of validating a property value
 */
export interface ValidationResult {
  valid: boolean
  error?: string
}

/**
 * Props for property editor components
 */
export interface PropertyEditorProps<T> {
  value: T | null
  config: PropertyConfig
  onChange: (value: T | null) => void
  onBlur?: () => void
  autoFocus?: boolean
  disabled?: boolean
  placeholder?: string
}

/**
 * Props for property display components
 */
export interface PropertyDisplayProps<T> {
  value: T | null
  config: PropertyConfig
}

/**
 * Handler interface for all property types.
 *
 * Each property type implements this interface to provide:
 * - Validation and coercion
 * - Display formatting
 * - Filtering behavior
 * - Sorting behavior
 * - Serialization for storage
 */
export interface PropertyHandler<T = unknown> {
  /** Property type identifier */
  readonly type: PropertyType

  /**
   * Validate a value against property constraints
   */
  validate(value: unknown, config: PropertyConfig): ValidationResult

  /**
   * Coerce a value to the property's native type.
   * Returns null if coercion is not possible.
   */
  coerce(value: unknown, config: PropertyConfig): T | null

  /**
   * Format a value as a plain text string for display
   */
  format(value: T | null, config: PropertyConfig): string

  /**
   * Get the default value for this property type
   */
  getDefaultValue(config: PropertyConfig): T | null

  /**
   * Check if a value is considered empty
   */
  isEmpty(value: T | null): boolean

  /**
   * Filter operators supported by this property type
   */
  readonly filterOperators: readonly FilterOperator[]

  /**
   * Apply a filter to a value
   */
  applyFilter(
    value: T | null,
    operator: FilterOperator,
    filterValue: unknown,
    config: PropertyConfig
  ): boolean

  /**
   * Compare two values for sorting
   * Returns negative if a < b, positive if a > b, 0 if equal
   */
  compare(a: T | null, b: T | null, config: PropertyConfig): number

  /**
   * Serialize a value for storage (CRDT/JSON)
   */
  serialize(value: T | null): unknown

  /**
   * Deserialize a value from storage
   */
  deserialize(data: unknown): T | null
}

/**
 * Helper to create a property handler with defaults
 */
export function createPropertyHandler<T>(handler: PropertyHandler<T>): PropertyHandler<T> {
  return handler
}
