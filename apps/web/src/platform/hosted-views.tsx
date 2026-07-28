/**
 * Web's hosted-view table (0406) — the app side of the workbench view
 * registry. The shell renders tab content through `hostedView()`; this module
 * is the one place that knows which component backs each node type.
 *
 * The Record is deliberately complete: adding a {@link TabNodeType} without a
 * view is a compile error here, exactly as it was in the old ViewHost import
 * table.
 */
import { registerHostedViews, type HostedView, type TabNodeType } from '@xnetjs/workbench'
import { ChannelView } from '../comms/ChannelView'
import { CanvasView } from '../components/CanvasView'
import { PostView } from '../components/community/PostView'
import { CrmView } from '../components/crm/CrmView'
import { DashboardView } from '../components/DashboardView'
import { DatabaseView } from '../components/DatabaseView'
import { DataWorkspaceView } from '../components/DataWorkspaceView'
import { ExperimentsView } from '../components/experiments/ExperimentsView'
import { FinanceView } from '../components/finance/FinanceView'
import { FrameTabView } from '../components/FrameTabView'
import { LabView } from '../components/LabView'
import { MapView } from '../components/MapView'
import { MeetingsView } from '../components/MeetingsView'
import { PageView } from '../components/PageView'
import { PersonView } from '../components/PersonView'
import { SpaceHomeView } from '../components/SpaceHomeView'
import { TagView } from '../components/TagView'
import { TasksView } from '../components/TasksView'

const WEB_HOSTED_VIEWS: Record<TabNodeType, HostedView> = {
  page: ({ nodeId }) => <PageView docId={nodeId} />,
  post: ({ nodeId }) => <PostView postId={nodeId} />,
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

/** Idempotent; called at module scope from the root route. */
export function registerWebHostedViews(): void {
  registerHostedViews(WEB_HOSTED_VIEWS)
}
