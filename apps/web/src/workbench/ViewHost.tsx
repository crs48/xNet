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
import { ChannelView } from '../comms/ChannelView'
import { CanvasView } from '../components/CanvasView'
import { CrmView } from '../components/crm/CrmView'
import { DashboardView } from '../components/DashboardView'
import { DatabaseView } from '../components/DatabaseView'
import { DataWorkspaceView } from '../components/DataWorkspaceView'
import { ExperimentsView } from '../components/experiments/ExperimentsView'
import { FinanceView } from '../components/finance/FinanceView'
import { LabView } from '../components/LabView'
import { MapView } from '../components/MapView'
import { MeetingsView } from '../components/MeetingsView'
import { FrameTabView } from '../components/FrameTabView'
import { PageView } from '../components/PageView'
import { PersonView } from '../components/PersonView'
import { SpaceHomeView } from '../components/SpaceHomeView'
import { TagView } from '../components/TagView'
import { TasksView } from '../components/TasksView'

const HOSTED_VIEWS: Record<TabNodeType, ComponentType<{ nodeId: string }>> = {
  page: ({ nodeId }) => <PageView docId={nodeId} />,
  frame: ({ nodeId }) => <FrameTabView frameSpec={nodeId} />,
  database: ({ nodeId }) => <DatabaseView docId={nodeId} />,
  canvas: ({ nodeId }) => <CanvasView docId={nodeId} />,
  dashboard: ({ nodeId }) => <DashboardView dashboardId={nodeId} />,
  map: ({ nodeId }) => <MapView mapId={nodeId} />,
  savedview: ({ nodeId }) => (
    <div className="flex h-full items-center justify-center text-xs text-ink-3">
      Saved view {nodeId}
    </div>
  ),
  tasks: () => <TasksView />,
  meetings: () => <MeetingsView />,
  data: () => <DataWorkspaceView />,
  experiments: () => <ExperimentsView />,
  crm: () => <CrmView />,
  finance: () => <FinanceView />,
  channel: ({ nodeId }) => <ChannelView channelId={nodeId} />,
  tag: ({ nodeId }) => <TagView tagId={nodeId} />,
  person: ({ nodeId }) => <PersonView did={nodeId} />,
  lab: ({ nodeId }) => <LabView labId={nodeId} />,
  space: ({ nodeId }) => <SpaceHomeView spaceId={nodeId} />,
  // Settings drives its section from the URL, which only the active group's
  // router outlet has; a split/background settings tab shows a hint instead.
  settings: () => (
    <div className="flex h-full items-center justify-center text-xs text-ink-3">
      Settings open in the active tab
    </div>
  )
}

export function ViewHost({ tab }: { tab: WorkbenchTab }) {
  const View = HOSTED_VIEWS[tab.nodeType]
  // Pages are full-bleed documents that own their scroll (see
  // GroupContent in EditorArea for the routed equivalent).
  const hostClass =
    tab.nodeType === 'page'
      ? 'h-full min-h-0 overflow-hidden'
      : 'h-full min-h-0 overflow-y-auto p-6'

  return (
    <div className={hostClass}>
      {/* keyed so switching tabs fully remounts the view */}
      <View key={tab.id} nodeId={tab.nodeId} />
    </div>
  )
}
