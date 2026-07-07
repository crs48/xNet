/**
 * @xnetjs/views - Database view components for xNet
 *
 * This package provides view components for rendering database content:
 * - TableView: Spreadsheet-like table with virtual scrolling
 * - BoardView: Kanban board with drag-and-drop
 * - GalleryView: Card gallery with cover images
 * - TimelineView: Gantt timeline with date ranges
 * - CalendarView: Month/week/day calendar
 * - ListView: Simple list with checkbox support
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
  phoneHandler,
  relationHandler
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

// List view
export {
  ListView,
  ListItem,
  useListState,
  type ListViewProps,
  type ListItemProps,
  type ListRow,
  type UseListStateOptions,
  type UseListStateResult
} from './list/index.js'

// Card detail modal
export { CardDetailModal, type CardDetailModalProps } from './card-detail/index.js'

// Database comments
export {
  useDatabaseComments,
  isDatabaseAnchorOrphaned,
  createCellKey,
  parseCellKey,
  type UseDatabaseCommentsOptions,
  type UseDatabaseCommentsResult
} from './hooks/useDatabaseComments.js'

// Shared components
export { CommentIndicator, type CommentIndicatorProps } from './components/index.js'

// Filter builder
export { FilterBuilder, type FilterBuilderProps } from './filter/index.js'

// Relations
export {
  RelationCell,
  RowPickerModal,
  ReverseRelationsPanel,
  type RelationCellProps,
  type RowPickerModalProps,
  type ReverseRelationsPanelProps
} from './relations/index.js'

// Column configuration
export {
  AddColumnModal,
  SelectOptionsEditor,
  getColorBg,
  type AddColumnModalProps,
  type NewColumnDefinition,
  type ColumnConfig,
  type SelectOption,
  type SelectOptionsEditorProps
} from './columns/index.js'

// Schema modals
export {
  SchemaInfoModal,
  type SchemaInfoModalProps,
  CloneSchemaModal,
  type CloneSchemaModalProps
} from './schema/index.js'

// Grid engine (V2 database grid — exploration 0159)
export {
  type GridPos,
  type GridRange,
  type GridRect,
  type GridSelection,
  type GridState,
  type GridCommand,
  type EditingState,
  type CommitReason,
  type MoveDirection,
  type KeyInput,
  rangeToRect,
  isSelected,
  selectionRect,
  createGridState,
  gridReducer,
  type GridAction,
  interpretKeyDown,
  isPrintableKey,
  serializeTsv,
  parseTsv,
  formatCellText,
  coerceCellText,
  type CopyField,
  type PasteField,
  type CoerceResult,
  type GridField,
  type GridFieldOption,
  type GridRowData,
  type CellRef,
  type GridCallbacks,
  GridSurface,
  type GridSurfaceProps,
  GridSummaryBar,
  type GridSummaryBarProps,
  GridCell,
  type GridCellProps,
  GridPeek,
  type GridPeekProps,
  FieldConfigEditor,
  type FieldConfigEditorProps,
  GridSkeleton,
  type GridSkeletonProps,
  GridFieldMenu,
  type GridFieldMenuProps,
  CHANGEABLE_FIELD_TYPES,
  GridHeader,
  type GridHeaderProps,
  GridToolbar,
  type GridToolbarProps,
  type GridViewTab,
  toSurfaceFilter,
  fromSurfaceFilter
} from './grid/index.js'

export {
  TaskBoard,
  TaskListGrouped,
  buildTaskGroups,
  orderTasks,
  PRIORITY_ORDER,
  type TaskBoardProps,
  type TaskBoardItem,
  type TaskBoardStatusChange,
  type TaskListGroupedProps,
  type TaskGroupRef,
  type TaskGroup,
  type TaskGroupBy,
  type TaskOrderBy,
  type BuildTaskGroupsOptions
} from './tasks/index.js'

// Schema-driven forms (exploration 0190)
export {
  schemaToFormFields,
  SchemaForm,
  type FormField,
  type SchemaToFormOptions,
  type SchemaFormProps
} from './form/index.js'

// Shared Data Workspace core (exploration 0276): the saved-view / graph-atlas
// workspace surface both the web and desktop DataWorkspaceViews consume.
export {
  DataWorkspaceBody,
  useDataWorkspace,
  getDefaultSocialWorkspaceSeeds,
  upsertDefaultSocialWorkspace,
  type DataWorkspaceBodyProps,
  type GraphAtlasRow,
  type SavedViewCanvasFrameInput,
  type SavedViewRow,
  type SocialWorkspaceSeedSummary,
  type UseDataWorkspaceOptions,
  type UseDataWorkspaceResult,
  type WorkspaceMetric
} from './data-workspace/index.js'

// Shared CanvasView core (exploration 0277 / 0230 Phase 5): canvas
// capabilities both the web and desktop CanvasViews consume.
export {
  CANVAS_DASHBOARD_SCHEMA_REGISTRY,
  CANVAS_SHORTCUT_HELP_ENTRIES,
  CanvasAliasEditorPanel,
  CanvasCommentComposerPanel,
  CanvasPageStaticPreviewCard,
  CanvasPinnedSourceRecordCard,
  CanvasQueryFrameExecutors,
  CanvasSavedViewQueryFrameExecutor,
  CanvasSelectionHud,
  CanvasShortcutHelpPanel,
  CanvasSourceReferencesPanel,
  CanvasWidgetNodeCard,
  getCanvasQueryFrameTargets,
  parseSavedViewDescriptorForCanvasFrame,
  useCanvasQueryFrames,
  isPeekableCanvasDisplayType,
  shouldActivateDatabasePreviewSurface,
  shouldActivateInlinePageSurface,
  useCanvasCommands,
  useCanvasSourceReferences,
  useCanvasUndoLadder,
  useSelectedSourceReferences,
  type PeekableCanvasDisplayType,
  type CanvasQueryFrameTarget,
  type CanvasSelectionHudProps,
  type CanvasSourceReference,
  type CanvasSourceReferencesPanelProps,
  type CanvasUndoDomain,
  type SavedViewCanvasQueryFrameInput,
  type UseCanvasQueryFramesOptions,
  type UseCanvasQueryFramesResult,
  type UseCanvasUndoLadderOptions,
  type UseCanvasUndoLadderResult,
  createCanvasShellNoteProperties,
  getCanvasShellDisplayType,
  getCanvasShellNotePlacement,
  getCanvasShellPreviewModel,
  getCanvasShellSourceId,
  getCanvasShellSourceType,
  getCanvasViewDisplayType,
  getLinkedDocumentPlacement,
  getShapeLabel,
  isCanvasShellNote,
  isPinnedSourceRecordCard,
  readStringList,
  schemaIdLabel,
  shouldRenderCanvasShellCard,
  stopCanvasCardAction,
  useCanvasViewController,
  type CanvasNodeCardActions,
  type CanvasPageStaticPreviewCardProps,
  type CanvasPinnedSourceRecordCardProps,
  type CanvasResolvedObject,
  type CanvasSelectionPanel,
  type CanvasSelectionPanelCardProps,
  type CanvasShellPreviewModel,
  type CanvasShortcutHelpPanelProps,
  type CanvasViewDisplayType,
  type CanvasViewportSnapshot,
  type CanvasWidgetNodeCardProps,
  type LinkedDocType,
  type LinkedDocumentItem,
  type UseCanvasViewControllerOptions,
  type UseCanvasViewControllerResult
} from './canvas-view/index.js'
