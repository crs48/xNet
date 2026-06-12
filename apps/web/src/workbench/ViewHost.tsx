/**
 * ViewHost — direct-mounts the existing view components for a tab
 * (exploration 0166).
 *
 * The *active* editor group renders the router outlet (router stays
 * authoritative); ViewHost renders the inactive group of a split.
 * Background tabs are not rendered at all, so they hold no Y.Doc
 * subscriptions (the strongest form of the background-tab downgrade).
 */
import type { TabNodeType, WorkbenchTab } from './state'
import type { ComponentType } from 'react'
import { CanvasView } from '../components/CanvasView'
import { DashboardView } from '../components/DashboardView'
import { DatabaseView } from '../components/DatabaseView'
import { DataWorkspaceView } from '../components/DataWorkspaceView'
import { PageView } from '../components/PageView'
import { TasksView } from '../components/TasksView'

const HOSTED_VIEWS: Record<TabNodeType, ComponentType<{ nodeId: string }>> = {
  page: ({ nodeId }) => <PageView docId={nodeId} />,
  database: ({ nodeId }) => <DatabaseView docId={nodeId} />,
  canvas: ({ nodeId }) => <CanvasView docId={nodeId} />,
  dashboard: ({ nodeId }) => <DashboardView dashboardId={nodeId} />,
  savedview: ({ nodeId }) => (
    <div className="flex h-full items-center justify-center text-xs text-ink-3">
      Saved view {nodeId}
    </div>
  ),
  tasks: () => <TasksView />,
  data: () => <DataWorkspaceView />
}

export function ViewHost({ tab }: { tab: WorkbenchTab }) {
  const View = HOSTED_VIEWS[tab.nodeType]

  return (
    <div className="h-full min-h-0 overflow-y-auto p-6">
      {/* keyed so switching tabs fully remounts the view */}
      <View key={tab.id} nodeId={tab.nodeId} />
    </div>
  )
}
