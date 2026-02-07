/**
 * @xnet/data/database - Database row operations and cell types
 *
 * This module provides the core data model for Notion-like databases:
 * - DatabaseRow nodes with per-cell LWW conflict resolution
 * - Cell value types and utilities
 * - Rich text cell support via Y.Doc
 * - Row CRUD operations
 */

// Cell types and utilities
export {
  type CellValue,
  type FileRef,
  type DateRange,
  CELL_PREFIX,
  cellKey,
  isCellKey,
  columnIdFromKey,
  toCellProperties,
  fromCellProperties,
  isDateRange,
  isFileRef,
  isCellValue
} from './cell-types'

// Row operations
export {
  type CreateRowOptions,
  type QueryRowsOptions,
  type QueryRowsResult,
  type DatabaseRowNode,
  createRow,
  updateCell,
  updateCells,
  deleteRow,
  getRow,
  queryRows,
  moveRow
} from './row-operations'

// Rich text cell support
export {
  type ColumnType,
  type ColumnDefinition,
  RICHTEXT_PREFIX,
  getRichTextCell,
  hasRichTextContent,
  hasRichTextColumns,
  getRichTextColumnIds,
  deleteRichTextCell,
  getRichTextPlainText
} from './rich-text-cell'
