/**
 * Dashboard builder — typed factories that produce real, runtime-executable
 * dashboard widgets bound to seeded data, plus a responsive grid layout.
 *
 * Each widget carries a `SavedViewDescriptor` (`{version:1, title, query}`) the
 * dashboard runtime executes via `useSavedView`. Widget types + config shapes
 * mirror the built-in widgets in `@xnetjs/dashboard` (metric.count, chart.*,
 * view.saved, list.tasks, links.pages, heatmap.streak).
 */

import { ObservationSchema, PageSchema, TaskSchema } from '@xnetjs/data'
import type {
  DashboardLayoutItem,
  DashboardLayouts,
  DashboardVariablesState,
  DashboardWidgetInstance,
  QueryASTNodeQuery,
  SavedViewDescriptor
} from '@xnetjs/data'
import { seedId } from '../seed-ids'

const TASK = TaskSchema._schemaId
const PAGE = PageSchema._schemaId
const OBSERVATION = ObservationSchema._schemaId

/** Build a QueryAST node query (matches @xnetjs/dashboard's widget helper). */
function nodeQuery(
  schemaId: string,
  options: {
    orderBy?: Array<{ field: string; direction: 'asc' | 'desc' }>
    first?: number
    aggregates?: Array<{
      alias: string
      function: 'count' | 'sum' | 'avg' | 'min' | 'max'
      field?: string
    }>
  } = {}
): QueryASTNodeQuery {
  return {
    version: 1,
    kind: 'node',
    schemaId: schemaId as QueryASTNodeQuery['schemaId'],
    ...(options.orderBy ? { orderBy: options.orderBy } : {}),
    ...(options.first ? { page: { first: options.first } } : {}),
    ...(options.aggregates
      ? { aggregates: options.aggregates.map((agg) => ({ kind: 'aggregate' as const, ...agg })) }
      : {})
  } as QueryASTNodeQuery
}

const descriptor = (title: string, query: QueryASTNodeQuery): SavedViewDescriptor => ({
  version: 1,
  title,
  query
})

/** A widget + its default grid size. */
export interface WidgetSpec {
  widget: DashboardWidgetInstance
  w: number
  h: number
}

const wid = (slug: string) => seedId('widget', slug)

export function metricCount(slug: string, label: string, schemaId: string): WidgetSpec {
  return {
    widget: {
      id: wid(slug),
      widgetType: 'metric.count',
      config: { label },
      query: descriptor(
        label,
        nodeQuery(schemaId, { aggregates: [{ alias: 'value', function: 'count' }] })
      )
    },
    w: 3,
    h: 2
  }
}

export function chart(
  kind: 'bar' | 'line' | 'area' | 'pie',
  slug: string,
  label: string,
  schemaId: string,
  xField: string,
  opts: { timeField?: string } = {}
): WidgetSpec {
  return {
    widget: {
      id: wid(slug),
      widgetType: `chart.${kind}`,
      config: { x: xField, aggregate: 'count' },
      query: descriptor(label, nodeQuery(schemaId, { first: 500 })),
      ...(opts.timeField ? { timeField: opts.timeField } : {})
    },
    w: 6,
    h: 4
  }
}

export function savedView(slug: string, label: string, schemaId: string): WidgetSpec {
  return {
    widget: {
      id: wid(slug),
      widgetType: 'view.saved',
      config: { maxColumns: 4 },
      query: descriptor(
        label,
        nodeQuery(schemaId, { orderBy: [{ field: 'updatedAt', direction: 'desc' }], first: 25 })
      )
    },
    w: 6,
    h: 4
  }
}

export function taskList(slug: string, label: string): WidgetSpec {
  return {
    widget: {
      id: wid(slug),
      widgetType: 'list.tasks',
      config: { showCompleted: false },
      query: descriptor(
        label,
        nodeQuery(TASK, { orderBy: [{ field: 'updatedAt', direction: 'desc' }], first: 50 })
      )
    },
    w: 4,
    h: 4
  }
}

export function pageLinks(slug: string, label: string): WidgetSpec {
  return {
    widget: {
      id: wid(slug),
      widgetType: 'links.pages',
      config: { showUpdated: true },
      query: descriptor(
        label,
        nodeQuery(PAGE, { orderBy: [{ field: 'updatedAt', direction: 'desc' }], first: 20 })
      )
    },
    w: 4,
    h: 4
  }
}

export function streakHeatmap(slug: string, label: string): WidgetSpec {
  return {
    widget: {
      id: wid(slug),
      widgetType: 'heatmap.streak',
      config: { weeks: 16 },
      query: descriptor(label, nodeQuery(OBSERVATION, { first: 5000 })),
      timeField: 'day'
    },
    w: 6,
    h: 3
  }
}

/** First-fit pack into a 12-column grid for the `lg` breakpoint. */
function packLg(specs: WidgetSpec[]): DashboardLayoutItem[] {
  const items: DashboardLayoutItem[] = []
  let x = 0
  let y = 0
  let rowH = 0
  for (const spec of specs) {
    if (x + spec.w > 12) {
      x = 0
      y += rowH
      rowH = 0
    }
    items.push({ id: spec.widget.id, x, y, w: spec.w, h: spec.h })
    x += spec.w
    rowH = Math.max(rowH, spec.h)
  }
  return items
}

/** Single-column stack for the `xs` (mobile) breakpoint. */
function stackXs(specs: WidgetSpec[]): DashboardLayoutItem[] {
  let y = 0
  return specs.map((spec) => {
    const item = { id: spec.widget.id, x: 0, y, w: 12, h: spec.h }
    y += spec.h
    return item
  })
}

export interface BuiltDashboard {
  widgets: DashboardWidgetInstance[]
  variables: DashboardVariablesState
  layouts: DashboardLayouts
}

/** Assemble widgets + responsive layouts + variables into a dashboard's json props. */
export function buildDashboard(
  specs: WidgetSpec[],
  variables: DashboardVariablesState = { timeRange: { kind: 'preset', preset: '30d' } }
): BuiltDashboard {
  const lg = packLg(specs)
  return {
    widgets: specs.map((s) => s.widget),
    variables,
    // md/sm derive from lg automatically; provide lg + xs to exercise reflow.
    layouts: { lg, xs: stackXs(specs) }
  }
}
