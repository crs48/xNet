/**
 * DashboardGrid - gridstack.js v12 host with React-controlled tile content.
 *
 * React owns the tile elements (keyed children with gs-* attributes);
 * gridstack owns drag/resize/compaction. New tiles are adopted with
 * makeWidget, removed tiles are released from the engine when React unmounts
 * them, and engine 'change' events are serialized back to {x, y, w, h}
 * column units for persistence.
 *
 * Responsive behavior comes from columnOpts.breakpoints: below 640px the
 * grid reflows to a single-column stack (the Expo/mobile story), below
 * 1024px to six columns.
 */

import type { DashboardLayoutItem } from '@xnetjs/data'
import type { GridItemHTMLElement, GridStackNode } from 'gridstack'
import type { ReactNode } from 'react'
import { GridStack } from 'gridstack'
import { useEffect, useLayoutEffect, useRef } from 'react'
import 'gridstack/dist/gridstack.min.css'
import { DASHBOARD_COLUMNS } from '../layout'

export interface DashboardGridProps {
  /** Tile positions in column units (one item per tile id) */
  layout: DashboardLayoutItem[]
  /** Per-tile minimum sizes in grid units */
  minSizes?: Record<string, { minW?: number; minH?: number }>
  /** Whether tiles can be dragged/resized */
  editable?: boolean
  /** Called with the full updated layout after a drag/resize */
  onLayoutChange?: (layout: DashboardLayoutItem[]) => void
  /** Tile renderer keyed by layout item id */
  renderTile: (id: string) => ReactNode
  /** Pixel height of one grid row (default 80) */
  cellHeight?: number
}

/** Release engine nodes whose tiles React no longer renders. */
function releaseRemovedTiles(grid: GridStack, layout: readonly DashboardLayoutItem[]): void {
  const present = new Set(layout.map((item) => item.id))
  for (const el of grid.getGridItems()) {
    const id = el.getAttribute('gs-id')
    if (id && !present.has(id)) {
      grid.removeWidget(el, false, false)
    }
  }
}

/** Adopt a freshly rendered tile, or push an external position change. */
function adoptOrUpdateTile(
  grid: GridStack,
  container: HTMLElement,
  item: DashboardLayoutItem,
  min: { minW?: number; minH?: number } | undefined
): void {
  const el = container.querySelector<GridItemHTMLElement>(`[gs-id="${item.id}"]`)
  if (!el) return

  const options = {
    id: item.id,
    x: item.x,
    y: item.y,
    w: item.w,
    h: item.h,
    ...(min?.minW ? { minW: min.minW } : {}),
    ...(min?.minH ? { minH: min.minH } : {})
  }

  const node = el.gridstackNode
  if (!node) {
    grid.makeWidget(el, options)
    return
  }
  if (node.x !== item.x || node.y !== item.y || node.w !== item.w || node.h !== item.h) {
    grid.update(el, options)
  }
}

/** Serialize engine nodes back to persisted column units (exported for tests). */
export function serializeGridNodes(nodes: GridStackNode[]): DashboardLayoutItem[] {
  return nodes.filter((node) => node.id !== undefined).map(toLayoutItem)
}

function toLayoutItem(node: GridStackNode): DashboardLayoutItem {
  const { id, x = 0, y = 0, w = 1, h = 1 } = node
  return { id: String(id), x, y, w, h }
}

/**
 * Merge an engine change event into the current layout, or null when the
 * event carries nothing to persist (exported for tests).
 */
export function mergeGridChange(
  current: readonly DashboardLayoutItem[],
  nodes: GridStackNode[] | undefined
): DashboardLayoutItem[] | null {
  const changed = serializeGridNodes(nodes ?? [])
  if (changed.length === 0) return null

  const byId = new Map(changed.map((item) => [item.id, item]))
  return current.map((item) => byId.get(item.id) ?? item)
}

export function DashboardGrid({
  layout,
  minSizes,
  editable = false,
  onLayoutChange,
  renderTile,
  cellHeight = 80
}: DashboardGridProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<GridStack | null>(null)
  const layoutRef = useRef(layout)
  layoutRef.current = layout
  const onLayoutChangeRef = useRef(onLayoutChange)
  onLayoutChangeRef.current = onLayoutChange

  // Init once. Engine teardown keeps the DOM (React owns it).
  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return

    const grid = GridStack.init(
      {
        column: DASHBOARD_COLUMNS,
        cellHeight,
        margin: 8,
        float: false,
        handle: '.widget-drag-handle',
        staticGrid: !editable,
        columnOpts: {
          breakpointForWindow: true,
          breakpoints: [
            { w: 640, c: 1 },
            { w: 1024, c: 6 }
          ]
        }
      },
      container
    )
    gridRef.current = grid

    grid.on('change', (_event, nodes) => {
      // Responsive reflow (1/6-column breakpoints) must never overwrite the
      // persisted 12-column layout; gridstack restores it from its own
      // per-column cache when the viewport widens again.
      if (grid.getColumn() !== DASHBOARD_COLUMNS) return
      const merged = mergeGridChange(layoutRef.current, nodes)
      if (merged) onLayoutChangeRef.current?.(merged)
    })

    return () => {
      grid.destroy(false)
      gridRef.current = null
    }
    // The grid is initialized once; editable/cellHeight updates are applied
    // by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    gridRef.current?.setStatic(!editable)
  }, [editable])

  // Adopt new tiles, release removed ones, and push external layout updates
  // into the engine.
  useLayoutEffect(() => {
    const grid = gridRef.current
    const container = containerRef.current
    if (!grid || !container) return

    grid.batchUpdate()
    try {
      releaseRemovedTiles(grid, layout)
      for (const item of layout) {
        adoptOrUpdateTile(grid, container, item, minSizes?.[item.id])
      }
    } finally {
      grid.batchUpdate(false)
    }
  }, [layout, minSizes])

  return (
    <div ref={containerRef} className="grid-stack">
      {layout.map((item) => (
        <div
          key={item.id}
          gs-id={item.id}
          gs-x={item.x}
          gs-y={item.y}
          gs-w={item.w}
          gs-h={item.h}
          className="grid-stack-item"
        >
          <div className="grid-stack-item-content !overflow-visible">{renderTile(item.id)}</div>
        </div>
      ))}
    </div>
  )
}
