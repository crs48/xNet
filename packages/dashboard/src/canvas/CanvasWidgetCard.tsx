/**
 * Canvas card adapter (0162 phase 3): render any WidgetDefinition as a
 * canvas object. The same widget contract has two layout hosts — a grid
 * tile (DashboardGrid/WidgetTile) and this canvas card, wired through
 * CanvasV3's renderNode seam for `node.type === 'widget'`.
 *
 * The canvas node persists the serialized DashboardWidgetInstance in
 * `properties.widget`; rendering goes through the same WidgetTileBody
 * runtime (registry lookup, variable interpolation, reactive query).
 */

import type { WidgetRegistry } from '../registry'
import type { DashboardWidgetInstance } from '@xnetjs/data'
import { WidgetTileBody } from '../components/WidgetTile'
import { widgetRegistry } from '../registry'

/** Canvas object kind hosting widgets (mirrors CanvasObjectKind 'widget'). */
export const CANVAS_WIDGET_KIND = 'widget' as const

/** Minimal canvas-node shape the adapter needs (structural, no canvas dep). */
export interface CanvasWidgetNodeLike {
  id: string
  type: string
  properties: Record<string, unknown>
}

/** Read the persisted widget instance off a canvas widget node. */
export function widgetInstanceFromCanvasNode(
  node: CanvasWidgetNodeLike
): DashboardWidgetInstance | null {
  if (node.type !== CANVAS_WIDGET_KIND) return null
  const widget = node.properties.widget
  if (!widget || typeof widget !== 'object' || Array.isArray(widget)) return null

  const instance = widget as Partial<DashboardWidgetInstance>
  if (typeof instance.widgetType !== 'string') return null

  return {
    id: typeof instance.id === 'string' ? instance.id : node.id,
    widgetType: instance.widgetType,
    config: (instance.config as Record<string, unknown>) ?? {},
    ...(instance.query ? { query: instance.query } : {}),
    ...(instance.refresh ? { refresh: instance.refresh } : {}),
    ...(instance.timeField ? { timeField: instance.timeField } : {})
  }
}

/** Build canvas-node properties for pinning a widget onto a canvas. */
export function createCanvasWidgetNodeProperties(
  widget: DashboardWidgetInstance,
  title?: string
): Record<string, unknown> {
  return {
    ...(title ? { title } : {}),
    widget: widget as unknown as Record<string, unknown>
  }
}

export interface CanvasWidgetCardProps {
  node: CanvasWidgetNodeLike
  registry?: WidgetRegistry
}

/**
 * The canvas host for a widget node. Requires a DashboardRuntimeProvider
 * above it (the host app provides the schema registry and variables).
 */
export function CanvasWidgetCard({ node, registry }: CanvasWidgetCardProps): JSX.Element {
  const widget = widgetInstanceFromCanvasNode(node)
  const resolvedRegistry = registry ?? widgetRegistry

  if (!widget) {
    return (
      <div className="flex h-full w-full items-center justify-center rounded-lg border border-border bg-card p-3 text-xs text-muted-foreground">
        Widget not configured
      </div>
    )
  }

  const definition = resolvedRegistry.get(widget.widgetType)
  const title =
    typeof node.properties.title === 'string' && node.properties.title.length > 0
      ? node.properties.title
      : (widget.query?.title ?? definition?.name ?? widget.widgetType)

  return (
    <div
      className="flex h-full w-full flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm"
      data-canvas-widget-card="true"
    >
      <div className="shrink-0 border-b border-border/60 px-2 py-1 text-xs font-medium text-muted-foreground">
        {title}
      </div>
      <div className="min-h-0 flex-1" data-canvas-interactive="true">
        <WidgetTileBody widget={widget} registry={resolvedRegistry} />
      </div>
    </div>
  )
}
