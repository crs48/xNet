/**
 * SidebarIslands — the Floating shell's two stacked sidebar islands (0286).
 *
 * Top island (fixed): identity avatar → profile, workspace selector, Search
 * (⌘K), New, the pinned primary surface rows, and "More" → the surfaces
 * roll-out. Bottom island (flex-1): CONTEXTUAL — its header + body swap with
 * the active panel surface, rendering that surface's registered slot view
 * (Explorer, Tasks, Chats, Today, Data, AI). Route surfaces open in the editor
 * instead, so the bottom island always shows a panel.
 */
import type { FloatingMenuName } from './FloatingMenus'
import { useRouterState } from '@tanstack/react-router'
import { getCommandRegistry } from '@xnetjs/plugins'
import { useIdentity } from '@xnetjs/react'
import { DIDAvatar, usePrefersReducedMotion } from '@xnetjs/ui'
import {
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  ChevronUp,
  LayoutGrid,
  Plus,
  Search,
  Settings
} from 'lucide-react'
import { useLayoutEffect, useRef } from 'react'
import { useRequestCount } from '../hooks/useRequestCount'
import { useSpaces } from '../hooks/useSpaces'
import { useNewActions } from './new-actions'
import { SettingsSectionsNav } from './SettingsSectionsNav'
import { getSlotView } from './slot-registry'
import { useWorkbench } from './state'
import {
  DEFAULT_SURFACE,
  SURFACES,
  pinnedSurfaces,
  surfaceById,
  useSurfaceActivation,
  type SurfaceDef
} from './surfaces'
import { isRealSpace } from './views/explorer-scope'

type OpenMenu = (name: FloatingMenuName) => (e: React.MouseEvent) => void

const ISLAND =
  'flex flex-col overflow-hidden rounded-2xl border border-hairline bg-island-b shadow-isl'

function useRouteActive(): (to: string | undefined) => boolean {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  return (to) => Boolean(to) && (pathname === to || pathname.startsWith(`${to}/`))
}

function PrimaryRow({ surface }: { surface: SurfaceDef }) {
  const activeSurface = useWorkbench((s) => s.activeSurface)
  const activate = useSurfaceActivation()
  const routeActive = useRouteActive()
  const requestCount = useRequestCount()
  const Icon = surface.icon
  const active = surface.kind === 'route' ? routeActive(surface.to) : activeSurface === surface.id
  const count = surface.badge === 'requests' ? requestCount : undefined

  return (
    <button
      type="button"
      onClick={() => activate(surface)}
      className={`flex w-full items-center gap-2.5 rounded-lg border-none px-2 py-1.5 text-left text-[13px] transition-colors cursor-pointer ${
        active
          ? 'bg-accent font-medium text-ink-1'
          : 'bg-transparent text-ink-2 hover:bg-background-muted'
      }`}
    >
      <Icon size={16} strokeWidth={1.75} className="shrink-0" />
      <span className="min-w-0 flex-1 truncate">{surface.label}</span>
      {count !== undefined && count > 0 && surface.emphasis && (
        <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-ink-1 px-1.5 text-[11px] font-semibold text-island-b">
          {count}
        </span>
      )}
      {count !== undefined && count > 0 && !surface.emphasis && (
        <span className="font-mono text-[11px] text-ink-3">{count}</span>
      )}
    </button>
  )
}

