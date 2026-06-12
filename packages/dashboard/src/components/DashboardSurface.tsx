/**
 * DashboardSurface - The full dashboard route surface: header (title,
 * variables bar, edit toggle), the gridstack host, widget picker, and config
 * panel. All edits persist to the DashboardSchema node.
 */

import type { AnyWidgetDefinition } from '../types'
import type {
  DashboardLayoutItem,
  DashboardVariablesState,
  DashboardWidgetInstance
} from '@xnetjs/data'
import type { SavedViewSchemaRegistry } from '@xnetjs/react'
import { DashboardSchema } from '@xnetjs/data'
import { useMutate, useQuery } from '@xnetjs/react'
import { LayoutDashboard, Pencil, Plus } from 'lucide-react'
import { nanoid } from 'nanoid'
import { useCallback, useMemo, useState } from 'react'
import { resolveLayout, placeWidget, DASHBOARD_COLUMNS } from '../layout'
import { widgetRegistry, type WidgetRegistry } from '../registry'
import { DashboardRuntimeProvider } from '../runtime/context'
import { UserWidgetEditor, useUserWidgets } from '../sandbox/user-widgets'
import { registerBuiltinWidgets } from '../widgets/builtins'
import { DashboardGrid } from './DashboardGrid'
import { DashboardVariablesBar } from './DashboardVariablesBar'
import { WidgetConfigPanel } from './WidgetConfigPanel'
import { WidgetPicker } from './WidgetPicker'
import { WidgetTile } from './WidgetTile'

registerBuiltinWidgets()

export interface DashboardSurfaceProps {
  dashboardId: string
  /** Schemas widget queries may target */
  schemas: SavedViewSchemaRegistry
  /** Open a node in its full surface */
  onOpenNode?: (nodeId: string, schemaId: string) => void
  registry?: WidgetRegistry
}

