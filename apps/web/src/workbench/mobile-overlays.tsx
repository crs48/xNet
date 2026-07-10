/**
 * Mobile overlays — the Floating shell's "island" sheets (workbench redesign
 * 0289, phone adaptation of 0286).
 *
 * On a phone every panel that was a docked island on desktop becomes a floating
 * inset sheet hovering over the scrolling document: inset 10px from its touching
 * edges, `rounded-[22px]`, hairline border, `shadow-pop`, over a dim scrim. A
 * single overlay is open at a time (`ov` in {@link MobileShell}); the right
 * context sheet is the one exception — it rides the shared store `right.open`
 * so the reused {@link ContextPanel} (and its close button) keep working.
 *
 * Everything wires to the SAME real state as the desktop shell: the Navigator's
 * Explorer segment renders the registered `explorer` slot view, the Assistant
 * sheet renders the real `ai-chat` view, New/Workspace/Profile reuse
 * {@link useNewActions} / {@link useSpaces} / identity, and Surfaces drive
 * `activeSurface` / `navPinned`. No fabricated conversations or trees.
 */
import type { SurfaceDef } from './surfaces'
import type { CreatableDocType } from '../lib/doc-creation'
import { useNavigate, useRouterState } from '@tanstack/react-router'
import { useIdentity } from '@xnetjs/react'
import { usePrefersReducedMotion, useTheme } from '@xnetjs/ui'
import {
  Check,
  FilePlus2,
  Files,
  FolderPlus,
  Globe,
  Layers,
  Link2,
  LogOut,
  Moon,
  Pin,
  Plus,
  Settings,
  Share2,
  SplitSquareHorizontal,
  Sun,
  User,
  X,
  type LucideIcon
} from 'lucide-react'
import { useRef, useState } from 'react'
import { useCommsMaybe } from '../comms/CommsContext'
import { SelfAvatar } from '../components/SelfAvatar'
import { useSpaces } from '../hooks/useSpaces'
import { DOC_TYPE_ROUTES } from '../lib/doc-creation'
import { logout } from '../lib/identity'
import { ContextPanel } from './ContextPanel'
import { navigateToNode } from './navigation'
import { useNewActions } from './new-actions'
import { SettingsSectionsNav } from './SettingsSectionsNav'
import { getSlotView } from './slot-registry'
import { selectActiveTab, useWorkbench, type WorkbenchTab } from './state'
import { DEFAULT_SURFACE, SURFACES, surfaceById, useSurfaceActivation } from './surfaces'
import { TAB_VIEWS, tabFromPathname } from './tabs'
import { NO_SPACE } from './views/explorer-scope'

/** Overlays driven by the single-overlay `ov` model. `right` rides the store. */
export type MobileOverlay = 'nav' | 'assistant' | 'new' | 'workspace' | 'profile' | 'context'
/** Navigator segments — `view` is the CONTEXTUAL first tab (see useContextualView). */
type NavSegment = 'view' | 'tabs' | 'surfaces'

const EASE = 'cubic-bezier(.32,.72,0,1)'

/** The double-star sparkle, the assistant's signature glyph (0289). */
function DoubleStar({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="none"
      aria-hidden
      className={className}
    >
      <path d="M10 2.5C10 6 6.5 9.5 3 9.5C6.5 9.5 10 13 10 16.5C10 13 13.5 9.5 17 9.5C13.5 9.5 10 6 10 2.5Z" />
      <path d="M16.7 13C16.7 15 14.7 17.5 12.2 17.5C14.7 17.5 16.7 20 16.7 22C16.7 20 18.7 17.5 21.2 17.5C18.7 17.5 16.7 15 16.7 13Z" />
    </svg>
  )
}

function Scrim({
  alpha,
  reduced,
  onClose
}: {
  alpha: number
  reduced: boolean
  onClose: () => void
}) {
  return (
    <div
      onClick={onClose}
      className="absolute inset-0 z-40"
      style={{
        background: `hsl(0 0% 0% / ${alpha})`,
        animation: reduced ? undefined : 'wb-scrim-in .15s var(--ease-out, ease-out)'
      }}
    />
  )
}

function Grabber() {
  return (
    <div className="flex h-5 shrink-0 items-center justify-center">
      <div className="h-[5px] w-[38px] rounded-full bg-ink-3/50" />
    </div>
  )
}

