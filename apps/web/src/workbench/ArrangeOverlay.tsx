/**
 * ArrangeOverlay — arrange mode (exploration 0282 phase 3).
 *
 * The iOS-jiggle pattern minus the jiggle: entered deliberately
 * (`workspace.customize`), the shell renders as a schematic of its own
 * layout tree — every dock a labeled, outlined slot; every view a chip
 * with a visible grab handle, a tier toggle and a hide control; hidden
 * views collected in a tray. Everything is teachable at once because the
 * user explicitly asked to see it.
 *
 * All mutations go through the SAME store actions the palette, menus and
 * drags use (`moveSlot` / `setSlotTier`) — this overlay is presentation
 * only, and the SlotAnnouncer keeps announcing/flashing beneath it.
 * Esc/Done exits; if the tree changed while arranging, the exit surfaces
 * a "Save as…" nudge into the 0280 workspace switcher.
 */
import type { SlotContribution } from '@xnetjs/plugins'
import { getCommandRegistry } from '@xnetjs/plugins'
import { Check, Eye, EyeOff, GripVertical, LayoutGrid, Pin, X } from 'lucide-react'
import { useEffect, useRef, useState, type DragEvent, type JSX } from 'react'
import { slotsIn, type LayoutTree, type RegionId, type SlotTier } from './layout-tree'
import { MoveViewMenu, SLOT_DRAG_TYPE } from './PanelViewHost'
import { beginSlotDrag, endSlotDrag } from './slot-drag'
import { getSlotView, movableRegionsFor } from './slot-registry'
import { regionLabel } from './SlotAnnouncer'
import { useWorkbench } from './state'

/** The dock regions the schematic lays out (rail/status shown read-only). */
const DOCK_REGIONS: RegionId[] = ['dock.left', 'dock.right', 'dock.bottom', 'dock.corner']

function canOccupy(view: SlotContribution | undefined, region: RegionId): boolean {
  if (!view) return false
  return movableRegionsFor(view).some((entry) => entry.region === region)
}

function tierGlyph(tier: SlotTier): JSX.Element {
  if (tier === 'pinned') return <Pin size={11} strokeWidth={1.5} />
  return <Eye size={11} strokeWidth={1.5} />
}

/** One view as a draggable, editable chip. */
function ViewChip({ viewId, tier }: { viewId: string; tier: SlotTier }) {
  const setSlotTier = useWorkbench((state) => state.setSlotTier)
  const view = getSlotView(viewId)
  if (!view) return null
  const Icon = typeof view.icon === 'function' ? view.icon : LayoutGrid
  const nextTier: SlotTier = tier === 'pinned' ? 'summoned' : 'pinned'

  return (
    <div
      draggable
      data-arrange-chip={viewId}
      onDragStart={(event) => {
        event.dataTransfer.setData(SLOT_DRAG_TYPE, viewId)
        event.dataTransfer.effectAllowed = 'move'
        beginSlotDrag(viewId)
      }}
      onDragEnd={endSlotDrag}
      className="flex cursor-grab items-center gap-1.5 rounded-lg border border-hairline bg-surface-1 px-2 py-1.5 text-xs text-ink-1 shadow-sm transition-colors duration-fast ease-out hover:border-ink-3 active:cursor-grabbing"
    >
      <GripVertical size={12} strokeWidth={1.5} className="shrink-0 text-ink-3" aria-hidden />
      <Icon size={13} strokeWidth={1.5} className="shrink-0 text-ink-2" />
      <span className="min-w-0 truncate">{view.label}</span>
      {tier !== 'hidden' && (
        <button
          type="button"
          title={tier === 'pinned' ? 'Pinned — click to summon-only' : 'Summoned — click to pin'}
          aria-label={`Tier: ${tier}. Switch to ${nextTier}`}
          onClick={() => setSlotTier(viewId, nextTier)}
          className={`flex cursor-pointer items-center rounded border-none bg-transparent p-0.5 ${
            tier === 'pinned' ? 'text-ink-1' : 'text-ink-3'
          } hover:text-ink-1`}
        >
          {tierGlyph(tier)}
        </button>
      )}
      {tier === 'hidden' ? (
        <button
          type="button"
          title="Show view"
          aria-label={`Show ${view.label}`}
          onClick={() => setSlotTier(viewId, 'summoned')}
          className="flex cursor-pointer items-center rounded border-none bg-transparent p-0.5 text-ink-3 hover:text-ink-1"
        >
          <Eye size={11} strokeWidth={1.5} />
        </button>
      ) : (
        <button
          type="button"
          title="Hide view"
          aria-label={`Hide ${view.label}`}
          onClick={() => setSlotTier(viewId, 'hidden')}
          className="flex cursor-pointer items-center rounded border-none bg-transparent p-0.5 text-ink-3 hover:text-ink-1"
        >
          <EyeOff size={11} strokeWidth={1.5} />
        </button>
      )}
      {/* The menu road stays available inside the mode (keyboard + tap). */}
      <MoveViewMenu viewId={viewId} />
    </div>
  )
}

