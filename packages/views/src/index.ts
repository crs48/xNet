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
  SortConfig,
  FilterOperator,
  Filter,
  FilterGroup,
  PropertyHandler,
  PropertyEditorProps,
  FilterInputProps,
  ColumnMeta,
  CellPresence
} from './types.js'

// Property handlers
export {
  getPropertyHandler,
  registerPropertyHandler,
  onPropertyHandlersChange,
  getRegisteredPropertyTypes
} from './properties/index.js'

// View Registry (V2 contract — exploration 0339)
export {
  ViewRegistry,
  viewRegistry,
  type ViewRegistration,
  type ViewConfigField,
  type Platform as ViewPlatform
} from './registry.js'

// Built-in views registration
export { registerBuiltinViews, getBuiltinViews } from './builtins.js'

// View Registry Hook
export { useViewRegistry, type UseViewRegistryResult } from './hooks/useViewRegistry.js'

// View Renderer
export { ViewRenderer, type ViewRendererProps } from './ViewRenderer.js'

// V2 database views (exploration 0339): board / gallery / calendar /
// timeline / list / map on the grid data model — ONE grouped area block.
export {
  BoardView,
  CalendarView,
  DatabaseMapView,
  OPENFREEMAP_LIBERTY_STYLE,
  configureDatabaseMapTiles,
  GalleryView,
  ListView,
  TimelineView,
  ViewOptionsBar,
  EMPTY_VIEW_CONFIG,
  UNGROUPED_KEY,
  buildGroups,
  dropCardSortKey,
  moveCellValue,
  orderRowsBySortKey,
  parseDateCell,
  parseDateRangeCell,
  rowDateSpan,
  toDateCell,
  buildMonthGrid,
  eventsInRange,
  overflowByDay,
  packWeekSegments,
  timelineItems,
  timelineRange,
  rowsToGeoJSON,
  defaultViewportFor,
  MAX_MAP_PINS,
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
  type DatabaseViewWindow,
  type TimelineZoom,
  type ViewGroup,
  type ViewOptionsBarProps
} from './database-views/index.js'
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

// Attachments (exploration 0385) — ONE grouped area block
export {
  AttachmentLightbox,
  type AttachmentLightboxProps,
  type AttachmentLightboxRequest,
  AttachmentLightboxProvider,
  type AttachmentLightboxProviderProps,
  useAttachmentLightbox,
  type OpenAttachmentLightbox
} from './attachments/index.js'

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

// Form view (exploration 0278): database-as-form; submissions become rows
export {
  FormBuilder,
  FormFillView,
  FormView,
  formFieldsToColumns,
  EMPTY_FORM_CONFIG,
  type FormBuilderProps,
  type FormFillViewProps,
  type FormViewProps
} from './form-view/index.js'

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

// Shared meeting recorder core (exploration 0279): the botless meeting
// capture/list/detail/settings surfaces both the web and desktop apps consume.
export {
  IpcDictationEngine,
  MEETINGS_CONSENT_STORAGE_KEY,
  MEETINGS_STORAGE_KEYS,
  MeetingDetailView,
  MeetingEngineSettings,
  MeetingRecorderView,
  MeetingsListView,
  MeetingTranscriptChat,
  appendAiNotesToDoc,
  appendMarkdownToDoc,
  buildMeetingEngineRegistry,
  describeCapturePreflight,
  extractDocText,
  getCapturePreflight,
  getMeetingsBridge,
  readMeetingConsentSettings,
  readMeetingEnginePrefs,
  startMicCapture,
  startSystemCapture,
  writeMeetingConsentSettings,
  writeMeetingEnginePref,
  type CapturePreflight,
  type MeetingDetailViewProps,
  type MeetingRecorderViewProps,
  type MeetingsBridge,
  type MeetingsBridgeEngine,
  type MeetingsCaptureStatus,
  type MeetingsListViewProps,
  type MeetingsPermissions,
  type MeetingTranscriptChatProps
} from './meeting-recorder/index.js'

// Frames — the compositional unit (0346): FrameDef contract, renderer +
// source registry, container adapters, dashboard frame widget.
export {
  FRAME_MAX_DEPTH,
  FRAME_WIDGET_TYPE,
  FrameHostProvider,
  FrameRenderer,
  FrameSourceRegistry,
  SealedFrame,
  createFrameWidgetDefinition,
  frameFromCanvasNode,
  frameFromDatabaseEmbed,
  frameFromPageEmbed,
  frameSetSignature,
  frameSourceRegistry,
  orderForStack,
  parseCollectionIds,
  registerFrameWidget,
  toggleGeometry,
  useFrameAncestry,
  useFrameDepth,
  useFrameHost,
  withLayoutDefaults,
  type FrameDef,
  type FrameHost,
  type FrameRendererProps,
  type FrameSource,
  type FrameSourceRenderer,
  type FrameTier,
  type FrameWidgetConfig,
  type NodeFrameProps,
  type PageGeometry
} from './frames/index.js'
