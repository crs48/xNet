/**
 * @xnet/views - Database view components for xNet
 *
 * This package provides view components for rendering database content:
 * - TableView: Spreadsheet-like table with virtual scrolling
 * - BoardView: Kanban board (coming soon)
 * - GalleryView: Card gallery (coming soon)
 * - TimelineView: Gantt timeline (coming soon)
 * - CalendarView: Calendar (coming soon)
 */

// Types
export type {
  ViewType,
  ViewConfig,
  SortConfig,
  FilterOperator,
  Filter,
  FilterGroup,
  PropertyHandler,
  PropertyEditorProps,
  FilterInputProps,
  ColumnMeta
} from './types.js'

// Property handlers
export { getPropertyHandler } from './properties/index.js'
export {
  textHandler,
  numberHandler,
  checkboxHandler,
  dateHandler,
  selectHandler,
  multiSelectHandler,
  urlHandler,
  emailHandler,
  phoneHandler
} from './properties/index.js'

// Table view
export {
  TableView,
  TableHeader,
  TableCell,
  useTableState,
  type TableViewProps,
  type TableHeaderProps,
  type TableCellProps,
  type TableRow,
  type UseTableStateOptions,
  type UseTableStateResult
} from './table/index.js'
