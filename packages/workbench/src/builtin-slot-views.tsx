/**
 * First-party slot views (0280): the calm frame views, the 0166 panel
 * views and the 0273 dock residents, registered once into the shell-wide
 * slot registry. Kept apart from slot-registry.tsx so the registry stays
 * component-free (no import cycles through Rail/StatusBar/contributions).
 */
import type { SlotContribution } from '@xnetjs/plugins'
import type { ComponentType } from 'react'
import {
  Archive,
  Bell,
  Bot,
  CalendarDays,
  Database,
  FolderTree,
  Info,
  Layers,
  MessagesSquare,
  PanelBottom,
  PanelRight,
  PenLine,
  RefreshCw,
  SquareCheck,
  Terminal
} from 'lucide-react'
import { lazy, Suspense, createElement } from 'react'
import { workbenchHost } from './host'
import { getSlotView, registerSlotView } from './slot-registry'
import { StatusBar } from './StatusBar'

/** Wrap a bare component so registry entries stay plain ComponentTypes. */
function asComponent(Component: ComponentType): ComponentType {
  return Component
}

/**
 * Slot views load on demand (0406 cold-open budget): none of them are part
 * of first paint — a dock has to open first — so their import graphs
 * (Explorer's virtualizer, the trays' query console, the calm Canvas) stay
 * out of the entry chunk both hosts parse at boot. Same isolation the AI
 * panel already had, applied to every heavy resident.
 */
function lazySlotView(load: () => Promise<{ default: ComponentType }>): ComponentType {
  const Lazy = lazy(load)
  return function SlotView() {
    return <Suspense fallback={null}>{createElement(Lazy)}</Suspense>
  }
}

const Canvas = lazySlotView(() => import('./calm/Canvas').then((m) => ({ default: m.Canvas })))
const ContextPanel = lazySlotView(() =>
  import('./ContextPanel').then((m) => ({ default: m.ContextPanel }))
)
const UnifiedTree = lazySlotView(() =>
  import('./sidebar/UnifiedTree').then((m) => ({ default: m.UnifiedTree }))
)
const Explorer = lazySlotView(() =>
  import('./views/Explorer').then((m) => ({ default: m.Explorer }))
)
const TasksPanelView = lazySlotView(() =>
  import('./views/left').then((m) => ({ default: m.TasksPanelView }))
)
const DataPanelView = lazySlotView(() =>
  import('./views/left').then((m) => ({ default: m.DataPanelView }))
)
const TodayPanel = lazySlotView(() =>
  import('./views/TodayPanel').then((m) => ({ default: m.TodayPanel }))
)
const ShelfTray = lazySlotView(() =>
  import('./views/Shelf').then((m) => ({ default: m.ShelfTray }))
)
const QuickCaptureTray = lazySlotView(() =>
  import('./views/tray').then((m) => ({ default: m.QuickCaptureTray }))
)
const NotificationsTray = lazySlotView(() =>
  import('./views/tray').then((m) => ({ default: m.NotificationsTray }))
)
const SyncTray = lazySlotView(() => import('./views/tray').then((m) => ({ default: m.SyncTray })))
const QueryConsoleTray = lazySlotView(() =>
  import('./views/tray').then((m) => ({ default: m.QueryConsoleTray }))
)
const WorkspacePluginsDevView = lazySlotView(() =>
  import('./views/WorkspacePluginsDevView').then((m) => ({ default: m.WorkspacePluginsDevView }))
)

/**
 * Host components resolve at render, not registration — registration runs at
 * module scope, before the app has called setWorkbenchHost.
 */
function ChatsPanel(): JSX.Element {
  const { comms } = workbenchHost()
  return <comms.ChatsPanel />
}

// The AI panel additionally drags the brain/WebLLM stack, which must stay
// off the core barrel's static graph (the reason the /ai subpath exists).
const AiChatPanel = lazySlotView(() =>
  import('./views/AiChatPanel').then((m) => ({ default: m.AiChatPanel }))
)

/**
 * First-party residents, registered once (idempotent): the calm frame
 * views, the 0166 panel views, and the 0273 dock residents — one registry,
 * three former homes.
 */
