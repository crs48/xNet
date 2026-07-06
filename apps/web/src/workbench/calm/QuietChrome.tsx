/**
 * QuietChrome — the calm shell's quiet posture (exploration 0273).
 *
 * The surface owns the whole viewport at rest; the pinned shell's chrome is
 * summoned instead of shown. Corner glyphs (modes + identity + settings,
 * top-left; sync, bottom-left) sit dimmed at L0 and light on pointer intent
 * (L1). The List and contextual Canvas open as edge overlays (L2) from a
 * dwell-armed hot zone, the existing ⌘B / ⌘\ chords, or ⌘K — three roads to
 * every drawer. Esc / scrim walks the ladder back down; the overlays are the
 * same Sheet the mobile shell uses, so dismissal, scrim and a11y match.
 *
 * Same components, same panel booleans, same route→mode table as the pinned
 * CalmShell — only the composition differs.
 */
import { Link, useLocation, useNavigate } from '@tanstack/react-router'
import { getCommandRegistry } from '@xnetjs/plugins'
import { useIdentity } from '@xnetjs/react'
import { PopoverContent, PopoverRoot, PopoverTrigger, Sheet, SheetContent } from '@xnetjs/ui'
import { Search, Settings, type LucideIcon } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { contributeTips } from '../../coachmarks'
import { useWorkbench, type CalmMode, type PanelSide } from '../state'
import { CHIP, SystemInfoDetails } from '../SyncStatus'
import { useSyncVitals } from '../useSyncVitals'
import { Canvas } from './Canvas'
import { ListPane } from './ListPane'
import { CALM_MODES } from './modes'
import { registerBuiltinSurfaceDock, SurfaceDockLauncher } from './SurfaceDock'

registerBuiltinSurfaceDock()

/** Pointer intent: within this many px of a viewport edge lights the glyphs. */
const EDGE_PROXIMITY = 120
/** Hover this long over an edge hot-zone before the overlay summons. */
const SUMMON_DWELL_MS = 180
/** Touch lights the glyphs for this long (no hover to sustain L1). */
const TOUCH_LIT_MS = 3000

// The quiet posture's one first-run tip (0273): chrome is summonable, never
// absent — say so once, at the corner that proves it. Registered for the two
// landing views (home list, and the Desk canvas once 0273 Phase 2 lands); the
// anchor only exists in quiet posture, so pinned users never see it.
contributeTips([
  {
    id: 'home:quiet-corners@1',
    view: 'home',
    anchor: '[data-coach="quiet.corners"]',
    title: 'Your workspace, quiet',
    body: 'Chrome lives at the edges now. Hover a side (or press ⌘B, ⌘\\, ⌘K) to summon it.',
    side: 'bottom'
  },
  {
    id: 'canvas:quiet-corners@1',
    view: 'canvas',
    anchor: '[data-coach="quiet.corners"]',
    title: 'Your workspace, quiet',
    body: 'Chrome lives at the edges now. Hover a side (or press ⌘B, ⌘\\, ⌘K) to summon it.',
    side: 'bottom'
  }
])

/**
 * L0 → L1 intent: lit while the pointer is near any viewport edge (or for a
 * beat after a touch), dim again once it returns to the center. rAF-throttled;
 * keyboard focus lights the clusters via CSS `focus-within` instead.
 */
function useEdgeIntent(): boolean {
  const [lit, setLit] = useState(false)
  useEffect(() => {
    let frame = 0
    let touchTimer: number | undefined

    const onPointerMove = (event: PointerEvent) => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        const { innerWidth, innerHeight } = window
        const near =
          event.clientX < EDGE_PROXIMITY ||
          event.clientX > innerWidth - EDGE_PROXIMITY ||
          event.clientY < EDGE_PROXIMITY ||
          event.clientY > innerHeight - EDGE_PROXIMITY
        setLit((prev) => (prev === near ? prev : near))
      })
    }

    const onTouchStart = () => {
      setLit(true)
      window.clearTimeout(touchTimer)
      touchTimer = window.setTimeout(() => setLit(false), TOUCH_LIT_MS)
    }

    window.addEventListener('pointermove', onPointerMove, { passive: true })
    window.addEventListener('touchstart', onTouchStart, { passive: true })
    return () => {
      if (frame) cancelAnimationFrame(frame)
      window.clearTimeout(touchTimer)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('touchstart', onTouchStart)
    }
  }, [])
  return lit
}

