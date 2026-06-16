/**
 * Explorer Scope Bar (exploration 0190) — the persistent, top-of-panel
 * workspace filter.
 *
 * It is the single, loud answer to "am I filtered, and to what?". It renders
 * *outside* the Explorer's text/type filter gate, so it never disappears, and
 * the active scope is a filled chip (bg-ink-1) — unmistakably distinct from the
 * subtle `hover:bg-accent` every other row uses. A plain click sets a single
 * scope (the create target); ⌘/Ctrl-click builds a multi-Space *view* filter
 * that never changes where new docs file. Self-hides until at least one Space
 * exists, so first-run stays clean.
 */
import { Check, ChevronDown, X } from 'lucide-react'
import { useState } from 'react'
import { useSpaces, type SpaceEntry } from '../../hooks/useSpaces'
import { useWorkbench } from '../state'
import { NO_SPACE, isRealSpace, toggleScopeSelection } from './explorer-scope'

const MAX_INLINE = 4

function ScopeChip({
  label,
  icon,
  active,
  onSelect,
  onClear
}: {
  label: string
  icon?: string
  active: boolean
  onSelect: (additive: boolean) => void
  onClear?: () => void
}) {
  return (
    <span
      className={`inline-flex h-[22px] items-center gap-1 rounded-full px-2 text-[11px] transition-colors ${
        active ? 'bg-ink-1 text-surface-0' : 'border border-hairline text-ink-2 hover:bg-accent hover:text-ink-1'
      }`}
    >
      <button
        type="button"
        aria-pressed={active}
        onClick={(event) => onSelect(event.metaKey || event.ctrlKey)}
        className="flex cursor-pointer items-center gap-1 border-none bg-transparent p-0 text-inherit"
      >
        {icon ? <span className="leading-none">{icon}</span> : null}
        <span className="max-w-28 truncate">{label}</span>
      </button>
      {active && onClear ? (
        <button
          type="button"
          aria-label={`Clear ${label}`}
          title={`Clear ${label}`}
          onClick={(event) => {
            event.stopPropagation()
            onClear()
          }}
          className="flex cursor-pointer items-center border-none bg-transparent p-0 text-inherit opacity-70 hover:opacity-100"
        >
          <X size={11} />
        </button>
      ) : null}
    </span>
  )
}

/** Searchable switcher for Spaces that don't fit inline. */
function MoreMenu({
  spaces,
  selectedIds,
  onSelect
}: {
  spaces: SpaceEntry[]
  selectedIds: Set<string>
  onSelect: (id: string, additive: boolean) => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const needle = search.trim().toLowerCase()
  const filtered = needle ? spaces.filter((s) => s.name.toLowerCase().includes(needle)) : spaces

  return (
    <span className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="inline-flex h-[22px] cursor-pointer items-center gap-0.5 rounded-full border border-hairline px-2 text-[11px] text-ink-2 transition-colors hover:bg-accent hover:text-ink-1"
      >
        More
        <ChevronDown size={11} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-20 mt-1 w-56 rounded-md border border-hairline bg-popover py-1 shadow-md">
          <input
            autoFocus
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Find a workspace…"
            className="mx-2 mb-1 h-6 w-[calc(100%-1rem)] rounded-sm border border-hairline bg-surface-0 px-2 text-xs text-ink-1 outline-none placeholder:text-ink-3"
          />
          <p className="px-3 pb-1 text-[10px] text-ink-3">Click to focus · ⌘-click to add</p>
          <div className="max-h-56 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-3 py-1.5 text-[11px] text-ink-3">No matches</p>
            ) : (
              filtered.map((space) => (
                <button
                  key={space.id}
                  type="button"
                  onClick={(event) => {
                    const additive = event.metaKey || event.ctrlKey
                    onSelect(space.id, additive)
                    if (!additive) setOpen(false)
                  }}
                  className="flex w-full cursor-pointer items-center gap-2 border-none bg-transparent px-3 py-1.5 text-left text-xs text-ink-2 hover:bg-accent hover:text-ink-1"
                >
                  <span className="flex w-3 shrink-0 justify-center">
                    {selectedIds.has(space.id) ? <Check size={12} /> : null}
                  </span>
                  {space.icon ? <span className="leading-none">{space.icon}</span> : null}
                  <span className="min-w-0 flex-1 truncate">{space.name || 'Untitled space'}</span>
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </span>
  )
}

export function ExplorerScopeBar() {
  const { spaces } = useSpaces()
  const scope = useWorkbench((s) => s.currentSpaceId)
  const filter = useWorkbench((s) => s.spaceFilter)
  const apply = useWorkbench((s) => s.applyScopeSelection)

  // No Spaces yet → nothing to scope; keep first-run clean.
  if (spaces.length === 0) return null

  const multi = filter.length > 0
  const selectedIds = new Set<string>([...(isRealSpace(scope) ? [scope] : []), ...filter])

  const select = (id: string, additive: boolean) => {
    const next = toggleScopeSelection({ scope, filter }, id, additive)
    apply(next.scope, next.filter)
  }

  // Keep every selected Space visible inline, then fill up to MAX_INLINE.
  const ordered = [
    ...spaces.filter((s) => selectedIds.has(s.id)),
    ...spaces.filter((s) => !selectedIds.has(s.id))
  ]
  const inline = ordered.slice(0, Math.max(MAX_INLINE, selectedIds.size))
  const hasOverflow = spaces.length > inline.length

  return (
    <div
      data-testid="explorer-scope-bar"
      className="flex flex-wrap items-center gap-1 border-b border-hairline px-2 py-1.5"
    >
      <ScopeChip label="All" active={scope === null && !multi} onSelect={() => apply(null, [])} />
      <ScopeChip
        label="No workspace"
        active={scope === NO_SPACE}
        onSelect={() => apply(NO_SPACE, [])}
      />
      {inline.map((space) => (
        <ScopeChip
          key={space.id}
          label={space.name || 'Untitled space'}
          icon={space.icon}
          active={selectedIds.has(space.id)}
          onSelect={(additive) => select(space.id, additive)}
          onClear={multi ? () => select(space.id, true) : () => apply(null, [])}
        />
      ))}
      {hasOverflow ? (
        <MoreMenu spaces={spaces} selectedIds={selectedIds} onSelect={select} />
      ) : null}
      {multi ? (
        <button
          type="button"
          onClick={() => apply(scope, [])}
          className="ml-0.5 cursor-pointer border-none bg-transparent text-[10px] uppercase tracking-wider text-ink-3 hover:text-ink-1"
        >
          Clear filter
        </button>
      ) : null}
    </div>
  )
}
