/**
 * Layout helpers: 12-column grid placement and per-breakpoint serialization.
 */

import type { WidgetDefaultSize } from './types'
import type { DashboardLayoutItem, DashboardLayouts, DashboardWidgetInstance } from '@xnetjs/data'

export const DASHBOARD_COLUMNS = 12

/** Bottom of the grid: the first fully free row. */
function bottomRow(items: readonly DashboardLayoutItem[]): number {
  return items.reduce((max, item) => Math.max(max, item.y + item.h), 0)
}

/**
 * Place a new widget: first-fit scan left-to-right across existing rows,
 * falling back to a fresh row at the bottom.
 */
export function placeWidget(
  existing: readonly DashboardLayoutItem[],
  size: WidgetDefaultSize
): { x: number; y: number } {
  const w = Math.min(size.w, DASHBOARD_COLUMNS)
  const maxY = bottomRow(existing)

  for (let y = 0; y <= maxY; y++) {
    for (let x = 0; x + w <= DASHBOARD_COLUMNS; x++) {
      const candidate = { x, y, w, h: size.h }
      const collides = existing.some(
        (item) =>
          candidate.x < item.x + item.w &&
          item.x < candidate.x + candidate.w &&
          candidate.y < item.y + item.h &&
          item.y < candidate.y + candidate.h
      )
      if (!collides) return { x, y }
    }
  }

  return { x: 0, y: maxY }
}

/**
 * Resolve the layout for a breakpoint, guaranteeing one item per widget:
 * missing breakpoints fall back to 'lg', and widgets without a layout item
 * (e.g. just added on another device) are appended via first-fit placement.
 */
export function resolveLayout(
  widgets: readonly DashboardWidgetInstance[],
  layouts: DashboardLayouts | undefined,
  sizeFor: (widgetType: string) => WidgetDefaultSize,
  breakpoint: keyof DashboardLayouts = 'lg'
): DashboardLayoutItem[] {
  const stored = layouts?.[breakpoint] ?? layouts?.lg ?? []
  const byId = new Map(stored.map((item) => [item.id, item]))
  const resolved: DashboardLayoutItem[] = []

  for (const widget of widgets) {
    const existing = byId.get(widget.id)
    if (existing) {
      resolved.push(existing)
      continue
    }

    const size = sizeFor(widget.widgetType)
    const { x, y } = placeWidget(resolved, size)
    resolved.push({ id: widget.id, x, y, w: Math.min(size.w, DASHBOARD_COLUMNS), h: size.h })
  }

  return resolved
}

/** Merge grid-engine change events into a stored layout list. */
export function applyLayoutChanges(
  layout: readonly DashboardLayoutItem[],
  changes: readonly DashboardLayoutItem[]
): DashboardLayoutItem[] {
  const byId = new Map(changes.map((item) => [item.id, item]))
  return layout.map((item) => byId.get(item.id) ?? item)
}
