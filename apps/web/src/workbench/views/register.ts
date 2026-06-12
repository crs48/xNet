/**
 * Built-in panel views (exploration 0166). Plugin contributions can
 * register additional views into the same registries (Phase 6).
 */
import { registerPanelView } from '../PanelViewHost'
import { Explorer } from './Explorer'
import { DataPanelView, TasksPanelView } from './left'
import { NotificationsTray, QueryConsoleTray, QuickCaptureTray, SyncTray } from './tray'

export function registerBuiltinPanelViews(): void {
  registerPanelView('left', { id: 'explorer', title: 'Explorer', component: Explorer })
  registerPanelView('left', { id: 'tasks', title: 'Tasks', component: TasksPanelView })
  registerPanelView('left', { id: 'data', title: 'Data', component: DataPanelView })

  registerPanelView('bottom', { id: 'capture', title: 'Capture', component: QuickCaptureTray })
  registerPanelView('bottom', {
    id: 'notifications',
    title: 'Notifications',
    component: NotificationsTray
  })
  registerPanelView('bottom', { id: 'sync', title: 'Sync', component: SyncTray })
  registerPanelView('bottom', { id: 'console', title: 'Console', component: QueryConsoleTray })
}
