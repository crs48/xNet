/**
 * WidgetTile - The grid-host runtime wrapper around one widget instance.
 *
 * Owns the tile chrome (title bar, edit affordances), resolves the widget
 * definition from the registry, executes the instance's data request
 * (useWidgetData), measures the content box, and hands everything to the
 * widget renderer. Canvas hosting reuses WidgetTileBody without the grid
 * chrome.
 */

import type { WidgetDataRequest } from '../types'
import type { DashboardWidgetInstance, SavedViewDescriptor } from '@xnetjs/data'
import { SavedViewSchema } from '@xnetjs/data'
import { useQuery } from '@xnetjs/react'
import { GripVertical, Settings2, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { widgetRegistry, type WidgetRegistry } from '../registry'
import { useDashboardRuntime } from '../runtime/context'
import { useWidgetData } from '../runtime/useWidgetData'

/** Resolve a SavedViewSchema node's serialized descriptor, when configured. */
function useSavedViewNodeDescriptor(savedViewId: string | null): SavedViewDescriptor | null {
  const { data } = useQuery(SavedViewSchema, savedViewId ?? '__none__')

  return useMemo(() => {
    if (!savedViewId || !data?.descriptor) return null
    try {
      return JSON.parse(String(data.descriptor)) as SavedViewDescriptor
    } catch {
      return null
    }
  }, [savedViewId, data?.descriptor])
}

export interface WidgetTileBodyProps {
  widget: DashboardWidgetInstance
  registry?: WidgetRegistry
  onConfigChange?: (next: Record<string, unknown>) => void
}

/** The chrome-less widget renderer host (shared by grid and canvas hosts). */
export function WidgetTileBody({
  widget,
  registry,
  onConfigChange
}: WidgetTileBodyProps): JSX.Element {
  const { onOpenNode } = useDashboardRuntime()
  const definition = (registry ?? widgetRegistry).get(widget.widgetType)
  const contentRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const el = contentRef.current
    if (!el || typeof ResizeObserver === 'undefined') return

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) {
        setSize({
          width: Math.round(entry.contentRect.width),
          height: Math.round(entry.contentRect.height)
        })
      }
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const savedViewId =
    typeof widget.config.savedViewId === 'string' && widget.config.savedViewId.length > 0
      ? widget.config.savedViewId
      : null
  const savedViewDescriptor = useSavedViewNodeDescriptor(savedViewId)

  const request = useMemo<WidgetDataRequest | undefined>(() => {
    const descriptor = savedViewDescriptor ?? widget.query
    if (!descriptor) return undefined
    return {
      descriptor,
      refresh: widget.refresh,
      timeField: widget.timeField
    }
  }, [savedViewDescriptor, widget.query, widget.refresh, widget.timeField])

  const { data, variables } = useWidgetData(request)

  if (!definition) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-sm text-muted-foreground">
        Unknown widget type “{widget.widgetType}”
      </div>
    )
  }

  const Component = definition.component

  return (
    <div ref={contentRef} className="h-full min-h-0 w-full">
      <Component
        config={widget.config}
        data={data}
        width={size.width}
        height={size.height}
        variables={variables}
        onConfigChange={onConfigChange}
        onOpenNode={onOpenNode}
      />
    </div>
  )
}

export interface WidgetTileProps extends WidgetTileBodyProps {
  editable?: boolean
  onRemove?: () => void
  onConfigure?: () => void
}

export function WidgetTile({
  widget,
  registry,
  editable = false,
  onRemove,
  onConfigure,
  onConfigChange
}: WidgetTileProps): JSX.Element {
  const definition = (registry ?? widgetRegistry).get(widget.widgetType)
  const title =
    typeof widget.config.title === 'string' && widget.config.title.length > 0
      ? widget.config.title
      : (widget.query?.title ?? definition?.name ?? widget.widgetType)

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <div className="flex shrink-0 items-center gap-1 border-b border-border/60 px-2 py-1">
        {editable ? (
          <span className="widget-drag-handle cursor-grab text-muted-foreground" aria-hidden>
            <GripVertical size={14} />
          </span>
        ) : null}
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-muted-foreground">
          {title}
        </span>
        {editable ? (
          <>
            <button
              type="button"
              className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              onClick={onConfigure}
              aria-label={`Configure ${title}`}
            >
              <Settings2 size={14} />
            </button>
            <button
              type="button"
              className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              onClick={onRemove}
              aria-label={`Remove ${title}`}
            >
              <X size={14} />
            </button>
          </>
        ) : null}
      </div>
      <div className="min-h-0 flex-1">
        <WidgetTileBody widget={widget} registry={registry} onConfigChange={onConfigChange} />
      </div>
    </div>
  )
}