/** An icon-only pinned surface (compact header). Unread → a corner dot. */
function CompactSurfaceButton({ surface }: { surface: SurfaceDef }) {
  const activeSurface = useWorkbench((s) => s.activeSurface)
  const activate = useSurfaceActivation()
  const routeActive = useRouteActive()
  const requestCount = useRequestCount()
  const Icon = surface.icon
  const active = surface.kind === 'route' ? routeActive(surface.to) : activeSurface === surface.id
  const unread = surface.badge === 'requests' && requestCount > 0
  return (
    <button
      type="button"
      onClick={() => activate(surface)}
      title={surface.label}
      aria-label={surface.label}
      className={`relative flex h-8 w-8 items-center justify-center rounded-lg border-none transition-colors cursor-pointer ${
        active ? 'bg-accent text-ink-1' : 'bg-transparent text-ink-2 hover:bg-background-muted'
      }`}
    >
      <Icon size={16} strokeWidth={1.75} />
      {unread && <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-ink-1" />}
    </button>
  )
}

function HeaderCaret({ compact, onToggle }: { compact: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={compact ? 'Expand sidebar header' : 'Collapse sidebar header'}
      aria-label={compact ? 'Expand sidebar header' : 'Collapse sidebar header'}
      aria-expanded={!compact}
      className="flex h-4 w-full items-center justify-center border-none bg-transparent px-2 pb-[7px] pt-0.5 text-ink-3 transition-colors cursor-pointer hover:bg-background-muted"
    >
      {compact ? (
        <ChevronDown size={16} strokeWidth={1.75} />
      ) : (
        <ChevronUp size={16} strokeWidth={1.75} />
      )}
    </button>
  )
}

function TopIsland({ openMenu }: { openMenu: OpenMenu }) {
  const { identity } = useIdentity()
  const navPinned = useWorkbench((s) => s.navPinned)
  const currentSpaceId = useWorkbench((s) => s.currentSpaceId)
  const compact = useWorkbench((s) => s.sidebarCompact)
  const toggleCompact = useWorkbench((s) => s.toggleSidebarCompact)
  const { getSpace } = useSpaces()
  const pinned = pinnedSurfaces(navPinned)
  const hiddenCount = SURFACES.length - pinned.length
  const space = isRealSpace(currentSpaceId) ? getSpace(currentSpaceId) : null
  const workspaceName = space?.name || 'My workspace'

  // Animate only the header island's height between the full/compact bodies;
  // the Explorer island below (flex-1) reflows to fill. Capture the prior
  // height, then transition old → new scrollHeight and release to `auto`.
  // Skipped under reduced-motion; the first paint seeds the height ref.
  const cardRef = useRef<HTMLDivElement>(null)
  const prevHeight = useRef<number | null>(null)
  const reduced = usePrefersReducedMotion()
  useLayoutEffect(() => {
    const el = cardRef.current
    if (!el) return
    const to = el.scrollHeight
    const from = prevHeight.current
    prevHeight.current = to
    if (reduced || from === null || from === to) return
    el.style.height = `${from}px`
    void el.offsetHeight // force reflow so the start height is committed
    el.style.transition = 'height 240ms cubic-bezier(.4,0,.2,1)'
    el.style.height = `${to}px`
    const done = () => {
      el.style.height = ''
      el.style.transition = ''
      el.removeEventListener('transitionend', done)
    }
    el.addEventListener('transitionend', done)
    return () => el.removeEventListener('transitionend', done)
  }, [compact, reduced])

  return (
    <div ref={cardRef} className={`${ISLAND} shrink-0`}>
      {compact ? (
        <div className="flex flex-col px-2 pt-2">
          {/* Row 1: avatar + workspace selector + search + new */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={openMenu('profile')}
              title="You"
              aria-label="Profile"
              className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full border-none bg-transparent p-0 cursor-pointer"
            >
              {identity ? (
                <DIDAvatar did={identity.did} size={28} />
              ) : (
                <span className="h-7 w-7 rounded-full bg-background-muted" />
              )}
            </button>
            <button
              type="button"
              onClick={openMenu('workspace')}
              className="flex h-[30px] min-w-0 flex-1 items-center gap-2 rounded-lg border-none bg-transparent px-1.5 cursor-pointer hover:bg-background-muted"
              data-coach="workspace.switch"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px] bg-ink-1 text-[12px] font-bold tracking-tight text-island">
                xN
              </span>
              <span className="min-w-0 flex-1 truncate text-left text-[13px] font-semibold text-ink-1">
                {workspaceName}
              </span>
            </button>
            <button
              type="button"
              onClick={() => void getCommandRegistry().runCommand('search.open')}
              title="Search (⌘K)"
              aria-label="Search"
              className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg border-none bg-transparent text-ink-2 cursor-pointer hover:bg-background-muted hover:text-ink-1"
            >
              <Search size={16} strokeWidth={1.75} />
            </button>
            <button
              type="button"
              onClick={openMenu('new')}
              title="New"
              aria-label="New"
              className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg border-none bg-primary text-primary-foreground cursor-pointer hover:bg-primary-hover"
            >
              <Plus size={16} strokeWidth={2} />
            </button>
          </div>
          <div className="mx-0.5 my-2 h-px bg-hairline" />
          {/* Row 2: pinned surfaces (icon-only) + More */}
          <div className="flex flex-wrap gap-1">
            {pinned.map((surface) => (
              <CompactSurfaceButton key={surface.id} surface={surface} />
            ))}
            <button
              type="button"
              onClick={openMenu('surfaces')}
              title="More surfaces"
              aria-label="More surfaces"
              className="flex h-8 w-8 items-center justify-center rounded-lg border-none bg-transparent text-ink-3 cursor-pointer hover:bg-background-muted hover:text-ink-1"
            >
              <LayoutGrid size={16} strokeWidth={1.75} />
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Row 1: avatar + workspace selector */}
          <div className="flex items-center gap-2 px-2 pt-2">
            <button
              type="button"
              onClick={openMenu('profile')}
              title="You"
              aria-label="Profile"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-none bg-transparent p-0 cursor-pointer"
            >
              {identity ? (
                <DIDAvatar did={identity.did} size={32} />
              ) : (
                <span className="h-8 w-8 rounded-full bg-background-muted" />
              )}
            </button>
            <button
              type="button"
              onClick={openMenu('workspace')}
              className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg border-none bg-transparent px-2 py-1.5 cursor-pointer hover:bg-background-muted"
              data-coach="workspace.switch"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px] bg-ink-1 text-[12px] font-bold tracking-tight text-island">
                xN
              </span>
              <span className="min-w-0 flex-1 truncate text-left text-[13.5px] font-semibold text-ink-1">
                {workspaceName}
              </span>
              <ChevronsUpDown size={15} strokeWidth={2} className="shrink-0 text-ink-3" />
            </button>
          </div>

          {/* Search + New */}
          <div className="flex flex-col gap-1.5 px-2 pb-1 pt-1.5">
            <button
              type="button"
              onClick={() => void getCommandRegistry().runCommand('search.open')}
              className="flex w-full items-center gap-2 rounded-[9px] border border-hairline bg-island px-2.5 py-1.5 cursor-pointer hover:border-border-emphasis"
            >
              <Search size={15} strokeWidth={1.75} className="text-ink-3" />
              <span className="flex-1 text-left text-[13px] text-ink-3">Search</span>
              <kbd className="rounded border border-hairline bg-surface-1 px-1.5 py-px font-mono text-[11px] text-ink-3">
                ⌘K
              </kbd>
            </button>
            <button
              type="button"
              onClick={openMenu('new')}
              className="flex w-full items-center gap-2 rounded-[9px] border-none bg-primary px-2.5 py-1.5 text-[13px] font-medium text-primary-foreground cursor-pointer hover:bg-primary-hover"
            >
              <Plus size={15} strokeWidth={2} />
              New
              <span className="flex-1" />
              <ChevronRight size={14} strokeWidth={2} className="rotate-90 opacity-70" />
            </button>
          </div>

          {/* Primary surface rows + More */}
          <div className="flex flex-col gap-px px-2 pt-1">
            {pinned.map((surface) => (
              <PrimaryRow key={surface.id} surface={surface} />
            ))}
            <button
              type="button"
              onClick={openMenu('surfaces')}
              className="flex w-full items-center gap-2.5 rounded-lg border-none bg-transparent px-2 py-1.5 text-left text-[13px] text-ink-3 cursor-pointer hover:bg-background-muted"
            >
              <LayoutGrid size={16} strokeWidth={1.75} className="shrink-0" />
              <span className="flex-1">More</span>
              {hiddenCount > 0 && (
                <span className="font-mono text-[11px] text-ink-3">{hiddenCount}</span>
              )}
              <ChevronRight size={14} strokeWidth={2} className="text-ink-3" />
            </button>
          </div>
        </>
      )}

      <HeaderCaret compact={compact} onToggle={toggleCompact} />
    </div>
  )
}

