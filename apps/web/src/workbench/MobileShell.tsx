/**
 * MobileShell — the compact (phone) composition (exploration 0196).
 *
 * The desktop workbench is a multi-pane VS Code grid; that can't fit a
 * 375px viewport. On compact widths we render a single full-bleed
 * surface with a minimal top bar and a thumb-reach bottom nav, and the
 * Left / Right / Bottom panels become edge-summoned Sheets that take
 * over the screen and dismiss on selection — "content first, chrome on
 * demand."
 *
 * Everything reuses the desktop pieces: the same router-authoritative
 * `EditorArea` surface, the same `PanelViewHost` / `ContextPanel`
 * bodies, and the same `useWorkbench` panel booleans. Only the
 * arrangement differs.
 */
import type { ReactNode } from 'react'
import { useLocation, useNavigate } from '@tanstack/react-router'
import { getCommandRegistry } from '@xnetjs/plugins'
import { DemoBanner, useDemoMode } from '@xnetjs/react'
import { BottomNav, Sheet, SheetContent } from '@xnetjs/ui'
import {
  CheckSquare2,
  FilePlus2,
  Files,
  Menu,
  PanelRightOpen,
  Search,
  Settings,
  type LucideIcon
} from 'lucide-react'
import { useLayoutEffect } from 'react'
import { GlobalSearch } from '../components/GlobalSearch'
import { WorkspaceCommands } from '../components/WorkspaceCommands'
import { navigateToNewDoc, type NavigateLike } from '../lib/doc-creation'
import { useWorkbenchCommands, useZenEscape } from './commands'
import { ContextPanel } from './ContextPanel'
import { EditorArea } from './EditorArea'
import { useFocusRing } from './focus'
import { PanelViewHost } from './PanelViewHost'
import { selectActiveTab, useWorkbench, type PanelSide } from './state'

/** Below the storage banner, filling the rest of the viewport as a column. */
const MOBILE_FRAME =
  'mt-[var(--storage-banner-height,0px)] flex h-[calc(100dvh-var(--storage-banner-height,0px))] flex-col bg-surface-1 text-ink-1'

/** Sheet body styling shared by all three edge panels. */
const SHEET_BODY = 'gap-0 border-hairline bg-surface-1 p-0'

function MobileDemoBanner() {
  const { isDemo, limits } = useDemoMode()
  if (!isDemo || !limits) return null
  return <DemoBanner evictionHours={limits.evictionHours} />
}

function TopBarButton({
  label,
  icon: Icon,
  active,
  onClick
}: {
  label: string
  icon: LucideIcon
  active?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={`touch-target tap-highlight-none flex items-center justify-center rounded border-none bg-transparent ${
        active ? 'text-ink-1' : 'text-ink-3 hover:text-ink-1'
      }`}
    >
      <Icon size={20} strokeWidth={1.5} />
    </button>
  )
}

function MobileTopBar({
  title,
  hasContext,
  onMenu,
  onContext,
  contextOpen
}: {
  title: string
  hasContext: boolean
  onMenu: () => void
  onContext: () => void
  contextOpen: boolean
}) {
  return (
    <header className="safe-area-inset-top flex h-12 shrink-0 items-center gap-1 border-b border-hairline bg-surface-1 px-1">
      <TopBarButton label="Open navigation" icon={Menu} onClick={onMenu} />
      <span className="min-w-0 flex-1 truncate px-1 text-sm font-medium text-ink-1">{title}</span>
      {hasContext && (
        <TopBarButton
          label="Details"
          icon={PanelRightOpen}
          active={contextOpen}
          onClick={onContext}
        />
      )}
    </header>
  )
}

/** A controlled edge Sheet hosting one of the existing panel bodies. */
function PanelSheet({
  side,
  open,
  onOpenChange,
  variant,
  className,
  children
}: {
  side: PanelSide
  open: boolean
  onOpenChange: (open: boolean) => void
  variant: 'left' | 'bottom'
  className: string
  children: ReactNode
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={variant}
        hideClose
        className={`${SHEET_BODY} ${className}`}
        data-wb-sheet={side}
      >
        {children}
      </SheetContent>
    </Sheet>
  )
}

interface NavDestination {
  label: string
  icon: LucideIcon
  active?: boolean
  onClick: () => void
}

function MobileBottomNav({ destinations }: { destinations: NavDestination[] }) {
  return (
    <BottomNav
      // Render in-flow (not fixed) so the surface shrinks above it
      // instead of hiding content behind it.
      className="static border-hairline bg-surface-1"
      items={destinations.map((d) => ({
        label: d.label,
        active: d.active,
        onClick: d.onClick,
        icon: <d.icon size={20} strokeWidth={1.5} />
      }))}
    />
  )
}

