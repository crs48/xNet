/**
 * MobileShell — the compact (phone) Floating composition (workbench redesign
 * 0289, adapting the desktop Floating Islands shell 0286 to a single column).
 *
 * The desktop's top-left island (profile, workspace, search, New, surface nav,
 * explorer) relocates into a floating control cluster at the BOTTOM of the
 * screen, and every docked side/bottom island becomes a floating inset "island"
 * sheet that hovers over the scrolling document (see {@link MobileOverlays}).
 * Top-to-bottom the flow is: app header → open-tabs strip → document; the bottom
 * cluster, status island, dev-tools circle, live-call PiP and assistant button
 * are absolutely positioned OVER the document, so content scrolls underneath.
 *
 * Everything reuses the desktop pieces: the router-authoritative
 * {@link EditorArea} surface (its own tab strip suppressed — the header strip
 * replaces it), the real {@link ContextPanel} / `explorer` / `ai-chat` views in
 * the sheets, and the shared `useWorkbench` store. Only the arrangement differs.
 */
import type { MobileOverlay } from './mobile-overlays'
import type { ShareDocType } from '../hooks/useShareLinks'
import type { ReactNode } from 'react'
import { useLocation, useNavigate } from '@tanstack/react-router'
import { useDevTools } from '@xnetjs/devtools'
import { getCommandRegistry } from '@xnetjs/plugins'
import { DemoBanner, useDemoMode, useIdentity } from '@xnetjs/react'
import { DIDAvatar, useTheme } from '@xnetjs/ui'
import {
  ChevronUp,
  FileText,
  LayoutGrid,
  Moon,
  PanelRight,
  Plus,
  Search,
  Sun,
  Wrench,
  X,
  type LucideIcon
} from 'lucide-react'
import { useLayoutEffect, useState } from 'react'
import { GlobalSearch } from '../components/GlobalSearch'
import { ShareDialog } from '../components/ShareDialog'
import { WorkspaceCommands } from '../components/WorkspaceCommands'
import { useWorkbenchCommands, useZenEscape } from './commands'
import { EditorArea } from './EditorArea'
import { useFocusRing } from './focus'
import { DoubleStar, MobileOverlays } from './mobile-overlays'
import { navigateToNode } from './navigation'
import { selectActiveTab, useWorkbench, type WorkbenchTab } from './state'
import { CHIP } from './SyncStatus'
import { TAB_VIEWS } from './tabs'
import { useSyncVitals } from './useSyncVitals'

const SHARE_TYPES: Partial<Record<WorkbenchTab['nodeType'], ShareDocType>> = {
  page: 'page',
  database: 'database',
  canvas: 'canvas',
  dashboard: 'dashboard',
  savedview: 'view',
  space: 'space'
}

/** Below the storage banner, filling the rest of the viewport as a column. */
const FRAME =
  'wb-root relative mt-[var(--storage-banner-height,0px)] flex h-[calc(100dvh-var(--storage-banner-height,0px))] flex-col overflow-hidden bg-island font-sans text-ink-1'

/** Island chrome shared by the floating cluster + status pill. */
const ISLAND = 'border border-hairline bg-island-b shadow-isl'

/** A bottom offset that clears the home-indicator safe area. */
const sb = (px: number) => `calc(env(safe-area-inset-bottom, 0px) + ${px}px)`

function MobileDemoBanner() {
  const { isDemo, limits } = useDemoMode()
  if (!isDemo || !limits) return null
  return <DemoBanner evictionHours={limits.evictionHours} />
}