/**
 * A thin invisible strip along one edge that summons its overlay after a
 * short dwell — hover intent, not hover accident. Suppressed mid-drag
 * (buttons pressed) so canvas pans and text selections never summon chrome.
 * Inset from the corners so the glyph clusters stay clickable.
 */
function EdgeHotZone({ side, onSummon }: { side: 'left' | 'right'; onSummon: () => void }) {
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  return (
    <div
      aria-hidden
      data-quiet-hotzone={side}
      className={`absolute inset-y-16 ${side === 'left' ? 'left-0' : 'right-0'} z-40 w-1.5`}
      onPointerEnter={(event) => {
        if (event.pointerType !== 'mouse' || event.buttons !== 0) return
        timer.current = window.setTimeout(onSummon, SUMMON_DWELL_MS)
      }}
      onPointerLeave={() => window.clearTimeout(timer.current)}
    />
  )
}

function GlyphButton({
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
      aria-current={active ? 'page' : undefined}
      onClick={onClick}
      className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border-none bg-transparent transition-colors ${
        active ? 'text-ink-1' : 'text-ink-2 hover:text-ink-1'
      }`}
    >
      <Icon size={16} strokeWidth={1.5} />
    </button>
  )
}

/**
 * Top-left corner cluster: the ModeSwitch collapsed to glyphs — identity,
 * the three modes, search, settings. Dimmed at L0, lit at L1 (and always on
 * keyboard focus); never removed, per the "summonable, not absent" rule.
 */
function CornerGlyphs({ lit, activeMode }: { lit: boolean; activeMode: CalmMode }) {
  const navigate = useNavigate()
  const { did } = useIdentity()
  const setCalmMode = useWorkbench((state) => state.setCalmMode)

  return (
    // Dim ≠ faded ink (0273 validation: glyphs hold ≥ Lc 60): at L0 the
    // decoration recedes (weaker bg, no shadow) while icons stay ink-2; at
    // L1 the cluster surfaces fully.
    <nav
      aria-label="Workspace"
      data-coach="quiet.corners"
      data-lit={lit || undefined}
      className={`absolute left-2 top-2 z-40 flex items-center gap-0.5 rounded-xl border border-hairline p-1 backdrop-blur transition-colors duration-normal ease-out ${
        lit ? 'bg-surface-1/95 shadow-sm' : 'bg-surface-1/60'
      }`}
    >
      {did && (
        <span
          title={did}
          className="mx-0.5 flex h-6 w-6 items-center justify-center rounded-full border border-hairline bg-surface-2 font-mono text-[9px] text-ink-2"
        >
          {did
            .replace(/^did:[a-z]+:/, '')
            .slice(0, 2)
            .toUpperCase()}
        </span>
      )}
      {CALM_MODES.map((mode) => (
        <GlyphButton
          key={mode.id}
          label={mode.label}
          icon={mode.icon}
          active={activeMode === mode.id}
          onClick={() => {
            setCalmMode(mode.id)
            void navigate({ to: mode.home })
          }}
        />
      ))}
      <span className="mx-0.5 h-4 w-px bg-hairline" />
      <GlyphButton
        label="Search (⌘K)"
        icon={Search}
        onClick={() => void getCommandRegistry().runCommand('search.open')}
      />
      <Link
        to="/settings"
        title="Settings"
        aria-label="Settings"
        className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-2 no-underline transition-colors hover:text-ink-1 hover:no-underline"
      >
        <Settings size={16} strokeWidth={1.5} />
      </Link>
    </nav>
  )
}

/**
 * Bottom-left corner: the status bar's sync cluster reduced to one dot,
 * expanding to the shared {@link SystemInfoDetails} popover on demand.
 */
function QuietSyncGlyph({ lit }: { lit: boolean }) {
  const vitals = useSyncVitals()
  const chip = CHIP[vitals.state]

  return (
    <div className="absolute bottom-2 left-2 z-40">
      <PopoverRoot>
        <PopoverTrigger
          title={`Sync: ${chip.label}`}
          aria-label={`Sync status: ${chip.label}`}
          className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded-xl border border-hairline backdrop-blur transition-colors duration-normal ease-out ${
            lit ? 'bg-surface-1/95 shadow-sm' : 'bg-surface-1/60'
          }`}
        >
          <span className={`inline-block h-2 w-2 rounded-full ${chip.tone}`} />
        </PopoverTrigger>
        <PopoverContent
          side="top"
          align="start"
          className="w-auto overflow-hidden border-hairline bg-surface-1 p-0"
        >
          <SystemInfoDetails vitals={vitals} />
        </PopoverContent>
      </PopoverRoot>
    </div>
  )
}

