/**
 * The unified sidebar tree (exploration 0353).
 *
 * One tree over the node graph, projected through a lens. Lens chips
 * replace the Explorer's type filters AND the surface switcher: picking
 * "Chats" is the same gesture as picking "Docs", because channels and
 * documents are rows of one list, not citizens of separate navs.
 *
 * Only the active lens's sources are mounted, so an unselected lens
 * costs zero queries (the per-schema fan-out is real — 0317).
 */
import { useNavigate } from '@tanstack/react-router'
import { Bell, BellOff } from 'lucide-react'
import { useMemo, useSyncExternalStore } from 'react'
import { navigateToNode } from '../navigation'
import { useWorkbench } from '../state'
import { TAB_VIEWS } from '../tabs'
import {
  effectiveBadge,
  sortSidebarRows,
  type SidebarRowModel,
  type SidebarRowSource
} from './contracts'
import { sidebarRegistry } from './registry'
import { registerBuiltinSidebarSources } from './sources'

registerBuiltinSidebarSources()

/** Subscribe to registry changes so plugin sources/lenses appear live. */
function useSidebarRegistry(): { lenses: ReturnType<typeof sidebarRegistry.getLenses> } {
  const lenses = useSyncExternalStore(
    (listener) => {
      const disposable = sidebarRegistry.onChange(listener)
      return () => disposable.dispose()
    },
    () => sidebarRegistry.getLenses(),
    () => sidebarRegistry.getLenses()
  )
  return { lenses }
}

/**
 * Rows for one lens.
 *
 * The sources' hooks are called in a loop, which is legal only because
 * this component is **keyed by lens id** — remounting on a lens change
 * is what keeps the hook order stable within any single mount. Do not
 * render it unkeyed.
 */
function LensRows({ sources, lensId }: { sources: SidebarRowSource[]; lensId: string }) {
  const lens = sidebarRegistry.getLens(lensId)
  // eslint-disable-next-line react-hooks/rules-of-hooks -- stable per mount (keyed)
  const rows = sources.flatMap((source) => source.useRows())
  const sorted = sortSidebarRows(rows, lens)

  if (sorted.length === 0) {
    return <p className="px-3 py-4 text-center text-xs text-ink-3">Nothing here yet.</p>
  }

  return (
    <div className="scroll-fade min-h-0 flex-1 overflow-y-auto px-1 pb-2">
      {sorted.map((row) => (
        <TreeRow key={`${row.nodeType}:${row.id}`} row={row} />
      ))}
    </div>
  )
}

function LensChips({
  lenses,
  activeLensId,
  onSelect
}: {
  lenses: Array<{ id: string; label: string }>
  activeLensId: string
  onSelect: (id: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-1 px-2 pb-1.5 pt-1">
      {lenses.map((lens) => (
        <button
          key={lens.id}
          type="button"
          onClick={() => onSelect(lens.id)}
          aria-pressed={lens.id === activeLensId}
          className={`rounded-full border px-2 py-0.5 text-[11px] transition-colors ${
            lens.id === activeLensId
              ? 'border-transparent bg-accent text-ink-1'
              : 'border-hairline bg-transparent text-ink-3 hover:text-ink-1'
          }`}
        >
          {lens.label}
        </button>
      ))}
    </div>
  )
}

function TreeRow({ row }: { row: SidebarRowModel }) {
  const navigate = useNavigate()
  const toggleRowMuted = useWorkbench((state) => state.toggleRowMuted)
  const Icon = row.icon ?? TAB_VIEWS[row.nodeType]?.icon
  const badge = effectiveBadge(row)
  // Chat-grade rows get a mute affordance; calm rows don't need one.
  const mutable = row.sortPolicy === 'recency'

  return (
    <div
      data-sidebar-row={row.id}
      data-sidebar-row-type={row.nodeType}
      className="group/row flex items-center gap-1.5 rounded-md px-2 py-1 text-[13px] text-ink-2 transition-colors hover:bg-accent hover:text-ink-1"
    >
      <button
        type="button"
        onClick={() => navigateToNode(navigate, row.nodeType, row.id)}
        className="flex min-w-0 flex-1 items-center gap-1.5 border-none bg-transparent p-0 text-left text-inherit"
      >
        {Icon && <Icon size={14} strokeWidth={1.75} className="shrink-0 text-ink-3" />}
        <span className={`truncate ${badge ? 'font-medium text-ink-1' : ''}`}>{row.title}</span>
      </button>
      {badge !== null && (
        <span className="shrink-0 rounded-full bg-primary px-1.5 text-[10px] font-medium text-primary-foreground">
          {badge}
        </span>
      )}
      {mutable && (
        <button
          type="button"
          onClick={() => toggleRowMuted(row.id)}
          aria-label={row.muted ? `Unmute ${row.title}` : `Mute ${row.title}`}
          title={row.muted ? 'Unmute' : 'Mute'}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded border-none bg-transparent text-ink-3 opacity-0 transition-opacity hover:text-ink-1 group-hover/row:opacity-100"
        >
          {row.muted ? <BellOff size={12} /> : <Bell size={12} />}
        </button>
      )}
    </div>
  )
}

export function UnifiedTree(): React.JSX.Element {
  const { lenses } = useSidebarRegistry()
  const activeLensId = useWorkbench((state) => state.activeLensId)
  const setActiveLens = useWorkbench((state) => state.setActiveLens)

  const lensId = (sidebarRegistry.getLens(activeLensId) ?? lenses[0])?.id ?? 'all'
  const sources = useMemo(
    () => sidebarRegistry.sourcesForLens(lensId),
    // Re-resolve when the lens or the registry contents change.
    [lensId, lenses]
  )

  return (
    <div data-unified-tree="true" className="flex min-h-0 flex-1 flex-col">
      <LensChips
        lenses={lenses.map((entry) => ({ id: entry.id, label: entry.label }))}
        activeLensId={lensId}
        onSelect={setActiveLens}
      />
      {/* Keyed by lens: only this lens's sources mount (an unselected
          lens costs no queries — the per-schema fan-out is real, 0317),
          and the remount is what keeps LensRows' hook loop stable. */}
      <LensRows key={lensId} lensId={lensId} sources={sources} />
    </div>
  )
}
