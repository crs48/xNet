/**
 * SurfaceDock — the quiet shell's bottom-right launcher (exploration 0273).
 *
 * The devtools grammar pointed at users: a corner glyph that expands into a
 * strip of `hero` panels, with `secondary` panels one hover away behind
 * "More" — and every panel reachable from ⌘K via a `Dock: …` command. Panels
 * are {@link SurfaceDockContribution}s: the workbench tray views (Shelf,
 * Capture, Notifications, Sync, Console) are the first residents, and
 * features/plugins contribute more through the same registry.
 *
 * The dock reuses the workbench's `bottom` panel state (open + activeViewId),
 * so ⌘J toggles it in quiet posture exactly as it toggles the tray when the
 * chrome is pinned — same state, different clothes.
 */
import type { SurfaceDockContribution, SurfaceDockTier } from '@xnetjs/plugins'
import { Presence } from '@xnetjs/ui'
import { LayoutGrid, MoreHorizontal, X, type LucideIcon } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { registerBuiltinSlotViews } from '../builtin-slot-views'
import { MoveViewMenu } from '../PanelViewHost'
import { registerSlotView, slotViewsInRegion } from '../slot-registry'
import { useWorkbench } from '../state'

// ─── Registry (slot-registry backed since 0280) ────────────────────

/**
 * Register a dock panel — a slot view defaulting to the corner dock.
 * Kept as the 0273 API; new code should use `registerSlotView` directly.
 */
export function registerSurfaceDockPanel(item: SurfaceDockContribution): () => void {
  return registerSlotView({ defaultRegion: 'dock.corner', ...item })
}

/**
 * The corner dock's current residents: views the layout tree places in
 * `dock.corner` (plus unplaced views defaulting there), by tier.
 */
export function getSurfaceDockPanels(tier?: SurfaceDockTier): SurfaceDockContribution[] {
  const all = slotViewsInRegion('dock.corner')
  return tier ? all.filter((item) => item.tier === tier) : all
}

/**
 * First-party residents (0273): registration now lives in the shared slot
 * registry; this remains the dock's idempotent entry point.
 */
export function registerBuiltinSurfaceDock(): void {
  registerBuiltinSlotViews()
}

function iconFor(item: SurfaceDockContribution): LucideIcon {
  return typeof item.icon === 'function' ? (item.icon as LucideIcon) : LayoutGrid
}

// ─── Launcher ──────────────────────────────────────────────────────

function DockItemButton({
  item,
  active,
  onOpen
}: {
  item: SurfaceDockContribution
  active: boolean
  onOpen: (id: string) => void
}) {
  const Icon = iconFor(item)
  return (
    <button
      type="button"
      title={item.label}
      aria-label={item.label}
      onClick={() => onOpen(item.id)}
      className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border-none bg-transparent transition-colors ${
        active ? 'text-ink-1' : 'text-ink-2 hover:text-ink-1'
      }`}
    >
      <Icon size={16} strokeWidth={1.5} />
    </button>
  )
}

/**
 * Esc walks the ladder: an open dock panel closes before anything else.
 * The palette and Sheet overlays preventDefault their own Esc first.
 */
function useDockEscape(panelOpen: boolean, onClose: () => void): void {
  useEffect(() => {
    if (!panelOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [panelOpen, onClose])
}

/** The summoned panel — the devtools move: a floating corner card. */
function DockPanelCard({
  all,
  active,
  onOpen,
  onClose
}: {
  all: SurfaceDockContribution[]
  active: SurfaceDockContribution
  onOpen: (id: string) => void
  onClose: () => void
}) {
  return (
    <section
      data-wb-region="bottom"
      aria-label={active.label}
      className="flex h-[22rem] w-[26rem] max-w-[calc(100vw-1rem)] flex-col overflow-hidden rounded-xl border border-hairline bg-surface-1 shadow-xl"
    >
      <header className="flex h-8 shrink-0 items-center justify-between gap-3 border-b border-hairline px-3">
        <div className="flex min-w-0 flex-1 items-center gap-3 overflow-x-auto">
          {all.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onOpen(item.id)}
              className={`shrink-0 cursor-pointer border-none bg-transparent p-0 text-[11px] font-medium uppercase tracking-wider transition-colors ${
                item.id === active.id ? 'text-ink-1' : 'text-ink-3 hover:text-ink-2'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <MoveViewMenu viewId={active.id} />
          <button
            type="button"
            title="Close dock"
            aria-label="Close dock"
            onClick={onClose}
            className="flex cursor-pointer items-center border-none bg-transparent p-0.5 text-ink-3 hover:text-ink-1"
          >
            <X size={13} strokeWidth={1.5} />
          </button>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <active.component />
      </div>
    </section>
  )
}

/** The "More" popover holding the secondary tier. */
function DockMoreMenu({
  secondary,
  open,
  onToggle,
  onOpen
}: {
  secondary: SurfaceDockContribution[]
  open: boolean
  onToggle: () => void
  onOpen: (id: string) => void
}) {
  return (
    <div className="relative">
      <button
        type="button"
        title="More panels"
        aria-label="More panels"
        aria-expanded={open}
        onClick={onToggle}
        className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border-none bg-transparent text-ink-3 transition-colors hover:text-ink-1"
      >
        <MoreHorizontal size={16} strokeWidth={1.5} />
      </button>
      <Presence show={open} motion="pop" className="absolute bottom-full right-0 mb-1">
        <div className="min-w-[10rem] rounded-lg border border-hairline bg-surface-1 py-1 shadow-lg">
          {secondary.map((item) => {
            const Icon = iconFor(item)
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onOpen(item.id)}
                className="flex w-full cursor-pointer items-center gap-2 border-none bg-transparent px-3 py-1.5 text-left text-xs text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink-1"
              >
                <Icon size={14} strokeWidth={1.5} />
                {item.label}
              </button>
            )
          })}
        </div>
      </Presence>
    </div>
  )
}

