/**
 * PanelViewHost — renders the active view of a dock (exploration 0166,
 * slot-registry backed since 0280).
 *
 * Views live in the shell-wide slot registry; which dock shows them is the
 * layout tree's placement. The header carries the three-roads movement
 * affordances: a Move menu (pointer + touch) and a drag handle, both
 * dispatching the same `moveSlot` store action the palette commands run.
 */
import type { ComponentType } from 'react'
import { PopoverContent, PopoverRoot, PopoverTrigger } from '@xnetjs/ui'
import { ArrowLeftRight, X } from 'lucide-react'
import { useState } from 'react'
import { regionOf } from './layout-tree'
import {
  getSlotView,
  movableRegionsFor,
  registerSlotView,
  slotViewsInRegion
} from './slot-registry'
import { useWorkbench, type PanelSide } from './state'

export interface PanelViewDefinition {
  id: string
  title: string
  component: ComponentType
}

const SLOT_TO_REGION = {
  left: 'dock.left',
  right: 'dock.right',
  bottom: 'dock.bottom'
} as const

/** MIME type for dragging a slot view between docks (0280). */
export const SLOT_DRAG_TYPE = 'application/x-xnet-slot-view'

/**
 * Legacy registration shim (0166 API): panel views are slot contributions
 * with the dock as their default region.
 */
export function registerPanelView(slot: 'left' | 'bottom', view: PanelViewDefinition): () => void {
  return registerSlotView({
    id: view.id,
    label: view.title,
    tier: 'secondary',
    component: view.component,
    defaultRegion: SLOT_TO_REGION[slot]
  })
}

export function getPanelViews(slot: 'left' | 'bottom' | 'right'): PanelViewDefinition[] {
  return slotViewsInRegion(SLOT_TO_REGION[slot]).map((view) => ({
    id: view.id,
    title: view.label,
    component: view.component
  }))
}

/** The Move menu — the pointer/touch twin of the `slot.move:*` commands. */
export function MoveViewMenu({ viewId }: { viewId: string }) {
  const [open, setOpen] = useState(false)
  const view = getSlotView(viewId)
  const moveSlot = useWorkbench((state) => state.moveSlot)
  const currentRegion = useWorkbench((state) => regionOf(state.tree, viewId))
  if (!view) return null
  const targets = movableRegionsFor(view).filter(({ region }) => region !== currentRegion)
  if (targets.length === 0) return null
  return (
    <PopoverRoot open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        title="Move view"
        aria-label="Move view"
        className="flex cursor-pointer items-center border-none bg-transparent p-0.5 text-ink-3 hover:text-ink-1"
      >
        <ArrowLeftRight size={13} strokeWidth={1.5} />
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="end"
        className="w-auto min-w-[9rem] border-hairline bg-surface-1 p-1"
      >
        {targets.map(({ region, label }) => (
          <button
            key={region}
            type="button"
            onClick={() => {
              setOpen(false)
              moveSlot(viewId, region)
            }}
            className="flex w-full cursor-pointer items-center border-none bg-transparent px-2 py-1.5 text-left text-xs text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink-1"
          >
            Move to {label}
          </button>
        ))}
      </PopoverContent>
    </PopoverRoot>
  )
}

export function PanelViewHost({ slot }: { slot: 'left' | 'bottom' }) {
  const panel = useWorkbench((state) => state[slot as PanelSide])
  const setPanelOpen = useWorkbench((state) => state.setPanelOpen)
  // Subscribe to tree changes so placements re-render the host.
  useWorkbench((state) => state.tree)

  const views = getPanelViews(slot)
  const view = views.find((entry) => entry.id === panel.activeViewId) ?? views[0]

  if (!view) {
    return (
      <div className="flex h-full items-center justify-center bg-surface-1 text-ink-3">
        No view registered
      </div>
    )
  }

  const View = view.component

  return (
    <section data-wb-region={slot} className="flex h-full min-h-0 flex-col bg-surface-1">
      <header
        className="flex h-8 shrink-0 items-center justify-between gap-3 border-b border-hairline px-3"
        draggable
        onDragStart={(event) => {
          event.dataTransfer.setData(SLOT_DRAG_TYPE, view.id)
          event.dataTransfer.effectAllowed = 'move'
        }}
      >
        <PanelHeaderTitle slot={slot} activeViewId={view.id} activeTitle={view.title} />
        <div className="flex items-center gap-1">
          <MoveViewMenu viewId={view.id} />
          <button
            type="button"
            title="Close panel"
            aria-label="Close panel"
            onClick={() => setPanelOpen(slot, false)}
            className="flex cursor-pointer items-center border-none bg-transparent p-0.5 text-ink-3 hover:text-ink-1"
          >
            <X size={13} strokeWidth={1.5} />
          </button>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <View />
      </div>
    </section>
  )
}

/** Bottom slot renders its registered views as panel-local tabs. */
function PanelHeaderTitle({
  slot,
  activeViewId,
  activeTitle
}: {
  slot: 'left' | 'bottom'
  activeViewId: string
  activeTitle: string
}) {
  const views = getPanelViews(slot)
  if (slot !== 'bottom' || views.length <= 1) {
    return (
      <span className="text-[11px] font-medium uppercase tracking-wider text-ink-2">
        {activeTitle}
      </span>
    )
  }
  return (
    <div className="flex min-w-0 flex-1 items-center gap-3 overflow-x-auto">
      {views.map((entry) => (
        <button
          key={entry.id}
          type="button"
          onClick={() => useWorkbench.getState().showPanelView(slot, entry.id)}
          className={`shrink-0 cursor-pointer border-none bg-transparent p-0 text-[11px] font-medium uppercase tracking-wider transition-colors ${
            entry.id === activeViewId ? 'text-ink-1' : 'text-ink-3 hover:text-ink-2'
          }`}
        >
          {entry.title}
        </button>
      ))}
    </div>
  )
}
