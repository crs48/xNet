/**
 * Slot registry — every shell panel is a movable SlotContribution (0280).
 *
 * One registry replaces the three parallel ones the shells grew (the 0166
 * PanelViewHost maps, the 0273 SurfaceDock map, and the ShellFrame's bare
 * view tables). *What exists* lives here; *where it sits* lives in the
 * workbench store's LayoutTree — a view's `defaultRegion` only applies
 * until the user (or their agent) moves it.
 *
 * Registering a view also registers its movement verbs as palette
 * commands (`View: Move <label> to …`, `View: Hide <label>`), so every
 * slot has the keyboard road for free — drag and context menus are the
 * pointer/touch twins over the same store actions.
 */
import type { ComponentType } from 'react'
import { getCommandRegistry, type SlotContribution, type SlotRegion } from '@xnetjs/plugins'
import {
  Archive,
  Bell,
  Bot,
  CalendarDays,
  Compass,
  Database,
  FolderTree,
  Info,
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
import { ListPane } from './calm/ListPane'
import { ModeSwitch } from './calm/ModeSwitch'
import { useActiveCalmMode } from './calm/use-active-mode'
import { ContextPanel } from './ContextPanel'
import { placementOf, regionOf, type RegionId } from './layout-tree'
import { Rail } from './Rail'
import { useWorkbench } from './state'
import { StatusBar } from './StatusBar'
import { AiChatPanel } from './views/AiChatPanel'
import { Explorer } from './views/Explorer'
import { DataPanelView, TasksPanelView } from './views/left'
import { ShelfTray } from './views/Shelf'
import { TodayPanel } from './views/TodayPanel'
import { NotificationsTray, QueryConsoleTray, QuickCaptureTray, SyncTray } from './views/tray'

const registry = new Map<string, SlotContribution>()
const commandDisposers = new Map<string, Array<() => void>>()

/** The four docks a view can be moved between from menus/palette. */
const MOVABLE_REGIONS: Array<{ region: SlotRegion; label: string }> = [
  { region: 'dock.left', label: 'left dock' },
  { region: 'dock.right', label: 'right dock' },
  { region: 'dock.bottom', label: 'bottom dock' },
  { region: 'dock.corner', label: 'corner dock' }
]

export function movableRegionsFor(view: SlotContribution) {
  return MOVABLE_REGIONS.filter(
    ({ region }) => !view.allowedRegions || view.allowedRegions.includes(region)
  )
}

/** Where a view currently sits: the tree's placement, else its default. */
export function currentRegionOf(viewId: string): SlotRegion | RegionId | null {
  const tree = useWorkbench.getState().tree
  const placed = regionOf(tree, viewId)
  if (placed) return placed
  return registry.get(viewId)?.defaultRegion ?? 'dock.corner'
}

/** The dock PanelState side a region's views open through. */
function sideForRegion(region: SlotRegion | RegionId | null): 'left' | 'right' | 'bottom' {
  if (region === 'dock.left') return 'left'
  if (region === 'dock.right') return 'right'
  // dock.bottom and dock.corner share the bottom panel state (0273).
  return 'bottom'
}

function registerMoveCommands(view: SlotContribution): Array<() => void> {
  const commands = getCommandRegistry()
  const disposers: Array<() => void> = []
  // Every view is openable from the palette, wherever it currently sits —
  // the keyboard road of the L4 "compose" rung (0280 phase 4).
  disposers.push(
    commands.register({
      id: `slot.open:${view.id}`,
      title: `View: Open ${view.label}`,
      run: () =>
        useWorkbench.getState().showPanelView(sideForRegion(currentRegionOf(view.id)), view.id)
    }).dispose
  )
  for (const { region, label } of movableRegionsFor(view)) {
    disposers.push(
      commands.register({
        id: `slot.move:${view.id}:${region}`,
        title: `View: Move ${view.label} to ${label}`,
        when: () => currentRegionOf(view.id) !== region,
        run: () => useWorkbench.getState().moveSlot(view.id, region as RegionId)
      }).dispose
    )
  }
  disposers.push(
    commands.register({
      id: `slot.hide:${view.id}`,
      title: `View: Hide ${view.label}`,
      when: () =>
        placementOf(useWorkbench.getState().tree, view.id)?.tier !== 'hidden' &&
        placementOf(useWorkbench.getState().tree, view.id) !== null,
      run: () => useWorkbench.getState().setSlotTier(view.id, 'hidden')
    }).dispose,
    commands.register({
      id: `slot.show:${view.id}`,
      title: `View: Show ${view.label}`,
      when: () => placementOf(useWorkbench.getState().tree, view.id)?.tier === 'hidden',
      run: () => useWorkbench.getState().setSlotTier(view.id, 'summoned')
    }).dispose
  )
  return disposers
}

/** Register a slot view (idempotent by id) plus its movement commands. */
export function registerSlotView(view: SlotContribution): () => void {
  registry.set(view.id, view)
  commandDisposers.get(view.id)?.forEach((dispose) => dispose())
  commandDisposers.set(view.id, registerMoveCommands(view))
  return () => {
    registry.delete(view.id)
    commandDisposers.get(view.id)?.forEach((dispose) => dispose())
    commandDisposers.delete(view.id)
  }
}

export function getSlotView(id: string): SlotContribution | undefined {
  return registry.get(id)
}

function byPriority(a: SlotContribution, b: SlotContribution): number {
  return (a.priority ?? 0) - (b.priority ?? 0) || a.label.localeCompare(b.label)
}

export function getSlotViews(): SlotContribution[] {
  return [...registry.values()].sort(byPriority)
}

/**
 * Views currently sitting in a region — placed there by the tree, or
 * defaulting there while unplaced (a plugin panel registered at runtime
 * appears at its `defaultRegion` without a tree edit).
 */
export function slotViewsInRegion(region: SlotRegion | RegionId): SlotContribution[] {
  return getSlotViews().filter((view) => currentRegionOf(view.id) === region)
}

// ─── Frame views (bring their own chrome; rail/status strips) ─────────

function NavigatorSlotView() {
  const mode = useActiveCalmMode()
  return <ListPane mode={mode} />
}

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
      id: 'navigator',
      icon: ListTree,
      label: 'Navigator',
      tier: 'hero',
      group: 'navigate',
      priority: 0,
      component: NavigatorSlotView,
      defaultRegion: 'dock.left',
      keywords: ['list', 'documents']
    },
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
      id: 'modes',
      icon: Compass,
      label: 'Mode switch',
      tier: 'secondary',
      group: 'navigate',
      priority: 3,
      component: asComponent(ModeSwitch),
      defaultRegion: 'rail',
      allowedRegions: ['rail']
    },
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
    if (!registry.has(view.id)) registerSlotView(view)
  }
}