/** The main toggle glyph — the one always-visible dock affordance. */
function DockToggleButton({ panelOpen, onToggle }: { panelOpen: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      title={panelOpen ? 'Close dock (⌘J)' : 'Open dock (⌘J)'}
      aria-label="Toggle dock"
      aria-expanded={panelOpen}
      onClick={onToggle}
      className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border-none bg-transparent text-ink-2 transition-colors hover:text-ink-1"
    >
      <LayoutGrid size={16} strokeWidth={1.5} />
    </button>
  )
}

/**
 * The bottom-right corner cluster: collapsed to one glyph at rest, expanding
 * to the hero strip (+ "More" for secondary) on hover, focus, or tap. Opening
 * a panel drives the shared `bottom` panel state.
 */
export function SurfaceDockLauncher({ lit }: { lit: boolean }) {
  const bottom = useWorkbench((state) => state.bottom)
  const showPanelView = useWorkbench((state) => state.showPanelView)
  const setPanelOpen = useWorkbench((state) => state.setPanelOpen)
  const [expanded, setExpanded] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)

  const hero = getSurfaceDockPanels('hero')
  const secondary = getSurfaceDockPanels('secondary')
  const all = getSurfaceDockPanels()
  // Fall back to the first panel when the persisted activeViewId belongs to
  // the pinned tray (e.g. 'tray') — same fallback as PanelViewHost.
  const active = all.find((item) => item.id === bottom.activeViewId) ?? all[0]
  const panelOpen = bottom.open && active != null
  const stripVisible = expanded || panelOpen

  // Palette road: the slot registry's `slot.open:<id>` commands (0280).
  const close = useCallback(() => setPanelOpen('bottom', false), [setPanelOpen])
  useDockEscape(panelOpen, close)

  const open = (id: string) => {
    setMoreOpen(false)
    showPanelView('bottom', id)
  }
  const collapse = () => {
    setExpanded(false)
    setMoreOpen(false)
  }
  const toggle = () => (panelOpen ? close() : open(bottom.activeViewId || 'shelf'))

  return (
    <div
      className="absolute bottom-2 right-2 z-40 flex flex-col items-end gap-2"
      onPointerEnter={() => setExpanded(true)}
      onPointerLeave={collapse}
    >
      <Presence show={panelOpen} motion="slide-up">
        {active && <DockPanelCard all={all} active={active} onOpen={open} onClose={close} />}
      </Presence>

      {/* The launcher strip: one glyph at rest, hero items + More expanded.
          Dim = weaker decoration, never faded ink (glyphs hold ≥ Lc 60). */}
      <div
        data-coach="quiet.dock"
        className={`flex items-center gap-0.5 rounded-xl border border-hairline p-1 backdrop-blur transition-colors duration-normal ease-out ${
          lit || stripVisible ? 'bg-surface-1/95 shadow-sm' : 'bg-surface-1/60'
        }`}
      >
        {stripVisible && (
          <>
            {hero.map((item) => (
              <DockItemButton
                key={item.id}
                item={item}
                active={panelOpen && item.id === active?.id}
                onOpen={open}
              />
            ))}
            {secondary.length > 0 && (
              <DockMoreMenu
                secondary={secondary}
                open={moreOpen}
                onToggle={() => setMoreOpen((value) => !value)}
                onOpen={open}
              />
            )}
            <span className="mx-0.5 h-4 w-px bg-hairline" />
          </>
        )}
        <DockToggleButton panelOpen={panelOpen} onToggle={toggle} />
      </div>
    </div>
  )
}

// ─── Compact (FAB + bottom sheet) ──────────────────────────────────

/**
 * The dock's thumb twin (0273 touch-twin rule): on compact widths the corner
 * launcher is a FAB and the panel opens as the standard bottom Sheet — the
 * host (CalmMobile) supplies the Sheet; this renders the item grid + panel.
 */
export function SurfaceDockSheetContent({ onClose }: { onClose: () => void }) {
  const bottom = useWorkbench((state) => state.bottom)
  const showPanelView = useWorkbench((state) => state.showPanelView)
  const all = getSurfaceDockPanels()
  const active = all.find((item) => item.id === bottom.activeViewId) ?? all[0]

  if (!active) {
    return <div className="p-6 text-center text-sm text-ink-3">No dock panels registered.</div>
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-10 shrink-0 items-center gap-1 overflow-x-auto border-b border-hairline px-2">
        {all.map((item) => {
          const Icon = iconFor(item)
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => showPanelView('bottom', item.id)}
              className={`touch-target tap-highlight-none flex shrink-0 items-center gap-1.5 rounded-lg border-none bg-transparent px-2.5 text-xs font-medium ${
                item.id === active.id ? 'text-ink-1' : 'text-ink-3'
              }`}
            >
              <Icon size={14} strokeWidth={1.5} />
              {item.label}
            </button>
          )
        })}
        <span className="flex-1" />
        <button
          type="button"
          title="Close dock"
          aria-label="Close dock"
          onClick={onClose}
          className="touch-target tap-highlight-none flex items-center justify-center rounded border-none bg-transparent text-ink-3"
        >
          <X size={16} strokeWidth={1.5} />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <active.component />
      </div>
    </div>
  )
}
