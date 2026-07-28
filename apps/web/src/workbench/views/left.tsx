/**
 * Left Panel views beyond the Explorer (exploration 0166): Tasks
 * (personal dashboard) and Data (sources + saved views).
 */
import { ArrowUpRight, Table2 } from 'lucide-react'
import { PlatformLink } from '../platform'
import { TasksDashboard } from './TasksPanel'
import { useSavedViews } from './tray'

export function TasksPanelView() {
  // No board link here: activating the Tasks surface already opens the task
  // board in the editor (see surfaces.ts).
  return (
    <div className="h-full min-h-0 overflow-y-auto p-2">
      <TasksDashboard />
    </div>
  )
}

export function DataPanelView() {
  const { data: savedViews, loading } = useSavedViews()

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        <div className="px-2 pb-1 pt-1 text-[10px] font-medium uppercase tracking-wider text-ink-3">
          Saved views
        </div>
        {loading ? (
          <p className="px-2 text-xs text-ink-3">Loading…</p>
        ) : !savedViews || savedViews.length === 0 ? (
          <p className="px-2 text-xs text-ink-3">No saved views yet.</p>
        ) : (
          <ul className="m-0 list-none p-0">
            {savedViews.map((view) => (
              <li key={view.id}>
                <PlatformLink
                  target={{ kind: 'node', nodeType: 'savedview', nodeId: view.id, preview: false }}
                  className="flex h-[26px] items-center gap-2 rounded-sm px-2 text-xs text-ink-2 no-underline transition-colors hover:bg-accent hover:text-ink-1 hover:no-underline"
                >
                  <Table2 size={13} strokeWidth={1.5} className="shrink-0 text-ink-3" />
                  <span className="truncate">{view.title || 'Untitled view'}</span>
                </PlatformLink>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="shrink-0 border-t border-hairline p-2">
        <PlatformLink
          target={{ kind: 'node', nodeType: 'data', nodeId: '', preview: false }}
          className="flex items-center gap-1.5 px-1 text-xs text-ink-2 no-underline transition-colors hover:text-ink-1 hover:no-underline"
        >
          Open data workspace
          <ArrowUpRight size={11} strokeWidth={1.5} />
        </PlatformLink>
        <PlatformLink
          target={{ kind: 'path', path: '/social-import' }}
          className="mt-1 flex items-center gap-1.5 px-1 text-xs text-ink-2 no-underline transition-colors hover:text-ink-1 hover:no-underline"
        >
          Social import
          <ArrowUpRight size={11} strokeWidth={1.5} />
        </PlatformLink>
      </div>
    </div>
  )
}
