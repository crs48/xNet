/**
 * Desktop's hosted-view table (0406) — the app side of the workbench view
 * registry, mirroring web's platform/hosted-views.tsx.
 *
 * Real desktop components back the types the desktop already renders; every
 * other type gets an explicit "not on desktop yet" panel — a visible absence,
 * never a silent one. The Record stays complete so a new TabNodeType is a
 * compile error here, exactly as on web.
 */
import { registerHostedViews, type HostedView, type TabNodeType } from '@xnetjs/workbench'
import { DatabaseView } from '../components/DatabaseView'
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

const DESKTOP_HOSTED_VIEWS: Record<TabNodeType, HostedView> = {
  page: ({ nodeId }) => <PageView docId={nodeId} minimalChrome />,
  database: ({ nodeId }) => <DatabaseView docId={nodeId} minimalChrome />,
  post: notYet('Posts'),
  frame: notYet('Frames'),
  canvas: notYet('Canvas tabs'),
  dashboard: notYet('Dashboards'),
  map: notYet('Maps'),
  savedview: notYet('Saved views'),
  tasks: notYet('Tasks'),
  meetings: notYet('Meetings'),
  data: notYet('Data workspace'),
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
