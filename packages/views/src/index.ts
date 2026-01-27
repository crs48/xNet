/**
 * @xnet/views - Database view components for xNet
 *
 * This package provides view components for rendering database content:
 * - TableView: Spreadsheet-like table with virtual scrolling
 * - BoardView: Kanban board with drag-and-drop
 * - GalleryView: Card gallery (coming soon)
 * - TimelineView: Gantt timeline (coming soon)
 * - CalendarView: Calendar (coming soon)
 */

// Types
export type {
  Disposable,
  ViewType,
  ViewConfig,
  SortConfig,
  FilterOperator,
  Filter,
  FilterGroup,
  PropertyHandler,
  PropertyEditorProps,
  FilterInputProps,
  ColumnMeta,
  CellPresence,
  GalleryCardSize,
  GalleryImageFit
} from './types.js'

// Property handlers
export {
  getPropertyHandler,
  registerPropertyHandler,
  onPropertyHandlersChange,
  getRegisteredPropertyTypes
} from './properties/index.js'

// View Registry
export {
  ViewRegistry,
  viewRegistry,
  type ViewRegistration,
  type ViewProps,
  type ViewRow,
  type ViewConfigField,
  type ViewConfigFieldType,
  type Platform as ViewPlatform
} from './registry.js'

// Built-in views registration
export { registerBuiltinViews, getBuiltinViews } from './builtins.js'

// View Registry Hook
export { useViewRegistry, type UseViewRegistryResult } from './hooks/useViewRegistry.js'

// View Renderer
export { ViewRenderer, type ViewRendererProps } from './ViewRenderer.js'
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
  type ColumnUpdate,
  type UseTableStateOptions,
  type UseTableStateResult
} from './table/index.js'

// Board view
export {
  BoardView,
  BoardColumn,
  BoardCard,
  useBoardState,
  type BoardViewProps,
  type BoardColumnProps,
  type BoardCardProps,
  type BoardRow,
  type BoardColumnType,
  type UseBoardStateOptions,
  type UseBoardStateResult
} from './board/index.js'

// Gallery view
export {
  GalleryView,
  GalleryCard,
  useGalleryState,
  CARD_SIZES,
  type GalleryViewProps,
  type GalleryCardProps,
  type GalleryRow,
  type UseGalleryStateOptions,
  type UseGalleryStateResult
} from './gallery/index.js'

// Timeline view
export {
  TimelineView,
  TimelineBar,
  useTimelineState,
  getDatePosition,
  getDateWidth,
  ZOOM_CONFIGS,
  type TimelineViewProps,
  type TimelineBarProps,
  type TimelineRow,
  type TimelineItem,
  type TimelineRange,
  type ZoomLevel,
  type ZoomConfig,
  type UseTimelineStateOptions as UseTimelineStateOptions,
  type UseTimelineStateResult as UseTimelineStateResult
} from './timeline/index.js'

// Calendar view
export {
  CalendarView,
  CalendarMonthView,
  CalendarWeekView,
  CalendarDayView,
  useCalendarState,
  isSameDay,
  getWeekStart,
  getMonthWeeks,
  getDayNames,
  formatCurrentDate,
  getHours,
  formatHour,
  type CalendarViewProps,
  type CalendarMonthViewProps,
  type CalendarWeekViewProps,
  type CalendarDayViewProps,
  type CalendarRow,
  type CalendarEvent,
  type CalendarViewMode,
  type WeekStartDay,
  type UseCalendarStateOptions,
  type UseCalendarStateResult
} from './calendar/index.js'

// Card detail modal
export { CardDetailModal, type CardDetailModalProps } from './card-detail/index.js'