function BottomIsland() {
  const activeSurface = useWorkbench((s) => s.activeSurface)
  const { createDoc } = useNewActions()
  const onSettings = useRouterState({
    select: (s) =>
      s.location.pathname === '/settings' || s.location.pathname.startsWith('/settings/')
  })

  // When Settings is open, the bottom island hosts its section nav (0288); the
  // section content renders in the main area via the `/settings` route.
  if (onSettings) {
    return (
      <div className={`${ISLAND} min-h-0 flex-1`}>
        <div className="flex items-center gap-2 px-3 pb-2 pt-2.5">
          <Settings size={16} strokeWidth={1.75} className="text-ink-2" />
          <span className="text-[13px] font-semibold text-ink-1">Settings</span>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          <SettingsSectionsNav />
        </div>
      </div>
    )
  }

  const def = surfaceById(activeSurface) ?? surfaceById(DEFAULT_SURFACE)!
  const panel = def.kind === 'panel' ? def : surfaceById(DEFAULT_SURFACE)!
  const view = panel.viewId ? getSlotView(panel.viewId) : undefined
  const Body = view?.component
  const Icon = panel.icon

  // Surface-aware "+": Explorer files a page into the active Space, Data makes a
  // database. Surfaces that carry their own in-panel create (Tasks/Chats/…) —
  // or have nothing to create — hide the header +.
  const create =
    panel.id === 'explorer'
      ? () => createDoc('page')
      : panel.id === 'data'
        ? () => createDoc('database')
        : null

  return (
    <div className={`${ISLAND} min-h-0 flex-1`}>
      <div className="flex items-center gap-2 px-3 pb-2 pt-2.5">
        <Icon size={16} strokeWidth={1.75} className="text-ink-2" />
        <span className="text-[13px] font-semibold text-ink-1">{panel.label}</span>
        <span className="flex-1" />
        {create && (
          <button
            type="button"
            title={`New in ${panel.label}`}
            aria-label={`New in ${panel.label}`}
            onClick={create}
            className="flex h-6 w-6 items-center justify-center rounded-md border-none bg-transparent text-ink-2 cursor-pointer hover:bg-background-muted hover:text-ink-1"
          >
            <Plus size={15} strokeWidth={1.75} />
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">{Body ? <Body /> : null}</div>
    </div>
  )
}

export function SidebarIslands({ openMenu }: { openMenu: OpenMenu }) {
  const sidebarWidth = useWorkbench((s) => s.sidebarWidth)
  return (
    <div
      className="flex min-h-0 shrink-0 flex-col gap-2"
      style={{ width: sidebarWidth }}
      data-wb-region="sidebar"
    >
      <TopIsland openMenu={openMenu} />
      <BottomIsland />
    </div>
  )
}
