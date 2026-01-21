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
  GalleryCardSize,
  GalleryImageFit
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
