/**
 * DashboardSchema - A composable grid of live data widgets.
 *
 * Dashboards are a dedicated surface (distinct from canvases): a 12-column
 * responsive grid of widget instances, each declaring a serialized query
 * (SavedViewDescriptor) executed reactively by the dashboard runtime.
 * Widget arrangement is stored as per-breakpoint {x, y, w, h} layout maps in
 * column units, so the same dashboard reflows from desktop to a single-column
 * mobile stack (docs/explorations/0162).
 *
 * The json properties merge whole-value LWW (same semantics as
 * DatabaseViewSchema / TaskViewSchema) — concurrent edits to the widget list
 * or layout resolve to the last writer.
 */

import type { SavedViewDescriptor } from '../../store/query-ast'
import type { InferNode } from '../types'
import { defineSchema } from '../define'
import { json, relation, text } from '../properties'

/** Refresh policy for a widget's query subscription. */
export type DashboardWidgetRefresh = 'live' | 'on-open' | { intervalMs: number }

/**
 * One widget placed on a dashboard. The widgetType is a key into the
 * dashboard widget registry; config is validated by that widget's
 * configFields; query is the serialized data binding executed by the runtime.
 */
export interface DashboardWidgetInstance {
  /** Stable instance id (also the layout item id) */
  id: string
  /** Widget registry key, e.g. 'metric.count', 'chart.bar', 'view.saved' */
  widgetType: string
  /** Widget-specific configuration validated by the widget's configFields */
  config: Record<string, unknown>
  /** Serialized query descriptor executed reactively by the runtime */
  query?: SavedViewDescriptor
  /** Refresh policy (default: 'live') */
  refresh?: DashboardWidgetRefresh
  /**
   * Date/number field constrained by the dashboard time-range variable.
   * When set, the runtime injects `timeField between [start, end]` into the
   * query before execution.
   */
  timeField?: string
}

/**
 * Breakpoint identifiers for per-breakpoint layouts. 'xs' is the degenerate
 * single-column mobile breakpoint.
 */
export type DashboardBreakpointId = 'lg' | 'md' | 'sm' | 'xs'

/** One tile position in 12-column grid units. */
export interface DashboardLayoutItem {
  /** Matching DashboardWidgetInstance id */
  id: string
  x: number
  y: number
  w: number
  h: number
}

/** Per-breakpoint layout maps. Missing breakpoints derive from 'lg'. */
export type DashboardLayouts = Partial<Record<DashboardBreakpointId, DashboardLayoutItem[]>>

/** Serialized time-range variable: a named preset or an absolute range. */
export type DashboardTimeRange =
  | { kind: 'preset'; preset: 'today' | '7d' | '30d' | '90d' | 'all' }
  | { kind: 'absolute'; start: number; end: number }

/**
 * Dashboard-level variable scope interpolated into widget queries
 * (Grafana-style template variables). v1 ships timeRange; custom holds
 * user-defined scalar variables referenced as $name placeholders.
 */
export interface DashboardVariablesState {
  timeRange?: DashboardTimeRange
  custom?: Record<string, string | number | boolean | null>
}

export const DashboardSchema = defineSchema({
  name: 'Dashboard',
  namespace: 'xnet://xnet.fyi/',
  properties: {
    /** Dashboard title */
    title: text({ required: true, maxLength: 500 }),

    /** Emoji or icon URL */
    icon: text({}),

    /** Dashboard variable scope (time range, custom vars) — whole-value LWW */
    variables: json<DashboardVariablesState>({}),

    /** Widget instances placed on this dashboard — whole-list LWW */
    widgets: json<DashboardWidgetInstance[]>({}),

    /** Per-breakpoint {x, y, w, h} layout maps — whole-value LWW */
    layouts: json<DashboardLayouts>({}),

    /** Canonical home; empty = Unfiled (exploration 0169) */
    folder: relation({ target: 'xnet://xnet.fyi/Folder@1.0.0' as const }),

    /** Order among folder siblings — fractional index */
    sortKey: text({ maxLength: 500 }),

    /** Workspace-wide labels, referenced by id (exploration 0169) */
    tags: relation({ target: 'xnet://xnet.fyi/Tag@1.0.0' as const, multiple: true })
  }
})

/**
 * A Dashboard node type (inferred from schema).
 */
export type Dashboard = InferNode<(typeof DashboardSchema)['_properties']>