/** App header — breadcrumb (→ Context sheet), collaborator facepile, panel toggle. */
function Header({
  title,
  icon: Icon,
  onBreadcrumb,
  onPanel,
  panelOpen
}: {
  title: string
  icon: LucideIcon
  onBreadcrumb: () => void
  onPanel: () => void
  panelOpen: boolean
}) {
  const { identity } = useIdentity()
  return (
    <header className="safe-area-inset-top flex h-[50px] shrink-0 items-center gap-2.5 border-b border-hairline py-0 pl-4 pr-3">
      <button
        type="button"
        onClick={onBreadcrumb}
        className="flex min-w-0 flex-1 items-center gap-2 border-none bg-transparent p-0 text-left cursor-pointer"
      >
        <Icon size={16} strokeWidth={1.75} className="shrink-0 text-ink-3" />
        <span className="min-w-0 truncate text-[15px] font-semibold text-ink-1">{title}</span>
      </button>

      {/* The "You" presence avatar (matches the desktop editor header). A live
          collaborator facepile lands when presence is wired — no placeholder
          count until it reflects real peers. */}
      {identity ? (
        <span className="flex shrink-0 rounded-full ring-2 ring-island" title="You">
          <DIDAvatar did={identity.did} size={24} />
        </span>
      ) : null}

      <button
        type="button"
        onClick={onPanel}
        title="Comments & properties"
        aria-label="Toggle details panel"
        aria-pressed={panelOpen}
        className={`flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[9px] border-none transition-colors cursor-pointer ${
          panelOpen ? 'bg-accent text-ink-1' : 'bg-transparent text-ink-2'
        }`}
      >
        <PanelRight size={18} strokeWidth={2} />
      </button>
    </header>
  )
}

