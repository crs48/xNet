/**
 * Interim Phase 1 panel views — replaced by the real Explorer / Tasks /
 * Data / tray views in Phase 3. Registering them here keeps the shell
 * usable behind the flag while the panels are built out.
 */
import { Link } from '@tanstack/react-router'
import { MyTasksPanel } from '../../components/MyTasksPanel'
import { Sidebar } from '../../components/Sidebar'
import { registerPanelView } from '../PanelViewHost'

function InterimExplorer() {
  return (
    <div className="h-full [&>aside]:h-full [&>aside]:w-full [&>aside]:border-r-0 [&>aside]:bg-transparent">
      <Sidebar />
    </div>
  )
}

function InterimTasks() {
  return (
    <div className="p-2">
      <MyTasksPanel />
      <Link
        to="/tasks"
        className="mt-2 block px-2 text-xs text-ink-2 no-underline hover:text-ink-1 hover:no-underline"
      >
        Open task board →
      </Link>
    </div>
  )
}

function InterimData() {
  return (
    <div className="p-3 text-xs text-ink-2">
      <Link
        to="/data"
        className="block text-ink-2 no-underline hover:text-ink-1 hover:no-underline"
      >
        Open data workspace →
      </Link>
    </div>
  )
}

function InterimTray() {
  return (
    <div className="flex h-full items-center justify-center text-xs text-ink-3">
      Quick capture, notifications, sync activity and the query console land here (Phase 3).
    </div>
  )
}

export function registerInterimPanelViews(): void {
  registerPanelView('left', { id: 'explorer', title: 'Explorer', component: InterimExplorer })
  registerPanelView('left', { id: 'tasks', title: 'Tasks', component: InterimTasks })
  registerPanelView('left', { id: 'data', title: 'Data', component: InterimData })
  registerPanelView('bottom', { id: 'tray', title: 'Tray', component: InterimTray })
}
