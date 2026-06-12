/**
 * DashboardSurface story over the real in-memory reactive stack
 * (XNetProvider + MemoryNodeStorageAdapter): seeds a dashboard with the
 * built-in widget set plus tasks/pages, so add/drag/resize/configure and the
 * time-range variable can be exercised end-to-end.
 */

import type { Meta, StoryObj } from '@storybook/react-vite'
import type { DID } from '@xnetjs/core'
import { DashboardSchema, MemoryNodeStorageAdapter, PageSchema, TaskSchema } from '@xnetjs/data'
import { generateIdentity } from '@xnetjs/identity'
import { XNetProvider, useMutate, useQuery, type SavedViewSchemaRegistry } from '@xnetjs/react'
import { useEffect, useMemo, useRef, type ReactElement } from 'react'
import { CanvasWidgetCard } from './canvas/CanvasWidgetCard'
import { DashboardSurface } from './components/DashboardSurface'
import { DashboardRuntimeProvider } from './runtime/context'
import { chartWidgets } from './widgets/chart-widget'
import { metricWidget } from './widgets/metric-widget'
import { pageLinksWidget } from './widgets/page-links-widget'
import { recentItemsWidget } from './widgets/recent-items-widget'
import { taskListWidget } from './widgets/task-list-widget'

const meta = {
  title: 'Core/Dashboard/Surface',
  parameters: { layout: 'fullscreen' }
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

const DASHBOARD_ID = 'storybook-dashboard'
const SCHEMAS = [TaskSchema, PageSchema, DashboardSchema] as unknown as SavedViewSchemaRegistry

function Seeder({ children }: { children: ReactElement }) {
  const { create } = useMutate()
  const { data: dashboard, loading } = useQuery(DashboardSchema, DASHBOARD_ID)
  const seeded = useRef(false)

  useEffect(() => {
    if (loading || dashboard || seeded.current) return
    seeded.current = true

    void (async () => {
      await create(TaskSchema, { title: 'Review dashboard exploration' })
      await create(TaskSchema, { title: 'Wire gridstack host' })
      await create(TaskSchema, { title: 'Ship phase one', completed: true })
      await create(PageSchema, { title: 'Dashboard design notes' })
      await create(PageSchema, { title: 'Q2 planning' })

      const stub = (widget: {
        getStubConfig: (ctx: { schemas: string[] }) => {
          config: Record<string, unknown>
          query?: { descriptor: unknown }
        }
      }) => widget.getStubConfig({ schemas: SCHEMAS.map((schema) => schema.schema['@id']) })

      const metric = stub(metricWidget)
      const tasks = stub(taskListWidget)
      const pages = stub(pageLinksWidget)
      const recent = stub(recentItemsWidget)

      await create(
        DashboardSchema,
        {
          title: 'My dashboard',
          icon: '📊',
          variables: {},
          widgets: [
            {
              id: 'metric-1',
              widgetType: metricWidget.type,
              config: { ...metric.config, label: 'Open tasks' },
              query: metric.query?.descriptor as never,
              refresh: 'live'
            },
            {
              id: 'tasks-1',
              widgetType: taskListWidget.type,
              config: tasks.config,
              query: tasks.query?.descriptor as never,
              refresh: 'live'
            },
            {
              id: 'pages-1',
              widgetType: pageLinksWidget.type,
              config: pages.config,
              query: pages.query?.descriptor as never,
              refresh: 'live'
            },
            {
              id: 'recent-1',
              widgetType: recentItemsWidget.type,
              config: recent.config,
              query: recent.query?.descriptor as never,
              refresh: 'live'
            }
          ],
          layouts: {
            lg: [
              { id: 'metric-1', x: 0, y: 0, w: 3, h: 2 },
              { id: 'tasks-1', x: 3, y: 0, w: 4, h: 4 },
              { id: 'pages-1', x: 7, y: 0, w: 3, h: 4 },
              { id: 'recent-1', x: 0, y: 2, w: 3, h: 5 }
            ]
          }
        },
        DASHBOARD_ID
      )
    })()
  }, [create, dashboard, loading])

  return children
}

function Harness() {
  const identity = useMemo(() => generateIdentity(), [])
  const storage = useMemo(() => new MemoryNodeStorageAdapter(), [])

  return (
    <XNetProvider
      config={{
        nodeStorage: storage,
        authorDID: identity.identity.did as DID,
        signingKey: identity.privateKey
      }}
    >
      <Seeder>
        <div style={{ height: '100vh' }}>
          <DashboardSurface dashboardId={DASHBOARD_ID} schemas={SCHEMAS} />
        </div>
      </Seeder>
    </XNetProvider>
  )
}

export const Surface: Story = {
  render: () => <Harness />
}

// ─── 20-widget perf validation (0162) ───────────────────────────────────────

const TWENTY_ID = 'storybook-dashboard-20'

function TwentySeeder({ children }: { children: ReactElement }) {
  const { create } = useMutate()
  const { data: dashboard, loading } = useQuery(DashboardSchema, TWENTY_ID)
  const seeded = useRef(false)

  useEffect(() => {
    if (loading || dashboard || seeded.current) return
    seeded.current = true

    void (async () => {
      for (let i = 0; i < 8; i++) {
        await create(TaskSchema, { title: `Task ${i}`, completed: i % 3 === 0 })
        await create(PageSchema, { title: `Page ${i}` })
      }

      const types = [
        metricWidget,
        taskListWidget,
        pageLinksWidget,
        recentItemsWidget,
        ...chartWidgets
      ]
      const widgets = Array.from({ length: 20 }, (_, index) => {
        const definition = types[index % types.length]
        const stub = definition.getStubConfig({
          schemas: SCHEMAS.map((schema) => schema.schema['@id'])
        })
        return {
          id: `w${index}`,
          widgetType: definition.type,
          config: stub.config as Record<string, unknown>,
          query: stub.query?.descriptor as never,
          refresh: 'live' as const
        }
      })
      const layouts = {
        lg: widgets.map((widget, index) => ({
          id: widget.id,
          x: (index % 4) * 3,
          y: Math.floor(index / 4) * 3,
          w: 3,
          h: 3
        }))
      }

      await create(
        DashboardSchema,
        { title: 'Twenty widgets', icon: '🧪', variables: {}, widgets, layouts },
        TWENTY_ID
      )
    })()
  }, [create, dashboard, loading])

  return children
}

export const TwentyWidgets: Story = {
  render: () => {
    function TwentyHarness() {
      const identity = useMemo(() => generateIdentity(), [])
      const storage = useMemo(() => new MemoryNodeStorageAdapter(), [])

      return (
        <XNetProvider
          config={{
            nodeStorage: storage,
            authorDID: identity.identity.did as DID,
            signingKey: identity.privateKey
          }}
        >
          <TwentySeeder>
            <div style={{ height: '100vh' }}>
              <DashboardSurface dashboardId={TWENTY_ID} schemas={SCHEMAS} />
            </div>
          </TwentySeeder>
        </XNetProvider>
      )
    }
    return <TwentyHarness />
  }
}

// ─── Canvas card host validation (0162) ─────────────────────────────────────

export const CanvasCard: Story = {
  render: () => {
    function CanvasCardHarness() {
      const identity = useMemo(() => generateIdentity(), [])
      const storage = useMemo(() => new MemoryNodeStorageAdapter(), [])
      const chart = chartWidgets[0]
      const stub = chart.getStubConfig({
        schemas: SCHEMAS.map((schema) => schema.schema['@id'])
      })
      const widget = {
        id: 'canvas-chart',
        widgetType: chart.type,
        config: stub.config as Record<string, unknown>,
        query: stub.query?.descriptor as never,
        refresh: 'live' as const
      }

      return (
        <XNetProvider
          config={{
            nodeStorage: storage,
            authorDID: identity.identity.did as DID,
            signingKey: identity.privateKey
          }}
        >
          <Seeder>
            <DashboardRuntimeProvider schemas={SCHEMAS} variables={undefined}>
              <div style={{ width: 420, height: 320, padding: 24 }}>
                <CanvasWidgetCard
                  node={{ id: 'canvas-node', type: 'widget', properties: { widget } }}
                />
              </div>
            </DashboardRuntimeProvider>
          </Seeder>
        </XNetProvider>
      )
    }
    return <CanvasCardHarness />
  }
}
