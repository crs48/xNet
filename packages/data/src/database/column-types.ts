/**
 * Column type definitions for database columns.
 *
 * Columns are stored in the database's Y.Doc as a Y.Array of Y.Maps,
 * enabling CRDT-based ordering and real-time schema sync.
 */

// ─── Column Types ─────────────────────────────────────────────────────────────

/**
 * All supported column types.
 */
export type ColumnType =
  // Simple types (stored in NodeStore)
  | 'text'
  | 'number'
  | 'checkbox'
  | 'date'
  | 'dateRange'
  | 'select'
  | 'multiSelect'
  | 'person'
  | 'url'
  | 'email'
  | 'phone'
  | 'file'
  // Relation types
  | 'relation'
  // Computed types
  | 'rollup'
  | 'formula'
  // Rich types (stored in Y.Doc)
  | 'richText'
  // Auto types
  | 'created'
  | 'createdBy'
  | 'updated'
  | 'updatedBy'

/**
 * Column definition stored in the database's Y.Doc.
 */
export interface ColumnDefinition {
  /** Unique column ID (nanoid) */
  id: string

  /** Display name */
  name: string

  /** Column type */
  type: ColumnType

  /** Type-specific configuration */
  config: ColumnConfig

  /** Width in pixels (for table view) */
  width?: number

  /** Whether this is the title column */
  isTitle?: boolean
}

// ─── Column Configs ───────────────────────────────────────────────────────────

/**
 * Union of all column configuration types.
 */
export type ColumnConfig =
  | TextColumnConfig
  | NumberColumnConfig
  | SelectColumnConfig
  | RelationColumnConfig
  | RollupColumnConfig
  | FormulaColumnConfig
  | DateColumnConfig
  | FileColumnConfig
  | EmptyConfig

/**
 * Empty config for simple types with no configuration.
 */
export type EmptyConfig = Record<string, never>

/**
 * Text column configuration.
 */
export interface TextColumnConfig {
  /** Maximum length (optional) */
  maxLength?: number
}

/**
 * Number column configuration.
 */
export interface NumberColumnConfig {
  /** Number format */
  format?: 'number' | 'percent' | 'currency'
  /** Currency code (if format is currency) */
  currency?: string
  /** Decimal places */
  precision?: number
}

/**
 * Select/MultiSelect column configuration.
 */
export interface SelectColumnConfig {
  /** Available options */
  options: SelectOption[]
  /** Allow creating new options inline */
  allowCreate?: boolean
}

/**
 * A single select option.
 */
export interface SelectOption {
  id: string
  name: string
  color?: SelectColor
}

/**
 * Available colors for select options.
 */
export type SelectColor =
  | 'gray'
  | 'brown'
  | 'orange'
  | 'yellow'
  | 'green'
  | 'blue'
  | 'purple'
  | 'pink'
  | 'red'

/**
 * Relation column configuration.
 */
export interface RelationColumnConfig {
  /** Target database ID */
  targetDatabase: string
  /** Allow multiple relations */
  allowMultiple?: boolean
}

/**
 * Rollup column configuration.
 */
export interface RollupColumnConfig {
  /** Column ID of the relation to aggregate */
  relationColumn: string
  /** Column ID on related rows to aggregate */
  targetColumn: string
  /** Aggregation function */
  aggregation: RollupAggregation
}

/**
 * Available rollup aggregation functions.
 */
export type RollupAggregation =
  | 'sum'
  | 'avg'
  | 'count'
  | 'min'
  | 'max'
  | 'concat'
  | 'unique'
  | 'empty'
  | 'notEmpty'
  | 'percentEmpty'
  | 'percentNotEmpty'

/**
 * Formula column configuration.
 */
export interface FormulaColumnConfig {
  /** Formula expression with {{columnId}} references */
  expression: string
  /** Result type */
  resultType: 'text' | 'number' | 'date' | 'checkbox'
}

/**
 * Date column configuration.
 */
export interface DateColumnConfig {
  /** Include time */
  includeTime?: boolean
  /** Date format */
  format?: 'full' | 'short' | 'relative'
}

/**
 * File column configuration.
 */
export interface FileColumnConfig {
  /** Accepted MIME types */
  accept?: string[]
  /** Allow multiple files */
  allowMultiple?: boolean
}

// ─── Type Guards ──────────────────────────────────────────────────────────────

/**
 * Check if a column type stores data in NodeStore (vs Y.Doc).
 */
export function isNodeStoreColumnType(type: ColumnType): boolean {
  const nodeStoreTypes: ColumnType[] = [
    'text',
    'number',
    'checkbox',
    'date',
    'dateRange',
    'select',
    'multiSelect',
    'person',
    'url',
    'email',
    'phone',
    'file',
    'relation'
  ]
  return nodeStoreTypes.includes(type)
}

/**
 * Check if a column type is computed (formula/rollup).
 */
export function isComputedColumnType(type: ColumnType): boolean {
  return type === 'formula' || type === 'rollup'
}

/**
 * Check if a column type is auto-populated.
 */
export function isAutoColumnType(type: ColumnType): boolean {
  return type === 'created' || type === 'createdBy' || type === 'updated' || type === 'updatedBy'
}

/**
 * Check if a column type uses Y.Doc for storage.
 */
export function isYDocColumnType(type: ColumnType): boolean {
  return type === 'richText'
}
