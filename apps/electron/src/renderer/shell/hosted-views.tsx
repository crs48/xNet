/**
 * Desktop's hosted-view table (0406) — the app side of the workbench view
 * registry, mirroring web's platform/hosted-views.tsx.
 *
 * Real desktop components back the types the desktop already renders; every
 * other type gets an explicit "not on desktop yet" panel — a visible absence,
 * never a silent one. The Record stays complete so a new TabNodeType is a
 * compile error here, exactly as on web.
 */
import {
  registerHostedViews,
  useNavigateTo,
  type HostedView,
  type TabNodeType
} from '@xnetjs/workbench'
import { CanvasView } from '../components/CanvasView'
import { DatabaseView } from '../components/DatabaseView'
import { DataWorkspaceView } from '../components/DataWorkspaceView'
import { MeetingsView } from '../components/MeetingsView'
import { PageView } from '../components/PageView'

function NotOnDesktop({ label }: { label: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1 p-8 text-center">
      <div className="text-sm font-medium text-ink-2">{label}</div>
      <div className="text-xs text-ink-3">
        This view has not landed on desktop yet — open it in the web app.
      </div>
    </div>
  )
}

const notYet = (label: string): HostedView =>
  function NotYetView() {
    return <NotOnDesktop label={label} />
  }

/**
 * Canvas as a hosted tab: open-document and split intents resolve through the
 * port instead of the bespoke shell's handlers. The home canvas rendered by
 * App.tsx keeps its richer wiring (ref, pending inserts, create handlers) —
 * this covers canvases opened from the explorer or a split.
 */
function CanvasTabView({ nodeId }: { nodeId: string }) {
  const navigate = useNavigateTo()
  return (
    <CanvasView
      docId={nodeId}
      onOpenDocument={(docId, docType) =>
        navigate({ kind: 'node', nodeType: docType, nodeId: docId })
      }
      onOpenDatabaseSplit={(docId) =>
        navigate({ kind: 'node', nodeType: 'database', nodeId: docId })
      }
    />
  )
}

function MeetingsTabView() {
  const navigate = useNavigateTo()
  return <MeetingsView onClose={() => navigate({ kind: 'home' })} />
}

function DataWorkspaceTabView() {
  const navigate = useNavigateTo()
  return <DataWorkspaceView onClose={() => navigate({ kind: 'home' })} />
}

const DESKTOP_HOSTED_VIEWS: Record<TabNodeType, HostedView> = {
  page: ({ nodeId }) => <PageView docId={nodeId} minimalChrome />,
  database: ({ nodeId }) => <DatabaseView docId={nodeId} minimalChrome />,
  canvas: CanvasTabView,
  meetings: MeetingsTabView,
  data: DataWorkspaceTabView,
  post: notYet('Posts'),
  frame: notYet('Frames'),
  dashboard: notYet('Dashboards'),
  map: notYet('Maps'),
  savedview: notYet('Saved views'),
  tasks: notYet('Tasks'),
  experiments: notYet('Experiments'),
  crm: notYet('CRM'),
  finance: notYet('Finance'),
  channel: notYet('Channels'),
  tag: notYet('Tags'),
  person: notYet('People'),
  lab: notYet('Labs'),
  space: notYet('Space home'),
  settings: notYet('Settings')
}

/** Idempotent; called once before the unified shell renders. */
export function registerDesktopHostedViews(): void {
  registerHostedViews(DESKTOP_HOSTED_VIEWS)
}
