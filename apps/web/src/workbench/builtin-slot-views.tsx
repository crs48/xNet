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
  ListTree,
  MessagesSquare,
  PanelBottom,
  PanelRight,
  PenLine,
  RefreshCw,
  SquareCheck,
  Terminal
} from 'lucide-react'
import { ChatsPanel } from '../comms/ChatsPanel'
import { Canvas } from './calm/Canvas'
import { ContextPanel } from './ContextPanel'
import { Rail } from './Rail'
import { Sidebar } from './Sidebar'
import { getSlotView, registerSlotView } from './slot-registry'
import { StatusBar } from './StatusBar'
import { AiChatPanel } from './views/AiChatPanel'
import { UnifiedTree } from './sidebar/UnifiedTree'
import { Explorer } from './views/Explorer'
import { DataPanelView, TasksPanelView } from './views/left'
import { ShelfTray } from './views/Shelf'
import { TodayPanel } from './views/TodayPanel'
import { NotificationsTray, QueryConsoleTray, QuickCaptureTray, SyncTray } from './views/tray'

/** Wrap a bare component so registry entries stay plain ComponentTypes. */
function asComponent(Component: ComponentType): ComponentType {
  return Component
}

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
    // Edge strips (not movable into docks)
    {
      id: 'rail',
      icon: PanelBottom,
      label: 'Rail',
      tier: 'secondary',
      group: 'navigate',
      priority: 4,
      component: asComponent(Rail),
      defaultRegion: 'rail',
      allowedRegions: ['rail']
    },
    // The single-shell sidebar (0284) — sectioned, labeled, collapsible; the
    // default tree's rail resident. Supersedes the icon-only Rail and the
    // calm ModeSwitch.
    {
      id: 'sidebar',
      icon: ListTree,
      label: 'Sidebar',
      tier: 'secondary',
      group: 'navigate',
      priority: 4,
      component: asComponent(Sidebar),
      defaultRegion: 'rail',
      allowedRegions: ['rail']
    },
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
    }
  ]
  for (const view of builtin) {
    if (!getSlotView(view.id)) registerSlotView(view)
  }
}