export function QuietChrome({
  activeMode,
  children
}: {
  activeMode: CalmMode
  children: ReactNode
}) {
  const left = useWorkbench((state) => state.left)
  const right = useWorkbench((state) => state.right)
  const bottom = useWorkbench((state) => state.bottom)
  const setPanelOpen = useWorkbench((state) => state.setPanelOpen)
  const setDiscloseLevel = useWorkbench((state) => state.setDiscloseLevel)
  const { pathname } = useLocation()
  const lit = useEdgeIntent()

  // Surface-first: overlays start closed and re-close on navigation (choosing
  // a doc in the navigator lands you on it at L0). Same pre-paint arm as
  // CalmMobile so a persisted `open` can't strand a Sheet backdrop.
  const [armed, setArmed] = useState(false)
  useLayoutEffect(() => {
    setPanelOpen('left', false)
    setPanelOpen('right', false)
    setPanelOpen('bottom', false)
    setArmed(true)
  }, [pathname, setPanelOpen])

  // Keep the store's disclosure level honest (L3 = pinned/workbench, not here).
  const overlayOpen = armed && (left.open || right.open || bottom.open)
  useEffect(() => {
    setDiscloseLevel(overlayOpen ? 2 : lit ? 1 : 0)
  }, [overlayOpen, lit, setDiscloseLevel])

  // One overlay at a time — the ladder has a single L2 rung.
  const openOnly = (side: PanelSide) => {
    setPanelOpen('left', side === 'left')
    setPanelOpen('right', side === 'right')
  }

  // When an overlay is dismissed while the pointer still rests on the edge,
  // the browser re-fires pointerenter on the hot-zone the instant the
  // backdrop unmounts — which would re-summon what the user just dismissed.
  // A short cooldown after a *user* dismissal (the Sheet's own onOpenChange,
  // i.e. Esc or scrim — never the mount/navigation arm-close) breaks the loop.
  const hotzoneCooldownRef = useRef(0)
  const dismiss = (side: PanelSide) => {
    hotzoneCooldownRef.current = Date.now() + 600
    setPanelOpen(side, false)
  }

  const summon = (side: PanelSide) => {
    if (Date.now() < hotzoneCooldownRef.current) return
    openOnly(side)
  }

  return (
    <div className="relative flex min-h-0 flex-1">
      {children}

      <EdgeHotZone side="left" onSummon={() => summon('left')} />
      <EdgeHotZone side="right" onSummon={() => summon('right')} />

      <CornerGlyphs lit={lit} activeMode={activeMode} />
      <QuietSyncGlyph lit={lit} />
      <SurfaceDockLauncher lit={lit} />

      {/* The List → left overlay. Esc/scrim dismissal via the Sheet dialog. */}
      <Sheet
        open={armed && left.open}
        onOpenChange={(open) => (open ? setPanelOpen('left', true) : dismiss('left'))}
      >
        <SheetContent
          side="left"
          hideClose
          className="w-[var(--list-width,17rem)] gap-0 border-hairline bg-surface-1 p-0"
          data-wb-sheet="left"
        >
          <ListPane mode={activeMode} />
        </SheetContent>
      </Sheet>

      {/* The contextual Canvas → right overlay (artifact or inspector). */}
      <Sheet
        open={armed && right.open}
        onOpenChange={(open) => (open ? setPanelOpen('right', true) : dismiss('right'))}
      >
        <SheetContent
          side="right"
          hideClose
          className="w-[var(--canvas-width,24rem)] gap-0 border-hairline bg-surface-1 p-0"
          data-wb-sheet="right"
        >
          <Canvas />
        </SheetContent>
      </Sheet>
    </div>
  )
}
