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
 *
 * This module stays COMPONENT-FREE (registry + commands only) so hosts
 * (PanelViewHost, SurfaceDock, ShellFrame) can import it without cycles;
 * the first-party residents live in builtin-slot-views.tsx.
 */
import { getCommandRegistry, type SlotContribution, type SlotRegion } from '@xnetjs/plugins'
import { placementOf, regionOf, type RegionId } from './layout-tree'
import { useWorkbench } from './state'

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