export function registerBuiltinSlotViews(): void {
  const builtin: SlotContribution[] = [
    // Frame views
    {
      id: 'context',
      icon: PanelRight,
      label: 'Context',
      tier: 'hero',
      group: 'navigate',
      priority: 1,
      component: asComponent(Canvas),
      defaultRegion: 'dock.right',
      keywords: ['canvas', 'artifact', 'inspector']
    },
    {
      id: 'inspector',
      icon: Info,
      label: 'Inspector',
      tier: 'secondary',
      group: 'navigate',
      priority: 2,
      component: asComponent(ContextPanel),
      defaultRegion: 'dock.right',
      keywords: ['properties', 'backlinks', 'comments']
    },
    // Edge strips. The icon-only `rail` and the sectioned `sidebar`
    // (0284) are gone (0353): the shipping shell renders its own sidebar
    // islands, and the unified tree is the one nav.
    {
      id: 'status',
      icon: PanelBottom,
      label: 'Status bar',
      tier: 'secondary',
      group: 'navigate',
      priority: 5,
      component: asComponent(StatusBar),
      defaultRegion: 'status',
      allowedRegions: ['status']
    },
    // 0166 left-panel views
    {
      id: 'explorer',
      icon: FolderTree,
      label: 'Explorer',
      tier: 'hero',
      group: 'navigate',
      priority: 10,
      component: asComponent(Explorer),
      defaultRegion: 'dock.left'
    },
    // The unified tree (0353): one list over the node graph, projected
    // through lenses — the successor to the type-siloed panels.
    {
      id: 'tree',
      icon: Layers,
      label: 'Tree',
      tier: 'hero',
      group: 'navigate',
      priority: 9,
      component: asComponent(UnifiedTree),
      defaultRegion: 'dock.left'
    },
    {
      id: 'chats',
      icon: MessagesSquare,
      label: 'Chats',
      tier: 'secondary',
      group: 'navigate',
      priority: 11,
      component: asComponent(ChatsPanel),
      defaultRegion: 'dock.left'
    },
    {
      id: 'tasks',
      icon: SquareCheck,
      label: 'Tasks',
      tier: 'hero',
      group: 'navigate',
      priority: 12,
      component: asComponent(TasksPanelView),
      defaultRegion: 'dock.left'
    },
    {
      id: 'today',
      icon: CalendarDays,
      label: 'Today',
      tier: 'secondary',
      group: 'navigate',
      priority: 13,
      component: asComponent(TodayPanel),
      defaultRegion: 'dock.left'
    },
    {
      id: 'data',
      icon: Database,
      label: 'Data',
      tier: 'secondary',
      group: 'tools',
      priority: 14,
      component: asComponent(DataPanelView),
      defaultRegion: 'dock.left'
    },
    {
      id: 'ai-chat',
      icon: Bot,
      label: 'AI',
      tier: 'secondary',
      group: 'tools',
      priority: 15,
      component: asComponent(AiChatPanel),
      defaultRegion: 'dock.left'
    },
    // 0273 dock residents
    {
      id: 'shelf',
      icon: Archive,
      label: 'Shelf',
      tier: 'hero',
      group: 'capture',
      priority: 20,
      component: asComponent(ShelfTray),
      defaultRegion: 'dock.corner'
    },
    {
      id: 'capture',
      icon: PenLine,
      label: 'Capture',
      tier: 'hero',
      group: 'capture',
      priority: 21,
      component: asComponent(QuickCaptureTray),
      defaultRegion: 'dock.corner'
    },
    {
      id: 'notifications',
      icon: Bell,
      label: 'Notifications',
      tier: 'hero',
      group: 'activity',
      priority: 22,
      component: asComponent(NotificationsTray),
      defaultRegion: 'dock.corner'
    },
    {
      id: 'sync',
      icon: RefreshCw,
      label: 'Sync',
      tier: 'secondary',
      group: 'activity',
      priority: 23,
      keywords: ['status', 'hub'],
      component: asComponent(SyncTray),
      defaultRegion: 'dock.corner'
    },
    {
      id: 'console',
      icon: Terminal,
      label: 'Console',
      tier: 'secondary',
      group: 'tools',
      priority: 24,
      keywords: ['query', 'sql'],
      component: asComponent(QueryConsoleTray),
      defaultRegion: 'dock.corner'
    },
    {
      id: 'workspace-plugins',
      icon: Layers,
      label: 'Workspace Plugins',
      tier: 'secondary',
      group: 'tools',
      priority: 25,
      keywords: ['plugin', 'sandbox', 'agent', 'hot reload'],
      description: 'Run and hot-reload sandboxed plugins built from PluginSource nodes (0331/0455)',
      component: asComponent(WorkspacePluginsDevView),
      defaultRegion: 'dock.corner'
    }
  ]
  for (const view of builtin) {
    if (!getSlotView(view.id)) registerSlotView(view)
  }
}
