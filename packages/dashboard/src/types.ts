/**
 * @xnetjs/dashboard - The widget contract (docs/explorations/0162).
 *
 * A widget is manifest + config schema + query + renderer. Widgets never
 * touch the store directly: they declare a serialized query descriptor
 * (SavedViewDescriptor), the dashboard runtime executes it reactively via
 * useSavedView, and the renderer receives rows/aggregates as props. The same
 * contract is hosted by the dashboard grid and (via the canvas adapter) by
 * canvas widget objects.
 */

import type {
  DashboardWidgetRefresh,
  QueryASTAggregateExecution,
  SavedViewDescriptor
} from '@xnetjs/data'
import type { ComponentType } from 'react'

export type {
  Dashboard,
  DashboardBreakpointId,
  DashboardLayoutItem,
  DashboardLayouts,
  DashboardTimeRange,
  DashboardVariablesState,
  DashboardWidgetInstance,
  DashboardWidgetRefresh
} from '@xnetjs/data'

/**
 * Trust tier assigned by the host from the widget's install source — never
 * self-declared. First-party widgets render in the host realm; user-authored
 * widgets run in a SES Compartment inside a Web Worker; marketplace widgets
 * run in a sandboxed iframe / Electron webview.
 */
export type WidgetTrustTier = 'first-party' | 'user' | 'marketplace'

/**
 * Configuration field types. Mirrors ViewConfigField
 * (packages/views/src/registry.ts) so config editor machinery stays shared
 * between views and widgets; adds 'color' for chart styling.
 */
export type WidgetConfigFieldType =
  | 'property-select'
  | 'select'
  | 'number'
  | 'checkbox'
  | 'text'
  | 'color'

/** A configuration field driving the auto-generated widget config editor. */
export interface WidgetConfigField {
  /** Field key in the widget instance config */
  key: string
  /** Display label */
  label: string
  /** Field type */
  type: WidgetConfigFieldType
  /** Options for 'select' type */
  options?: Array<{ label: string; value: string }>
  /** Whether the field is required */
  required?: boolean
  /** Help text */
  description?: string
  /** Default value */
  defaultValue?: unknown
}

/**
 * A widget instance's data binding. Reuses the existing serialized query
 * layer — no new query language.
 */
export interface WidgetDataRequest {
  /** Serialized query executed reactively by the runtime */
  descriptor: SavedViewDescriptor
  /** Refresh policy (default 'live') */
  refresh?: DashboardWidgetRefresh
  /**
   * Date/number field the dashboard time-range variable constrains. When set
   * and the dashboard has an active time range, the runtime injects a
   * `between [start, end]` predicate on this field before execution.
   */
  timeField?: string
}

/** Reactive query results handed to a widget renderer. */
export interface WidgetData {
  /** Rows from the primary query (FlatNode-shaped: properties at top level) */
  rows: Array<Record<string, unknown> & { id: string }>
  /** Aggregate results keyed by alias, when the query declares aggregates */
  aggregates: QueryASTAggregateExecution | null
  /** Rows per query id for query-set descriptors */
  queries: Record<string, Array<Record<string, unknown> & { id: string }>>
  /** Whether the primary query is still loading */
  loading: boolean
  /** Query execution error, if any */
  error: Error | null
}

/** Props every widget renderer receives. */
export interface WidgetProps<C = Record<string, unknown>> {
  /** Widget instance config (validated by configFields) */
  config: C
  /** Reactive query results */
  data: WidgetData
  /** Tile content width in pixels */
  width: number
  /** Tile content height in pixels */
  height: number
  /**
   * Dashboard-level variables, already interpolated into the query; exposed
   * for renderers that display them (e.g. a time-range label).
   */
  variables: Readonly<Record<string, unknown>>
  /** Persist a config change (present when the host allows editing) */
  onConfigChange?: (next: Partial<C>) => void
  /** Open a node in its full surface (provided by the host app) */
  onOpenNode?: (nodeId: string, schemaId: string) => void
}

/** Context handed to getStubConfig so widgets can pick sensible defaults. */
export interface WidgetStubContext {
  /** Schema IRIs available in the runtime's schema registry */
  schemas: string[]
}

/** Default tile size in 12-column grid units. */
export interface WidgetDefaultSize {
  w: number
  h: number
  minW?: number
  minH?: number
}

/**
 * A widget type: manifest + config schema + stub + renderer.
 *
 * Registered in the WidgetRegistry by built-ins, plugins
 * (WidgetContribution), and user-authored widgets.
 */
export interface WidgetDefinition<C = Record<string, unknown>> {
  /** Registry key, e.g. 'chart.bar', 'metric.count', 'feed.social' */
  type: string
  /** Display name shown in the widget picker */
  name: string
  /** Lucide icon name or component */
  icon: string | ComponentType
  /** Short description for the picker */
  description?: string
  /** Trust tier assigned by the host */
  trustTier: WidgetTrustTier
  /** Drives the auto-generated config editor */
  configFields: WidgetConfigField[]
  /** Default + minimum tile size in grid units */
  defaultSize: WidgetDefaultSize
  /** Sensible defaults so a freshly added widget renders immediately */
  getStubConfig: (ctx: WidgetStubContext) => { config: C; query?: WidgetDataRequest }
  /** The renderer */
  component: ComponentType<WidgetProps<C>>
}

/** Erased definition stored in the registry. */
export type AnyWidgetDefinition = WidgetDefinition<Record<string, unknown>>
