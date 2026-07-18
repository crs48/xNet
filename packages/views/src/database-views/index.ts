/**
 * V2 database views (exploration 0337) — feature-area sub-barrel.
 * The root barrel re-exports this area as ONE grouped block (0276 rule).
 */

export {
  EMPTY_VIEW_CONFIG,
  firstFieldOfType,
  resolveCoverField,
  resolveDateField,
  resolveEndDateField,
  resolveGeoFields,
  resolveGroupField,
  rowTitle,
  type CardSize,
  type CoverFit,
  type DatabaseViewConfig,
  type DatabaseViewProps,
  type DatabaseViewRow,
  type DatabaseViewWindow
} from './contract.js'

export {
  UNGROUPED_KEY,
  buildGroups,
  dropCardSortKey,
  moveCellValue,
  orderRowsBySortKey,
  type ViewGroup
} from './group-model.js'

export {
  formatDayLabel,
  parseDateCell,
  parseDateRangeCell,
  rowDateSpan,
  shiftSpan,
  spanDays,
  toDateCell
} from './date-model.js'

export {
  buildMonthGrid,
  eventsInRange,
  overflowByDay,
  packWeekSegments,
  type CalendarEvent,
  type MonthGrid,
  type WeekSegment
} from './calendar-model.js'

export {
  ZOOMS,
  barGeometry,
  dayOffsetPx,
  deltaDays,
  majorTicks,
  minorTicks,
  pxPerDay,
  timelineItems,
  timelineRange,
  type TimelineItem,
  type TimelineRange,
  type TimelineTick,
  type TimelineZoom
} from './timeline-model.js'

export { MAX_MAP_PINS, defaultViewportFor, rowsToGeoJSON } from './map-model.js'

export { BoardView } from './BoardView.js'
export { GalleryView } from './GalleryView.js'
export { CalendarView } from './CalendarView.js'
export { TimelineView } from './TimelineView.js'
export { ListView } from './ListView.js'
export { DatabaseMapView } from './DatabaseMapView.js'
export { ViewOptionsBar, type ViewOptionsBarProps } from './ViewOptionsBar.js'
export { FieldValueChip, WindowFootnote, firstFileRef, useFileUrl } from './card-bits.js'