/** Open-tabs strip — horizontal-scroll pills mirroring the active editor group. */
function TabStrip() {
  const navigate = useNavigate()
  const group = useWorkbench((s) => s.groups.find((g) => g.id === s.activeGroupId) ?? null)
  const tabs = group?.tabs ?? []
  if (!group || tabs.length === 0) return null

  const activate = (tab: WorkbenchTab) => {
    const state = useWorkbench.getState()
    state.focusGroup(group.id)
    state.activateTab(tab.id, group.id)
    navigateToNode(navigate, tab.nodeType, tab.nodeId, { preview: false })
  }
  const close = (tab: WorkbenchTab, e: React.MouseEvent) => {
    e.stopPropagation()
    const state = useWorkbench.getState()
    state.closeTab(tab.id, group.id)
    const next = state.groups.find((g) => g.id === state.activeGroupId)
    const active = next?.tabs.find((t) => t.id === next.activeTabId)
    if (active) navigateToNode(navigate, active.nodeType, active.nodeId, { preview: false })
    else void navigate({ to: '/' })
  }

  return (
    <div className="scrollbar-hide flex h-[42px] shrink-0 items-center gap-1.5 overflow-x-auto border-b border-hairline px-3">
      {tabs.map((tab) => {
        const Icon = TAB_VIEWS[tab.nodeType]?.icon
        const active = tab.id === group.activeTabId
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => activate(tab)}
            className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[9px] border-none px-2.5 py-1.5 text-[13px] transition-colors cursor-pointer ${
              active ? 'bg-accent text-ink-1' : 'bg-transparent text-ink-3'
            }`}
          >
            {Icon ? <Icon size={14} strokeWidth={1.75} className="text-ink-2" /> : null}
            {tab.title || TAB_VIEWS[tab.nodeType]?.label}
            {active && (
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => close(tab, e)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') close(tab, e as unknown as React.MouseEvent)
                }}
                className="flex text-ink-3"
                aria-label="Close tab"
              >
                <X size={13} strokeWidth={2} />
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

/** Status island — sync health + save state + theme toggle (real vitals). */
function StatusIsland() {
  const vitals = useSyncVitals()
  const { resolvedTheme, toggleTheme } = useTheme()
  const chip = CHIP[vitals.state]
  const saved = vitals.queueSize === 0 ? 'saved' : `${vitals.queueSize} unsaved`
  return (
    <div
      className={`absolute left-3 z-20 flex h-8 items-center justify-between rounded-full px-4 ${ISLAND}`}
      style={{ right: '52px', bottom: sb(22) }}
    >
      <div className="flex min-w-0 items-center gap-3 font-mono text-[11px] text-ink-2">
        <span className="flex items-center gap-1.5">
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${chip.tone}`} />
          {chip.label}
        </span>
      </div>
      <div className="flex items-center gap-2.5">
        <span className="font-mono text-[11px] text-ink-2">{saved}</span>
        <button
          type="button"
          onClick={toggleTheme}
          title="Toggle theme"
          aria-label="Toggle theme"
          className="flex items-center border-none bg-transparent p-0.5 text-ink-2 cursor-pointer"
        >
          {resolvedTheme === 'dark' ? (
            <Sun size={15} strokeWidth={1.75} />
          ) : (
            <Moon size={15} strokeWidth={1.75} />
          )}
        </button>
      </div>
    </div>
  )
}

/** The floating control cluster: profile+workspace pill, navigator, search, New. */
function BottomCluster({
  title,
  onProfile,
  onWorkspace,
  onNav,
  onSearch,
  onNew
}: {
  title: string
  onProfile: () => void
  onWorkspace: () => void
  onNav: () => void
  onSearch: () => void
  onNew: () => void
}) {
  const { identity } = useIdentity()
  const circle = `flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-full ${ISLAND} cursor-pointer`
  return (
    <div className="absolute inset-x-3 z-20 flex items-center gap-2.5" style={{ bottom: sb(64) }}>
      {/* Grouped oval: profile + workspace */}
      <div className={`flex h-[46px] shrink-0 items-center gap-0.5 rounded-full p-1.5 ${ISLAND}`}>
        <button
          type="button"
          onClick={onProfile}
          title="You"
          aria-label="Profile"
          className="relative flex h-9 w-9 items-center justify-center rounded-full border-none bg-transparent p-0 cursor-pointer"
        >
          {identity ? (
            <DIDAvatar did={identity.did} size={32} />
          ) : (
            <span className="h-8 w-8 rounded-full bg-background-muted" />
          )}
          <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-island-b bg-success" />
        </button>
        <button
          type="button"
          onClick={onWorkspace}
          title="Workspace"
          aria-label="Switch workspace"
          className="flex h-9 w-9 items-center justify-center border-none bg-transparent p-0 cursor-pointer"
        >
          <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-ink-1 text-[11px] font-bold tracking-tight text-island">
            xN
          </span>
        </button>
      </div>

      {/* Center oval: navigator / current tab */}
      <button
        type="button"
        onClick={onNav}
        title="Browse"
        className={`flex h-[46px] min-w-0 flex-1 items-center gap-2 rounded-full px-4 ${ISLAND}`}
      >
        <LayoutGrid size={16} strokeWidth={1.75} className="shrink-0 text-ink-2" />
        <span className="min-w-0 flex-1 truncate text-left text-[13.5px] font-medium text-ink-1">
          {title}
        </span>
        <ChevronUp size={15} strokeWidth={2} className="shrink-0 text-ink-3" />
      </button>

      {/* Search + New */}
      <button
        type="button"
        onClick={onSearch}
        title="Search"
        aria-label="Search"
        className={`${circle} text-ink-2`}
      >
        <Search size={18} strokeWidth={2} />
      </button>
      <button
        type="button"
        onClick={onNew}
        title="New"
        aria-label="New"
        className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-full border-none bg-primary text-primary-foreground shadow-isl cursor-pointer"
      >
        <Plus size={20} strokeWidth={2} />
      </button>
    </div>
  )
}

/** Dev-tools island — a detached wrench circle right of the status pill. */
function DevToolsCircle() {
  const dt = useDevTools()
  if (!dt.available) return null
  return (
    <button
      type="button"
      onClick={dt.toggle}
      title="Developer tools"
      aria-label="Toggle developer tools"
      aria-pressed={dt.isOpen}
      className={`absolute right-3 z-20 flex h-8 w-8 items-center justify-center rounded-full ${ISLAND} cursor-pointer ${
        dt.isOpen ? 'text-ink-1' : 'text-ink-2'
      }`}
      style={{ bottom: sb(22) }}
    >
      <Wrench size={15} strokeWidth={1.75} />
    </button>
  )
}

/** Assistant floating button — a double-star sparkle above the New button. */
function AssistantButton({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      title="Assistant"
      aria-label="Open assistant"
      className={`absolute right-3 z-[23] flex h-[46px] w-[46px] items-center justify-center rounded-full ${ISLAND} text-ink-1 cursor-pointer`}
      style={{ bottom: sb(118) }}
    >
      <DoubleStar size={26} />
    </button>
  )
}

export function MobileShell({ children }: { children: ReactNode }) {
  // Same command / escape / focus wiring as the desktop shell.
  useWorkbenchCommands()
  useZenEscape()
  useFocusRing()

  const { pathname } = useLocation()
  const activeTab = useWorkbench(selectActiveTab)
  const rightOpen = useWorkbench((s) => s.right.open)
  const setPanelOpen = useWorkbench((s) => s.setPanelOpen)

  const [ov, setOvState] = useState<MobileOverlay | null>(null)
  const [shareOpen, setShareOpen] = useState(false)

  // Single-overlay model: opening a sheet closes every other surface (the store
  // right panel included), and vice-versa. Both start closed and re-close on
  // navigation (the list-detail "select → dismiss" feel), so a persisted
  // desktop `right.open: true` never strands a sheet over the document.
  useLayoutEffect(() => {
    setPanelOpen('left', false)
    setPanelOpen('right', false)
    setPanelOpen('bottom', false)
    setOvState(null)
  }, [pathname, setPanelOpen])

  const setOv = (name: MobileOverlay | null) => {
    if (name !== null) setPanelOpen('right', false)
    setOvState(name)
  }
  const openRight = () => {
    setOvState(null)
    setPanelOpen('right', true)
  }
  const openNew = () => setOv('new')

  const title =
    activeTab?.title?.trim() || (activeTab && TAB_VIEWS[activeTab.nodeType]?.label) || 'xNet'
  const BreadIcon = (activeTab && TAB_VIEWS[activeTab.nodeType]?.icon) ?? FileText
  const shareType = activeTab ? SHARE_TYPES[activeTab.nodeType] : undefined

  return (
    <div className={FRAME} data-wb-shell="mobile">
      <WorkspaceCommands />
      <GlobalSearch />
      <MobileDemoBanner />

      <Header
        title={title}
        icon={BreadIcon}
        onBreadcrumb={() => setOv('context')}
        onPanel={() => (rightOpen ? setPanelOpen('right', false) : openRight())}
        panelOpen={rightOpen}
      />
      <TabStrip />

      {/* Document — the real editor surface. Its own tab strip is suppressed
          (the header strip replaces it); pill variant paints it on --canvas. */}
      <div className="relative min-h-0 flex-1 overflow-hidden bg-island">
        <EditorArea tabVariant="pill" hideTabStrip>
          {children}
        </EditorArea>
      </div>

      {/* Floating chrome over the document (not in the flex flow). */}
      <AssistantButton onOpen={() => setOv('assistant')} />
      <BottomCluster
        title={title}
        onProfile={() => setOv('profile')}
        onWorkspace={() => setOv('workspace')}
        onNav={() => setOv('nav')}
        onSearch={() => void getCommandRegistry().runCommand('search.open')}
        onNew={openNew}
      />
      <StatusIsland />
      <DevToolsCircle />

      <MobileOverlays
        ov={ov}
        setOv={setOv}
        onNew={openNew}
        onShare={() => {
          setOvState(null)
          if (shareType) setShareOpen(true)
        }}
      />

      {shareType && activeTab && (
        <ShareDialog
          docId={activeTab.nodeId}
          docType={shareType}
          isOpen={shareOpen}
          onClose={() => setShareOpen(false)}
        />
      )}
    </div>
  )
}