export function MobileShell({ children }: { children: ReactNode }) {
  // Same command/escape/focus wiring as the desktop shell.
  useWorkbenchCommands()
  useZenEscape()
  useFocusRing()

  const left = useWorkbench((state) => state.left)
  const right = useWorkbench((state) => state.right)
  const bottom = useWorkbench((state) => state.bottom)
  const setPanelOpen = useWorkbench((state) => state.setPanelOpen)
  const showPanelView = useWorkbench((state) => state.showPanelView)
  const activeTab = useWorkbench(selectActiveTab)
  const navigate = useNavigate()
  const { pathname } = useLocation()

  // Content-first: any open panel collapses on mount and on every
  // navigation, giving the list-detail "select → sheet dismisses"
  // feel. useLayoutEffect runs before paint, so a panel left open by
  // the shared desktop store never flashes over the surface.
  useLayoutEffect(() => {
    setPanelOpen('left', false)
    setPanelOpen('right', false)
    setPanelOpen('bottom', false)
  }, [pathname, setPanelOpen])

  // One overlay at a time: opening a side closes the others.
  const openOnly = (side: PanelSide) => {
    setPanelOpen('left', side === 'left')
    setPanelOpen('right', side === 'right')
    setPanelOpen('bottom', side === 'bottom')
  }

  // The menu / Explorer nav always summons the Explorer view (not whatever
  // the shared desktop left panel last showed), and toggles closed if the
  // Explorer is already showing.
  const toggleExplorer = () => {
    setPanelOpen('right', false)
    setPanelOpen('bottom', false)
    showPanelView('left', 'explorer')
  }
  const explorerOpen = left.open && left.activeViewId === 'explorer'

  const title = activeTab?.title?.trim() || 'xNet'
  const hasContext = activeTab != null

  const destinations: NavDestination[] = [
    {
      label: 'Explorer',
      icon: Files,
      active: explorerOpen,
      onClick: toggleExplorer
    },
    {
      label: 'Search',
      icon: Search,
      onClick: () => void getCommandRegistry().runCommand('search.open')
    },
    {
      label: 'New',
      icon: FilePlus2,
      onClick: () => void navigateToNewDoc(navigate as unknown as NavigateLike, 'page')
    },
    {
      label: 'Tasks',
      icon: CheckSquare2,
      active: pathname.startsWith('/tasks'),
      onClick: () => void navigate({ to: '/tasks' })
    },
    {
      label: 'Settings',
      icon: Settings,
      active: pathname.startsWith('/settings'),
      onClick: () => void navigate({ to: '/settings' })
    }
  ]

  return (
    <div className={MOBILE_FRAME}>
      <WorkspaceCommands />
      <GlobalSearch />
      <MobileDemoBanner />

      <MobileTopBar
        title={title}
        hasContext={hasContext}
        contextOpen={right.open}
        onMenu={toggleExplorer}
        onContext={() => (right.open ? setPanelOpen('right', false) : openOnly('right'))}
      />

      <main className="relative min-h-0 flex-1 overflow-hidden">
        <EditorArea>{children}</EditorArea>
      </main>

      <MobileBottomNav destinations={destinations} />

      {/* Left panel → full-takeover left sheet (Explorer / nav). */}
      <PanelSheet
        side="left"
        variant="left"
        open={left.open}
        onOpenChange={(open) => setPanelOpen('left', open)}
        className="w-[86vw] max-w-[20rem] safe-area-inset-y"
      >
        <PanelViewHost slot="left" />
      </PanelSheet>

      {/* Right (context) panel → bottom sheet (Properties / Comments). */}
      <PanelSheet
        side="right"
        variant="bottom"
        open={right.open}
        onOpenChange={(open) => setPanelOpen('right', open)}
        className="h-[85vh] rounded-t-2xl safe-area-inset-bottom"
      >
        <ContextPanel />
      </PanelSheet>

      {/* Bottom tray → bottom sheet (Capture / Console / Shelf). */}
      <PanelSheet
        side="bottom"
        variant="bottom"
        open={bottom.open}
        onOpenChange={(open) => setPanelOpen('bottom', open)}
        className="h-[70vh] rounded-t-2xl safe-area-inset-bottom"
      >
        <PanelViewHost slot="bottom" />
      </PanelSheet>
    </div>
  )
}