export function DashboardSurface({
  dashboardId,
  schemas,
  onOpenNode,
  registry = widgetRegistry
}: DashboardSurfaceProps): JSX.Element {
  const { data: dashboard, loading } = useQuery(DashboardSchema, dashboardId)
  const { create, update } = useMutate()
  const [editing, setEditing] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [widgetEditorOpen, setWidgetEditorOpen] = useState(false)
  const [configWidgetId, setConfigWidgetId] = useState<string | null>(null)

  // Keep user-authored widgets (UserWidgetSchema nodes) registered.
  useUserWidgets(registry)

  const widgets = useMemo(() => dashboard?.widgets ?? [], [dashboard?.widgets])
  const sizeFor = useCallback(
    (widgetType: string) => registry.get(widgetType)?.defaultSize ?? { w: 4, h: 3 },
    [registry]
  )
  const layout = useMemo(
    () => resolveLayout(widgets, dashboard?.layouts ?? undefined, sizeFor),
    [widgets, dashboard?.layouts, sizeFor]
  )
  const minSizes = useMemo(
    () =>
      Object.fromEntries(
        widgets.map((widget) => {
          const size = sizeFor(widget.widgetType)
          return [widget.id, { minW: size.minW, minH: size.minH }]
        })
      ),
    [widgets, sizeFor]
  )

  const persistLayout = useCallback(
    (next: DashboardLayoutItem[]) => {
      void update(DashboardSchema, dashboardId, {
        layouts: { ...(dashboard?.layouts ?? {}), lg: next }
      })
    },
    [update, dashboardId, dashboard?.layouts]
  )

  const handleAddWidget = useCallback(
    (definition: AnyWidgetDefinition) => {
      const stub = definition.getStubConfig({
        schemas: schemas.map((schema) => schema.schema['@id'])
      })
      const widget: DashboardWidgetInstance = {
        id: nanoid(8),
        widgetType: definition.type,
        config: stub.config,
        ...(stub.query ? { query: stub.query.descriptor } : {}),
        ...(stub.query?.refresh ? { refresh: stub.query.refresh } : {}),
        ...(stub.query?.timeField ? { timeField: stub.query.timeField } : {})
      }
      const { x, y } = placeWidget(layout, definition.defaultSize)
      const item: DashboardLayoutItem = {
        id: widget.id,
        x,
        y,
        w: Math.min(definition.defaultSize.w, DASHBOARD_COLUMNS),
        h: definition.defaultSize.h
      }

      setPickerOpen(false)
      void update(DashboardSchema, dashboardId, {
        widgets: [...widgets, widget],
        layouts: { ...(dashboard?.layouts ?? {}), lg: [...layout, item] }
      })
    },
    [schemas, layout, update, dashboardId, widgets, dashboard?.layouts]
  )

  const handleRemoveWidget = useCallback(
    (widgetId: string) => {
      setConfigWidgetId((current) => (current === widgetId ? null : current))
      void update(DashboardSchema, dashboardId, {
        widgets: widgets.filter((widget) => widget.id !== widgetId),
        layouts: {
          ...(dashboard?.layouts ?? {}),
          lg: layout.filter((item) => item.id !== widgetId)
        }
      })
    },
    [update, dashboardId, widgets, layout, dashboard?.layouts]
  )

  const handleWidgetChange = useCallback(
    (widgetId: string, change: Partial<DashboardWidgetInstance>) => {
      void update(DashboardSchema, dashboardId, {
        widgets: widgets.map((widget) =>
          widget.id === widgetId ? { ...widget, ...change } : widget
        )
      })
    },
    [update, dashboardId, widgets]
  )

  const handleVariablesChange = useCallback(
    (variables: DashboardVariablesState) => {
      void update(DashboardSchema, dashboardId, { variables })
    },
    [update, dashboardId]
  )

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading dashboard…
      </div>
    )
  }

  if (!dashboard) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <LayoutDashboard size={32} className="text-muted-foreground" aria-hidden />
        <p className="text-sm text-muted-foreground">This dashboard does not exist yet.</p>
        <button
          type="button"
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
          onClick={() => void create(DashboardSchema, { title: 'New dashboard' }, dashboardId)}
        >
          Create dashboard
        </button>
      </div>
    )
  }

  const configWidget = configWidgetId
    ? (widgets.find((widget) => widget.id === configWidgetId) ?? null)
    : null

  return (
    <DashboardRuntimeProvider
      schemas={schemas}
      variables={dashboard.variables ?? undefined}
      onOpenNode={onOpenNode}
    >
      <div className="flex h-full min-h-0">
        <div className="flex min-h-0 flex-1 flex-col">
          <header className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-2">
            <h1 className="flex items-center gap-2 text-base font-semibold text-foreground">
              <span aria-hidden>{dashboard.icon ?? '📊'}</span>
              {dashboard.title}
            </h1>
            <div className="flex-1" />
            <DashboardVariablesBar
              variables={dashboard.variables ?? undefined}
              onChange={handleVariablesChange}
            />
            <button
              type="button"
              className={`flex items-center gap-1 rounded-md border px-2 py-1 text-sm ${
                editing
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:bg-accent'
              }`}
              onClick={() => setEditing((current) => !current)}
            >
              <Pencil size={14} aria-hidden />
              {editing ? 'Done' : 'Edit'}
            </button>
            <button
              type="button"
              className="flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-sm font-medium text-primary-foreground hover:opacity-90"
              onClick={() => setPickerOpen(true)}
            >
              <Plus size={14} aria-hidden />
              Add widget
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {widgets.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
                <LayoutDashboard size={28} aria-hidden />
                <p>No widgets yet. Add one to get started.</p>
              </div>
            ) : (
              <DashboardGrid
                layout={layout}
                minSizes={minSizes}
                editable={editing}
                onLayoutChange={persistLayout}
                renderTile={(id) => {
                  const widget = widgets.find((candidate) => candidate.id === id)
                  if (!widget) return null
                  return (
                    <WidgetTile
                      widget={widget}
                      registry={registry}
                      editable={editing}
                      onRemove={() => handleRemoveWidget(widget.id)}
                      onConfigure={() => setConfigWidgetId(widget.id)}
                      onConfigChange={(config) =>
                        handleWidgetChange(widget.id, {
                          config: { ...widget.config, ...config }
                        })
                      }
                    />
                  )
                }}
              />
            )}
          </div>
        </div>

        {configWidget ? (
          <WidgetConfigPanel
            widget={configWidget}
            registry={registry}
            onChange={(change) => handleWidgetChange(configWidget.id, change)}
            onClose={() => setConfigWidgetId(null)}
          />
        ) : null}
      </div>

      {pickerOpen ? (
        <WidgetPicker
          registry={registry}
          onSelect={handleAddWidget}
          onClose={() => setPickerOpen(false)}
          onCreateWidget={() => {
            setPickerOpen(false)
            setWidgetEditorOpen(true)
          }}
        />
      ) : null}

      {widgetEditorOpen ? <UserWidgetEditor onClose={() => setWidgetEditorOpen(false)} /> : null}
    </DashboardRuntimeProvider>
  )
}
