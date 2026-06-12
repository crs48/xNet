/**
 * @xnetjs/dashboard - Dashboard builder with pluggable widgets
 * (docs/explorations/0162).
 */

// Widget contract
export type {
  AnyWidgetDefinition,
  Dashboard,
  DashboardBreakpointId,
  DashboardLayoutItem,
  DashboardLayouts,
  DashboardTimeRange,
  DashboardVariablesState,
  DashboardWidgetInstance,
  DashboardWidgetRefresh,
  WidgetConfigField,
  WidgetConfigFieldType,
  WidgetData,
  WidgetDataRequest,
  WidgetDefaultSize,
  WidgetDefinition,
  WidgetProps,
  WidgetStubContext,
  WidgetTrustTier
} from './types'

// Registry
export { WidgetRegistry, widgetRegistry, type Disposable } from './registry'

// Variables / interpolation
export {
  interpolateDescriptor,
  resolveTimeRange,
  resolveVariables,
  type ResolvedTimeRange
} from './variables'

// Layout
export { DASHBOARD_COLUMNS, applyLayoutChanges, placeWidget, resolveLayout } from './layout'

// Runtime
export {
  DashboardRuntimeProvider,
  useDashboardRuntime,
  type DashboardRuntimeValue
} from './runtime/context'
export { useWidgetData } from './runtime/useWidgetData'

// Built-in widgets
export { registerBuiltinWidgets } from './widgets/builtins'
export { metricWidget, type MetricWidgetConfig } from './widgets/metric-widget'
export { taskListWidget, type TaskListWidgetConfig } from './widgets/task-list-widget'
export { savedViewWidget, type SavedViewWidgetConfig } from './widgets/saved-view-widget'
export { pageLinksWidget, type PageLinksWidgetConfig } from './widgets/page-links-widget'
export { recentItemsWidget, type RecentItemsWidgetConfig } from './widgets/recent-items-widget'

// Plugin bridge
export {
  connectWidgetContributions,
  summarizePluginPermissions,
  widgetDefinitionFromContribution,
  type WidgetContributionSource
} from './plugins'

// Sandbox tiers (phase 4)
export { renderSafeNode, SAFE_NODE_TAGS, type SafeNode } from './sandbox/safe-node'
export {
  evaluateUserWidget,
  lockdownRealm,
  renderUserWidget,
  type UserWidgetRenderFn,
  type UserWidgetRenderProps
} from './sandbox/compartment'
export { UserWidgetHost, type UserWidgetHostProps } from './sandbox/UserWidgetHost'
export { IframeWidgetHost, type IframeWidgetHostProps } from './sandbox/IframeWidgetHost'
export {
  DEFAULT_USER_WIDGET_CODE,
  USER_WIDGET_TYPE_PREFIX,
  UserWidgetEditor,
  userWidgetDefinition,
  useUserWidgets,
  type UserWidgetEditorProps
} from './sandbox/user-widgets'

// Canvas host
export {
  CANVAS_WIDGET_KIND,
  CanvasWidgetCard,
  createCanvasWidgetNodeProperties,
  widgetInstanceFromCanvasNode,
  type CanvasWidgetCardProps,
  type CanvasWidgetNodeLike
} from './canvas/CanvasWidgetCard'
export {
  widgetInstanceFromQueryFrame,
  type QueryFrameDefinitionLike
} from './canvas/query-frame-adapter'

// Components
export { DashboardGrid, type DashboardGridProps } from './components/DashboardGrid'
export { DashboardSurface, type DashboardSurfaceProps } from './components/DashboardSurface'
export {
  DashboardVariablesBar,
  type DashboardVariablesBarProps
} from './components/DashboardVariablesBar'
export { WidgetConfigPanel, type WidgetConfigPanelProps } from './components/WidgetConfigPanel'
export {
  WidgetPicker,
  useRegisteredWidgets,
  type WidgetPickerProps
} from './components/WidgetPicker'
export {
  WidgetTile,
  WidgetTileBody,
  type WidgetTileBodyProps,
  type WidgetTileProps
} from './components/WidgetTile'
