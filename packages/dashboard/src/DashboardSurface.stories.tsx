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
import { DashboardSurface } from './components/DashboardSurface'
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
