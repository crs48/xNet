/**
 * @xnetjs/react/database - Experimental database hooks
 */

export {
  useDatabaseDoc,
  type UseDatabaseDocResult,
  type ColumnDefinition,
  type ColumnType,
  type ColumnConfig,
  type ViewConfig,
  type ViewType
} from './hooks/useDatabaseDoc'
export {
  useDatabase,
  type UseDatabaseOptions,
  type UseDatabaseResult,
  type DatabaseRow
} from './hooks/useDatabase'
export {
  useDatabaseRow,
  type UseDatabaseRowResult,
  type DatabaseRowData
} from './hooks/useDatabaseRow'
export { useCell, type UseCellResult, type UseCellOptions } from './hooks/useCell'
export { useRelatedRows, type UseRelatedRowsResult } from './hooks/useRelatedRows'
export {
  useReverseRelations,
  type ReverseRelation,
  type UseReverseRelationsResult
} from './hooks/useReverseRelations'
export { useDatabaseSchema, type UseDatabaseSchemaResult } from './hooks/useDatabaseSchema'