/** A bottom "island" sheet: inset 10px, radius 22, hairline, pop shadow. */
function BottomSheet({
  z = 50,
  height,
  reduced,
  duration = 0.22,
  className = '',
  children
}: {
  z?: number
  height?: string
  reduced: boolean
  duration?: number
  className?: string
  children: React.ReactNode
}) {
  return (
    <div
      className={`absolute inset-x-2.5 bottom-2.5 flex flex-col overflow-hidden rounded-[22px] border border-hairline bg-island shadow-pop ${className}`}
      style={{
        zIndex: z,
        height,
        animation: reduced ? undefined : `wb-sheet-up ${duration}s ${EASE}`
      }}
    >
      {children}
    </div>
  )
}

const ROW =
  'flex w-full items-center gap-3 rounded-[10px] border-none bg-transparent px-2.5 py-[11px] text-left text-[15px] text-ink-1 transition-colors cursor-pointer active:bg-accent'
const EYEBROW =
  'px-2.5 pb-1.5 pt-1.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-ink-3'

/** Segmented pill control (Navigator). Active segment lifts on an island fill. */
function Segmented<T extends string>({
  options,
  value,
  onChange
}: {
  options: { key: T; label: string }[]
  value: T
  onChange: (key: T) => void
}) {
  return (
    <div className="mx-3.5 mb-2 flex gap-0.5 rounded-[10px] bg-background-muted p-[3px]">
      {options.map((opt) => {
        const on = opt.key === value
        return (
          <button
            key={opt.key}
            type="button"
            onClick={() => onChange(opt.key)}
            className={`h-[30px] flex-1 rounded-lg border-none text-[12.5px] transition-colors cursor-pointer ${
              on
                ? 'bg-island font-semibold text-ink-1 shadow-isl'
                : 'bg-transparent font-medium text-ink-3'
            }`}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

/**
 * The Navigator's contextual first tab — the phone twin of the desktop bottom-
 * left island ({@link BottomIsland}). It follows the view you're looking at: the
 * Settings route shows the Settings section nav; otherwise it shows the active
 * panel surface (Explorer / Tasks / Chats / Today / Data / AI), defaulting to
 * Explorer. Route surfaces (Inbox, People, …) open in the editor and leave this
 * on its current panel, exactly as the desktop island does.
 */
function useContextualView(): {
  label: string
  Icon: LucideIcon
  Body: React.ComponentType | null
} {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const activeSurface = useWorkbench((s) => s.activeSurface)
  if (pathname === '/settings' || pathname.startsWith('/settings/')) {
    return { label: 'Settings', Icon: Settings, Body: SettingsSectionsNav }
  }
  // A panel surface with its own full-page route (Tasks, Data) wins while you're
  // on that route — so navigating there follows, not just picking it in Surfaces.
  const routed = tabFromPathname(pathname)
  const routedPanel = routed
    ? SURFACES.find((s) => s.kind === 'panel' && s.id === routed.nodeType)
    : undefined
  const fallback = surfaceById(DEFAULT_SURFACE)!
  const def = routedPanel ?? surfaceById(activeSurface) ?? fallback
  const panel = def.kind === 'panel' ? def : fallback
  const Body = panel.viewId ? (getSlotView(panel.viewId)?.component ?? null) : null
  return { label: panel.label, Icon: panel.icon, Body }
}

/** Navigator — the merged contextual-view / Open-tabs / Surfaces sheet (draggable). */
function NavigatorSheet({
  onClose,
  onOpenContext,
  onNew
}: {
  onClose: () => void
  onOpenContext: () => void
  onNew: () => void
}) {
  const reduced = usePrefersReducedMotion()
  const [seg, setSeg] = useState<NavSegment>('view')
  const [navH, setNavH] = useState(62)
  const activeTab = useWorkbench(selectActiveTab)
  const contextual = useContextualView()
  const title =
    activeTab?.title || (activeTab && TAB_VIEWS[activeTab.nodeType]?.label) || 'Workspace'
  const HeaderIcon = (activeTab && TAB_VIEWS[activeTab.nodeType]?.icon) ?? Files

  // Drag the grabber to resize; snap to 62/92, dismiss under 40 (basis = the
  // viewport height, since the shell fills 100dvh).
  const drag = useRef<{ y0: number; h0: number } | null>(null)
  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { y0: e.clientY, h0: navH }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return
    const dy = e.clientY - drag.current.y0
    const h = drag.current.h0 - (dy / window.innerHeight) * 100
    setNavH(Math.max(18, Math.min(94, h)))
  }
  const onPointerUp = () => {
    if (!drag.current) return
    drag.current = null
    setNavH((h) => {
      if (h < 40) {
        onClose()
        return 62
      }
      return h > 76 ? 92 : 62
    })
  }

  const ContextualBody = contextual.Body

  return (
    <BottomSheet z={50} height={`${navH}%`} reduced={reduced}>
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className="shrink-0 cursor-grab touch-none"
      >
        <Grabber />
      </div>

      {/* Current context header */}
      <div className="flex shrink-0 items-center gap-2.5 px-3.5 pb-2.5">
        <HeaderIcon size={16} strokeWidth={1.75} className="shrink-0 text-ink-2" />
        <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-ink-1">
          {title}
        </span>
        <button
          type="button"
          onClick={onOpenContext}
          title="Actions"
          aria-label="Node actions"
          className="flex h-[30px] w-[30px] items-center justify-center rounded-lg border-none bg-island-b text-ink-2 cursor-pointer active:opacity-60"
        >
          <span className="text-[18px] leading-none">⋯</span>
        </button>
      </div>

      <Segmented
        options={[
          { key: 'view', label: contextual.label },
          { key: 'tabs', label: 'Open tabs' },
          { key: 'surfaces', label: 'Surfaces' }
        ]}
        value={seg}
        onChange={setSeg}
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {seg === 'view' && (
          <div className="h-full min-h-0">{ContextualBody ? <ContextualBody /> : null}</div>
        )}
        {seg === 'tabs' && <OpenTabsList onClose={onClose} onNew={onNew} />}
        {seg === 'surfaces' && <SurfacesList onClose={onClose} onOpenView={() => setSeg('view')} />}
      </div>
    </BottomSheet>
  )
}

function OpenTabsList({ onClose, onNew }: { onClose: () => void; onNew: () => void }) {
  const navigate = useNavigate()
  const group = useWorkbench((s) => s.groups.find((g) => g.id === s.activeGroupId) ?? null)
  const tabs = group?.tabs ?? []

  const activate = (tab: WorkbenchTab) => {
    if (!group) return
    const state = useWorkbench.getState()
    state.focusGroup(group.id)
    state.activateTab(tab.id, group.id)
    navigateToNode(navigate, tab.nodeType, tab.nodeId, { preview: false })
    onClose()
  }
  const close = (tab: WorkbenchTab, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!group) return
    useWorkbench.getState().closeTab(tab.id, group.id)
  }

  return (
    <div className="px-2 pb-4">
      <div className={EYEBROW}>Open tabs</div>
      {tabs.map((tab) => {
        const Icon = TAB_VIEWS[tab.nodeType]?.icon ?? FilePlus2
        const active = tab.id === group?.activeTabId
        return (
          <div
            key={tab.id}
            role="button"
            tabIndex={0}
            onClick={() => activate(tab)}
            onKeyDown={(e) => (e.key === 'Enter' ? activate(tab) : undefined)}
            className={`flex items-center gap-2.5 rounded-[9px] px-2 py-2.5 cursor-pointer transition-colors active:bg-accent ${
              active ? 'bg-accent' : ''
            }`}
          >
            <Icon size={16} strokeWidth={1.75} className="shrink-0 text-ink-3" />
            <span
              className={`min-w-0 flex-1 truncate text-[14px] ${active ? 'font-semibold text-ink-1' : 'text-ink-2'}`}
            >
              {tab.title || TAB_VIEWS[tab.nodeType]?.label}
            </span>
            {active && <span className="font-mono text-[10px] text-ink-3">active</span>}
            <button
              type="button"
              onClick={(e) => close(tab, e)}
              title="Close tab"
              aria-label="Close tab"
              className="flex items-center border-none bg-transparent p-0.5 text-ink-3 cursor-pointer active:text-ink-1"
            >
              <X size={15} strokeWidth={2} />
            </button>
          </div>
        )
      })}
      <button
        type="button"
        onClick={onNew}
        className="mt-0.5 flex w-full items-center gap-2.5 rounded-[9px] border-none bg-transparent px-2 py-2.5 text-left text-ink-2 cursor-pointer active:bg-accent"
      >
        <Plus size={16} strokeWidth={2} />
        <span className="text-[14px]">New tab</span>
      </button>
    </div>
  )
}

function SurfacesList({ onClose, onOpenView }: { onClose: () => void; onOpenView: () => void }) {
  const navPinned = useWorkbench((s) => s.navPinned)
  const activeSurface = useWorkbench((s) => s.activeSurface)
  const toggleNavPinned = useWorkbench((s) => s.toggleNavPinned)
  const activate = useSurfaceActivation()

  const pick = (surface: SurfaceDef) => {
    activate(surface)
    // A route surface opens full-screen in the editor (dismiss the sheet); a
    // panel surface becomes the contextual view tab, so jump to it and stay.
    if (surface.kind === 'route') onClose()
    else onOpenView()
  }
  return (
    <div className="px-2 pb-4">
      <div className="flex items-center justify-between px-2.5 pb-1.5 pt-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-ink-3">
          Surfaces
        </span>
        <span className="text-[11px] text-ink-3">Pin to bottom bar</span>
      </div>
      {SURFACES.map((surface) => {
        const Icon = surface.icon
        const pinned = navPinned.includes(surface.id)
        const active = activeSurface === surface.id
        return (
          <div
            key={surface.id}
            role="button"
            tabIndex={0}
            onClick={() => pick(surface)}
            onKeyDown={(e) => (e.key === 'Enter' ? pick(surface) : undefined)}
            className={`flex items-center gap-3 rounded-[9px] px-2 py-2.5 cursor-pointer transition-colors active:bg-accent ${
              active ? 'bg-accent' : ''
            }`}
          >
            <Icon size={17} strokeWidth={1.75} className="shrink-0 text-ink-3" />
            <span className="min-w-0 flex-1 text-[14px] text-ink-1">{surface.label}</span>
            <button
              type="button"
              title={pinned ? 'Unpin from bottom bar' : 'Pin to bottom bar'}
              aria-label={pinned ? 'Unpin surface' : 'Pin surface'}
              aria-pressed={pinned}
              onClick={(e) => {
                e.stopPropagation()
                toggleNavPinned(surface.id)
              }}
              className={`flex items-center rounded-md p-1 ${
                pinned ? 'bg-accent text-ink-1' : 'text-ink-3'
              }`}
            >
              <Pin size={15} strokeWidth={1.75} className={pinned ? 'fill-current' : ''} />
            </button>
          </div>
        )
      })}
    </div>
  )
}

/** Right context sheet — reuses the real, contextual ContextPanel (0166). */
function RightSheet({ reduced, onClose }: { reduced: boolean; onClose: () => void }) {
  return (
    <div
      className="absolute inset-y-2.5 right-2.5 z-50 flex w-[82%] flex-col overflow-hidden rounded-[22px] border border-hairline bg-island shadow-pop"
      style={{ animation: reduced ? undefined : `wb-right-in .22s ${EASE}` }}
      data-wb-sheet="right"
    >
      <div className="flex shrink-0 items-center gap-2 px-4 pt-4">
        <span className="flex-1 text-[16px] font-semibold text-ink-1">Details</span>
        <button
          type="button"
          onClick={onClose}
          title="Close"
          aria-label="Close details"
          className="flex h-[34px] w-[34px] items-center justify-center rounded-[9px] border-none bg-island-b text-ink-2 cursor-pointer active:opacity-60"
        >
          <X size={18} strokeWidth={2} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <ContextPanel />
      </div>
    </div>
  )
}

/** Assistant sheet — the bottom-half island hosting the real AI chat view. */
function AssistantSheet({ reduced, onClose }: { reduced: boolean; onClose: () => void }) {
  const Ai = getSlotView('ai-chat')?.component
  return (
    <BottomSheet z={55} height="56%" reduced={reduced} duration={0.24}>
      <div className="flex shrink-0 items-center gap-2.5 border-b border-hairline px-4 pb-3 pt-4">
        <span className="flex h-[26px] w-[26px] items-center justify-center rounded-lg bg-ink-1 text-island">
          <DoubleStar size={15} />
        </span>
        <span className="flex-1 text-[16px] font-semibold text-ink-1">Assistant</span>
        <span className="h-[7px] w-[7px] rounded-full bg-success" />
        <button
          type="button"
          onClick={onClose}
          title="Close"
          aria-label="Close assistant"
          className="flex h-[34px] w-[34px] items-center justify-center rounded-[9px] border-none bg-island-b text-ink-2 cursor-pointer active:opacity-60"
        >
          <X size={18} strokeWidth={2} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">{Ai ? <Ai /> : null}</div>
    </BottomSheet>
  )
}

function NewSheet({ reduced, onClose }: { reduced: boolean; onClose: () => void }) {
  const { types, targetName, createDoc, createFolder, addShared } = useNewActions()
  const run = (fn: () => void) => {
    fn()
    onClose()
  }
  return (
    <BottomSheet reduced={reduced} duration={0.2} className="px-2 pb-4">
      <Grabber />
      <div className={EYEBROW}>{targetName ? `Creating in ${targetName}` : 'Create'}</div>
      {types.map((type: CreatableDocType) => {
        const route = DOC_TYPE_ROUTES[type]
        const Icon = route.icon
        return (
          <button
            key={type}
            type="button"
            className={ROW}
            onClick={() => run(() => createDoc(type))}
          >
            <Icon size={18} className="text-ink-3" />
            <span className="flex-1">New {route.label.toLowerCase()}</span>
            {type === 'page' && <span className="font-mono text-[11px] text-ink-3">⌘T</span>}
          </button>
        )
      })}
      <div className="mx-2 my-1.5 h-px bg-hairline" />
      <button type="button" className={ROW} onClick={() => run(() => void createFolder())}>
        <FolderPlus size={18} strokeWidth={1.75} className="text-ink-3" />
        <span className="flex-1">New folder</span>
      </button>
      <button type="button" className={ROW} onClick={() => run(addShared)}>
        <Link2 size={18} strokeWidth={1.75} className="text-ink-3" />
        <span className="flex-1">Add shared…</span>
      </button>
    </BottomSheet>
  )
}

function WorkspaceSheet({ reduced, onClose }: { reduced: boolean; onClose: () => void }) {
  const currentSpaceId = useWorkbench((s) => s.currentSpaceId)
  const setCurrentSpace = useWorkbench((s) => s.setCurrentSpace)
  const { spaces } = useSpaces()
  const pick = (id: string | null) => {
    setCurrentSpace(id)
    onClose()
  }
  const Row = ({
    active,
    label,
    icon,
    onClick
  }: {
    active: boolean
    label: string
    icon: React.ReactNode
    onClick: () => void
  }) => (
    <button type="button" className={ROW} onClick={onClick}>
      <span className="flex w-[18px] justify-center text-ink-3">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {active && <Check size={17} strokeWidth={2.2} className="text-ink-1" />}
    </button>
  )
  return (
    <BottomSheet reduced={reduced} duration={0.2} className="px-2 pb-4">
      <Grabber />
      <div className={EYEBROW}>Workspaces</div>
      <Row
        active={currentSpaceId === null}
        label="All workspaces"
        icon={<Globe size={18} strokeWidth={1.75} />}
        onClick={() => pick(null)}
      />
      {spaces.map((space) => (
        <Row
          key={space.id}
          active={currentSpaceId === space.id}
          label={space.name || 'Untitled workspace'}
          icon={
            space.icon ? (
              <span className="text-[15px] leading-none">{space.icon}</span>
            ) : (
              <Layers size={18} strokeWidth={1.75} />
            )
          }
          onClick={() => pick(space.id)}
        />
      ))}
      <Row
        active={currentSpaceId === NO_SPACE}
        label="No workspace"
        icon={<Layers size={18} strokeWidth={1.75} />}
        onClick={() => pick(NO_SPACE)}
      />
    </BottomSheet>
  )
}

function ProfileSheet({ reduced, onClose }: { reduced: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const { did } = useIdentity()
  const me = useCommsMaybe()?.me
  const { resolvedTheme, toggleTheme } = useTheme()
  const dark = resolvedTheme === 'dark'
  const go = (to: string) => {
    void navigate({ to })
    onClose()
  }
  return (
    <BottomSheet reduced={reduced} duration={0.2} className="px-2 pb-4">
      <Grabber />
      <div className="flex items-center gap-3 px-2.5 pb-3 pt-2">
        <SelfAvatar size={34} />
        <div className="min-w-0">
          <div className="truncate text-[15px] font-medium text-ink-1">
            {me?.name?.trim() || 'You'}
          </div>
          <div className="truncate font-mono text-[11px] text-ink-3">{did ?? '—'}</div>
        </div>
      </div>
      <button type="button" className={ROW} onClick={() => go('/settings')}>
        <User size={18} strokeWidth={1.75} className="text-ink-3" />
        <span className="flex-1">Profile</span>
      </button>
      <button type="button" className={ROW} onClick={() => go('/settings')}>
        <Settings size={18} strokeWidth={1.75} className="text-ink-3" />
        <span className="flex-1">Settings</span>
      </button>
      <button type="button" className={ROW} onClick={() => toggleTheme()}>
        {dark ? (
          <Sun size={18} strokeWidth={1.75} className="text-ink-3" />
        ) : (
          <Moon size={18} strokeWidth={1.75} className="text-ink-3" />
        )}
        <span className="flex-1">{dark ? 'Light mode' : 'Dark mode'}</span>
      </button>
      <div className="mx-2 my-1.5 h-px bg-hairline" />
      <button
        type="button"
        className={`${ROW} text-ink-2`}
        onClick={() => {
          onClose()
          void logout()
        }}
      >
        <LogOut size={18} strokeWidth={1.75} className="text-ink-3" />
        <span className="flex-1">Sign out</span>
      </button>
    </BottomSheet>
  )
}

/** Node actions for the active tab. Share + Open-in-split are wired to real
 *  store/dialog verbs; favourites/rename/delete route to the command palette
 *  where those verbs live, rather than duplicating half-implementations. */
function ContextSheet({
  reduced,
  onClose,
  onShare
}: {
  reduced: boolean
  onClose: () => void
  onShare: () => void
}) {
  const activeTab = useWorkbench(selectActiveTab)
  const title = activeTab?.title || (activeTab && TAB_VIEWS[activeTab.nodeType]?.label) || 'Node'
  const Icon = (activeTab && TAB_VIEWS[activeTab.nodeType]?.icon) ?? FilePlus2

  const split = () => {
    if (activeTab) {
      useWorkbench.getState().splitWith({
        nodeId: activeTab.nodeId,
        nodeType: activeTab.nodeType,
        title: activeTab.title
      })
    }
    onClose()
  }

  return (
    <BottomSheet z={56} reduced={reduced} duration={0.2} className="px-2 pb-4">
      <Grabber />
      <div className="flex items-center gap-2.5 px-2.5 pb-2.5 pt-1">
        <Icon size={17} strokeWidth={1.75} className="text-ink-2" />
        <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-ink-1">
          {title}
        </span>
      </div>
      <button type="button" className={ROW} onClick={onShare} disabled={!activeTab}>
        <Share2 size={17} strokeWidth={1.75} className="text-ink-3" />
        <span className="flex-1">Share</span>
      </button>
      <button type="button" className={ROW} onClick={split} disabled={!activeTab}>
        <SplitSquareHorizontal size={17} strokeWidth={1.75} className="text-ink-3" />
        <span className="flex-1">Open in split</span>
      </button>
    </BottomSheet>
  )
}

export function MobileOverlays({
  ov,
  setOv,
  onNew,
  onShare
}: {
  ov: MobileOverlay | null
  setOv: (name: MobileOverlay | null) => void
  onNew: () => void
  onShare: () => void
}) {
  const reduced = usePrefersReducedMotion()
  const rightOpen = useWorkbench((s) => s.right.open)
  const setPanelOpen = useWorkbench((s) => s.setPanelOpen)

  if (ov === null && !rightOpen) return null

  const closeAll = () => {
    setOv(null)
    setPanelOpen('right', false)
  }
  // Assistant floats over an undimmed document (its own scrim is transparent);
  // every other sheet dims the content behind it.
  const scrimAlpha = ov === 'assistant' ? 0 : 0.28

  return (
    <>
      <Scrim alpha={scrimAlpha} reduced={reduced} onClose={closeAll} />
      {ov === 'nav' && (
        <NavigatorSheet
          onClose={() => setOv(null)}
          onOpenContext={() => setOv('context')}
          onNew={onNew}
        />
      )}
      {rightOpen && <RightSheet reduced={reduced} onClose={() => setPanelOpen('right', false)} />}
      {ov === 'assistant' && <AssistantSheet reduced={reduced} onClose={() => setOv(null)} />}
      {ov === 'new' && <NewSheet reduced={reduced} onClose={() => setOv(null)} />}
      {ov === 'workspace' && <WorkspaceSheet reduced={reduced} onClose={() => setOv(null)} />}
      {ov === 'profile' && <ProfileSheet reduced={reduced} onClose={() => setOv(null)} />}
      {ov === 'context' && (
        <ContextSheet reduced={reduced} onClose={() => setOv(null)} onShare={onShare} />
      )}
    </>
  )
}

// Re-exported so the shell can render the same glyph on the floating button.
export { DoubleStar }