/** One dock region as a labeled drop slot. */
function RegionSlot({ tree, region }: { tree: LayoutTree; region: RegionId }) {
  const moveSlot = useWorkbench((state) => state.moveSlot)
  const setSlotTier = useWorkbench((state) => state.setSlotTier)
  const [hovered, setHovered] = useState(0)
  const placements = slotsIn(tree, region).filter((placement) => placement.tier !== 'hidden')

  const onDrop = (event: DragEvent) => {
    setHovered(0)
    const viewId = event.dataTransfer.getData(SLOT_DRAG_TYPE)
    if (!viewId || !canOccupy(getSlotView(viewId), region)) return
    moveSlot(viewId, region)
    // A chip dragged out of the hidden tray becomes visible where it lands
    // (re-read the store: the snapshot from before the move is stale).
    const landed = useWorkbench
      .getState()
      .tree.regions[region]?.find((placement) => placement.viewId === viewId)
    if (landed?.tier === 'hidden') setSlotTier(viewId, 'summoned')
  }

  return (
    <section
      aria-label={regionLabel(region)}
      data-arrange-region={region}
      className={`flex min-h-24 flex-col gap-1.5 rounded-xl border-2 border-dashed p-3 transition-colors duration-normal ease-out ${
        hovered > 0 ? 'border-accent-ink bg-surface-2' : 'border-hairline bg-surface-1/60'
      }`}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes(SLOT_DRAG_TYPE)) event.preventDefault()
      }}
      onDragEnter={(event) => {
        if (event.dataTransfer.types.includes(SLOT_DRAG_TYPE)) setHovered((n) => n + 1)
      }}
      onDragLeave={() => setHovered((n) => Math.max(0, n - 1))}
      onDrop={onDrop}
    >
      <h3 className="text-[10px] font-medium uppercase tracking-wider text-ink-3">
        {regionLabel(region)}
      </h3>
      <div className="flex flex-wrap gap-1.5">
        {placements.map((placement) => (
          <ViewChip key={placement.viewId} viewId={placement.viewId} tier={placement.tier} />
        ))}
        {placements.length === 0 && (
          <span className="py-1 text-xs text-ink-3">Drop views here</span>
        )}
      </div>
    </section>
  )
}

/** Views hidden everywhere, ready to be dragged back in. */
function HiddenTray({ tree }: { tree: LayoutTree }) {
  const hidden = DOCK_REGIONS.flatMap((region) =>
    slotsIn(tree, region, 'hidden').map((placement) => placement.viewId)
  )
  if (hidden.length === 0) return null
  return (
    <section
      aria-label="Hidden views"
      className="flex flex-col gap-1.5 rounded-xl border border-hairline bg-surface-1/60 p-3"
    >
      <h3 className="text-[10px] font-medium uppercase tracking-wider text-ink-3">Hidden</h3>
      <div className="flex flex-wrap gap-1.5">
        {hidden.map((viewId) => (
          <ViewChip key={viewId} viewId={viewId} tier="hidden" />
        ))}
      </div>
    </section>
  )
}

export function ArrangeOverlay(): JSX.Element {
  const tree = useWorkbench((state) => state.tree)
  const setArranging = useWorkbench((state) => state.setArranging)
  const [nudge, setNudge] = useState(false)
  // Snapshot at entry: exiting with a changed tree earns the save nudge.
  const entryTree = useRef(tree)

  const exit = () => {
    if (entryTree.current !== useWorkbench.getState().tree) {
      setNudge(true)
      return
    }
    setArranging(false)
  }

  // Esc exits arrange BEFORE the shell ladder closes docks (capture +
  // preventDefault, which useShellEscape respects).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      event.preventDefault()
      exit()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="absolute inset-0 z-40 flex flex-col gap-3 overflow-y-auto bg-surface-0/95 p-6 backdrop-blur">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-medium text-ink-1">Customize layout</h2>
          <p className="text-xs text-ink-3">
            Drag views between docks, pin or hide them — then Done. Everything is undoable, and ⌘K
            reaches every move as a command.
          </p>
        </div>
        <button
          type="button"
          onClick={exit}
          className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-hairline bg-surface-1 px-3 py-1.5 text-sm font-medium text-ink-1 transition-colors duration-fast ease-out hover:bg-surface-2"
        >
          <Check size={14} strokeWidth={1.5} /> Done
        </button>
      </header>

      <div className="grid gap-3 md:grid-cols-2">
        {DOCK_REGIONS.map((region) => (
          <RegionSlot key={region} tree={tree} region={region} />
        ))}
      </div>
      <HiddenTray tree={tree} />

      {nudge && (
        <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-lg border border-hairline bg-surface-1 px-4 py-2.5 text-sm text-ink-1 shadow-lg">
          Keep this arrangement?
          <button
            type="button"
            onClick={() => {
              setNudge(false)
              setArranging(false)
              void getCommandRegistry().runCommand('workspace.saveAs')
            }}
            className="cursor-pointer border-none bg-transparent p-0 text-sm font-medium text-ink-1 underline"
          >
            Save as…
          </button>
          <button
            type="button"
            onClick={() => {
              setNudge(false)
              setArranging(false)
            }}
            className="flex cursor-pointer items-center border-none bg-transparent p-0.5 text-ink-3 hover:text-ink-1"
            aria-label="Dismiss"
          >
            <X size={13} strokeWidth={1.5} />
          </button>
        </div>
      )}
    </div>
  )
}
