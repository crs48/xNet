/**
 * CalmMobile — the calm shell's phone composition (exploration 0250, Phase 4).
 *
 * The same grammar as the desktop {@link CalmShell}, reflowed for a thumb: the
 * three modes drop to a bottom tab bar, the List becomes an edge Sheet, and the
 * contextual Canvas becomes a bottom Sheet. The main Surface is the same
 * router-outlet {@link CalmSurface} the desktop uses, so every route renders
 * here unchanged and there is exactly one `<main>` landmark.
 *
 * It reuses the workbench's command/escape/focus wiring and the `left`/`right`
 * panel booleans (as the List/Canvas sheets), and borrows MobileShell's `armed`
 * pattern so a persisted "open" panel can't leave a Base UI backdrop stuck over
 * the surface intercepting taps (see MobileShell for the full rationale).
 */
import type { ReactNode } from 'react'
import { useLocation, useNavigate } from '@tanstack/react-router'
import { getCommandRegistry } from '@xnetjs/plugins'
import { DemoBanner, useDemoMode } from '@xnetjs/react'
import { BottomNav, Sheet, SheetContent } from '@xnetjs/ui'
import { Menu, PanelRightOpen, Search, Settings, type LucideIcon } from 'lucide-react'
import { useLayoutEffect, useState } from 'react'
import { GlobalSearch } from '../../components/GlobalSearch'
import { WorkspaceCommands } from '../../components/WorkspaceCommands'
import { useWorkbenchCommands, useZenEscape } from '../commands'
import { useFocusRing } from '../focus'
import { selectActiveTab, useWorkbench, type PanelSide } from '../state'
import { MobileSyncGlyph } from '../SyncStatus'
import { CalmSurface } from './CalmSurface'
import { Canvas } from './Canvas'
import { ListPane } from './ListPane'
import { CALM_MODES, modeForPath } from './modes'

const MOBILE_FRAME =
  'mt-[var(--storage-banner-height,0px)] flex h-[calc(100dvh-var(--storage-banner-height,0px))] flex-col bg-surface-1 text-ink-1'

function CalmMobileBanner() {
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

export function CalmMobile({ children }: { children: ReactNode }) {
  useWorkbenchCommands()
  useZenEscape()
  useFocusRing()

  const left = useWorkbench((state) => state.left)
  const right = useWorkbench((state) => state.right)
  const setPanelOpen = useWorkbench((state) => state.setPanelOpen)
  const setCalmMode = useWorkbench((state) => state.setCalmMode)
  const storedMode = useWorkbench((state) => state.calmMode)
  const activeTab = useWorkbench(selectActiveTab)
  const navigate = useNavigate()
  const { pathname } = useLocation()

  const routeMode = modeForPath(pathname)
  const activeMode = routeMode ?? storedMode

  // Content-first: every panel starts closed and re-closes on navigation, and
  // the shared store defaults `left.open = true` — so close all and arm in the
  // same pre-paint effect (mirrors MobileShell; avoids a stuck dialog backdrop).
  const [armed, setArmed] = useState(false)
  useLayoutEffect(() => {
    setPanelOpen('left', false)
    setPanelOpen('right', false)
    setArmed(true)
  }, [pathname, setPanelOpen])

  const openOnly = (side: PanelSide) => {
    setPanelOpen('left', side === 'left')
    setPanelOpen('right', side === 'right')
  }

  const title =
    activeTab?.title?.trim() || CALM_MODES.find((m) => m.id === activeMode)?.label || 'xNet'
  const hasContext = activeTab != null

  const destinations = [
    ...CALM_MODES.map((mode) => ({
      label: mode.label,
      icon: mode.icon,
      active: activeMode === mode.id,
      onClick: () => {
        setCalmMode(mode.id)
        void navigate({ to: mode.home })
      }
    })),
    {
      label: 'Search',
      icon: Search,
      active: false,
      onClick: () => void getCommandRegistry().runCommand('search.open')
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
      <CalmMobileBanner />

      <header className="safe-area-inset-top flex h-12 shrink-0 items-center gap-1 border-b border-hairline bg-surface-1 px-2">
        <TopBarButton
          label="Open list"
          icon={Menu}
          active={left.open}
          onClick={() => (left.open ? setPanelOpen('left', false) : openOnly('left'))}
        />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink-1">{title}</span>
        <MobileSyncGlyph />
        {hasContext && (
          <TopBarButton
            label="Details"
            icon={PanelRightOpen}
            active={right.open}
            onClick={() => (right.open ? setPanelOpen('right', false) : openOnly('right'))}
          />
        )}
      </header>

      {/* Plain div, not <main>: CalmSurface already renders the <main> landmark. */}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <CalmSurface>{children}</CalmSurface>
      </div>

      <BottomNav
        className="static border-hairline bg-surface-1"
        items={destinations.map((d) => ({
          label: d.label,
          active: d.active,
          onClick: d.onClick,
          icon: <d.icon size={20} strokeWidth={1.5} />
        }))}
      />

      {/* The List → left Sheet (per-mode: conversations / Explorer / Network). */}
      <Sheet open={armed && left.open} onOpenChange={(open) => setPanelOpen('left', open)}>
        <SheetContent
          side="left"
          hideClose
          className="safe-area-inset-y w-[86vw] max-w-[20rem] gap-0 border-hairline bg-surface-1 p-0"
          data-wb-sheet="left"
        >
          <ListPane mode={activeMode} />
        </SheetContent>
      </Sheet>

      {/* The Canvas → bottom Sheet (artifact view or the inspector). */}
      <Sheet open={armed && right.open} onOpenChange={(open) => setPanelOpen('right', open)}>
        <SheetContent
          side="bottom"
          hideClose
          className="safe-area-inset-bottom h-[85vh] gap-0 rounded-t-2xl border-hairline bg-surface-1 p-0"
          data-wb-sheet="right"
        >
          <Canvas />
        </SheetContent>
      </Sheet>
    </div>
  )
}
