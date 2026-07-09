/**
 * DevToolsPanel Shell - tab container, resize handle, status bar.
 *
 * The panel reads as a floating "overlay island" (0286/0287): it hovers on top
 * of the app content with rounded corners, a full hairline border and the deep
 * `shadow-pop` elevation, filled with `bg-island-pop` — the same recipe the
 * app's Modal and hover panels use. Four hero panels live in the primary row as
 * pill tabs, every other panel is tucked into a grouped "More" menu, and the
 * command palette (⌘/Ctrl+Shift+P) reaches any panel by name.
 */

import type { PanelId, PanelPosition } from '../provider/DevToolsContext'
import { Popover, Tooltip } from '@xnetjs/ui'
import { useEffect, useState, type MouseEvent as ReactMouseEvent, type CSSProperties } from 'react'
import { DEFAULTS } from '../core/constants'
import { useDevTools } from '../provider/useDevTools'
import { AbusePanel } from './AbusePanel/AbusePanel'
import { AuthZPanel } from './AuthZPanel/AuthZPanel'
import { ChangeTimeline } from './ChangeTimeline/ChangeTimeline'
import { DevToolsPalette } from './CommandPalette/DevToolsPalette'
import { DataExplorer } from './DataExplorer/DataExplorer'
import { HistoryPanel } from './HistoryPanel/HistoryPanel'
import { LogsPanel } from './LogsPanel/LogsPanel'
import { MigrationWizard } from './MigrationWizard/MigrationWizard'
import { PANEL_GROUP_LABELS, getPanel, heroPanels, secondaryPanelsByGroup } from './panel-registry'
import { PerformancePanel } from './PerformancePanel/PerformancePanel'
import { QueryDebugger } from './QueryDebugger/QueryDebugger'
import { Reset } from './Reset/Reset'
import { SchemaHistoryPanel } from './SchemaHistoryPanel/SchemaHistoryPanel'
import { SchemaRegistry } from './SchemaRegistry/SchemaRegistry'
import { SecurityPanel } from './SecurityPanel/SecurityPanel'
import { Seed } from './Seed/Seed'
import { SQLitePanel } from './SQLitePanel/SQLitePanel'
import { useSQLiteStatus } from './SQLitePanel/useSQLitePanel'
import { SyncMonitor } from './SyncMonitor/SyncMonitor'
import { TelemetryPanel } from './TelemetryPanel/TelemetryPanel'
import { TracesPanel } from './TracesPanel/TracesPanel'
import { VersionPanel } from './VersionPanel/VersionPanel'
import { YjsInspector } from './YjsInspector/YjsInspector'

export function DevToolsPanel() {
  const {
    position,
    height,
    activePanel,
    setActivePanel,
    setHeight,
    toggle,
    eventBus,
    store,
    syncDiagnostics
  } = useDevTools()
  const sqliteStatus = useSQLiteStatus(store)
  const sqliteDotClass = getSQLiteHealthDotClass(sqliteStatus.health)
  const [moreOpen, setMoreOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)

  const heroes = heroPanels()
  const activeIsHero = heroes.some((p) => p.id === activePanel)
  const activeDef = getPanel(activePanel)

  // ⌘/Ctrl+Shift+P opens the panel palette (only while devtools is mounted).
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'p') {
        e.preventDefault()
        setPaletteOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const selectPanel = (id: PanelId) => {
    setActivePanel(id)
    setMoreOpen(false)
  }

  return (
    <div
      className={getContainerClass(position)}
      style={getContainerStyle(position, height)}
      role="complementary"
      aria-label="xNet DevTools"
    >
      <ResizeHandle position={position} height={height} setHeight={setHeight} />

      {/* Tab Bar — floating pill tabs, matching the app's hover panels. */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-hairline shrink-0">
        <span className="text-xs font-bold text-ink-2 mr-1 select-none shrink-0">xNet</span>

        {/* Hero panels */}
        <div className="flex items-center gap-1 shrink-0">
          {heroes.map((panel) => {
            const Icon = panel.icon
            const active = activePanel === panel.id
            return (
              <button
                key={panel.id}
                onClick={() => setActivePanel(panel.id)}
                className={`inline-flex items-center gap-1.5 rounded-[9px] px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-accent text-ink-1'
                    : 'text-ink-3 hover:bg-background-muted hover:text-ink-1'
                }`}
              >
                <Icon size={13} className={active ? 'text-ink-1' : 'text-ink-3'} />
                {panel.label}
              </button>
            )
          })}

          {/* More menu */}
          <Popover
            open={moreOpen}
            onOpenChange={setMoreOpen}
            align="start"
            trigger={
              <button
                className={`inline-flex items-center gap-1 rounded-[9px] px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                  !activeIsHero
                    ? 'bg-accent text-ink-1'
                    : 'text-ink-3 hover:bg-background-muted hover:text-ink-1'
                }`}
              >
                {!activeIsHero && activeDef ? activeDef.label : 'More'}
                <span className="text-ink-3 text-[9px]">▾</span>
              </button>
            }
          >
            <div className="w-56 max-h-[50vh] overflow-y-auto py-1">
              {secondaryPanelsByGroup().map(({ group, panels }) => (
                <div key={group} className="py-1">
                  <div className="px-3 py-0.5 text-[9px] font-bold uppercase tracking-wide text-ink-3">
                    {PANEL_GROUP_LABELS[group]}
                  </div>
                  {panels.map((panel) => {
                    const Icon = panel.icon
                    const active = activePanel === panel.id
                    return (
                      <button
                        key={panel.id}
                        onClick={() => selectPanel(panel.id)}
                        className={`flex items-center gap-2 w-full px-3 py-1 text-xs text-left ${
                          active ? 'bg-surface-2 text-ink-1' : 'text-ink-2 hover:bg-surface-2'
                        }`}
                      >
                        <Icon size={13} className="text-ink-3 shrink-0" />
                        <span className="flex-1">{panel.label}</span>
                        {panel.id === 'sqlite' && (
                          <span className={`w-1.5 h-1.5 rounded-full ${sqliteDotClass}`} />
                        )}
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>
          </Popover>
        </div>

        {/* Right-side controls */}
        <div className="ml-auto flex items-center gap-2 shrink-0 px-2">
          <Tooltip content="Jump to panel (⌘⇧P)" side="bottom" sideOffset={6}>
            <button
              onClick={() => setPaletteOpen(true)}
              className="text-ink-3 hover:text-ink-1 text-xs px-1"
              aria-label="Jump to panel"
            >
              ⌘⇧P
            </button>
          </Tooltip>
          <EventCounter count={eventBus.size} />
          <PauseButton
            isPaused={eventBus.isPaused}
            onPause={() => eventBus.pause()}
            onResume={() => eventBus.resume()}
          />
          <ClearButton onClear={() => eventBus.clear()} />
          <button
            onClick={toggle}
            className="text-ink-2 hover:text-ink-1 p-1 text-xs"
            title="Close (Ctrl+Shift+D)"
          >
            x
          </button>
        </div>
      </div>

      {/* Active Panel Content */}
      <div className="flex-1 overflow-hidden">
        <ActivePanelContent panel={activePanel} />
      </div>

      {/* Status Bar */}
      <div className="flex items-center px-3 py-1 border-t border-hairline bg-surface-2 text-[10px] text-ink-3 shrink-0">
        <span>Events: {eventBus.size}</span>
        <span className="mx-2">|</span>
        <span className="inline-flex items-center gap-1">
          <span className={`w-1.5 h-1.5 rounded-full ${sqliteDotClass}`} />
          Store: {store ? 'connected' : 'disconnected'}
        </span>
        <span className="mx-2">|</span>
        <span>Sync: {syncDiagnostics.status}</span>
        <span className="mx-2">|</span>
        <ClearDataButton />
        <span className="ml-auto">⌘⇧P panels · Ctrl+Shift+D toggle</span>
      </div>

      <DevToolsPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onSelect={selectPanel}
      />
    </div>
  )
}

function getSQLiteHealthDotClass(health: 'working' | 'degraded' | 'inactive'): string {
  switch (health) {
    case 'working':
      return 'bg-success'
    case 'degraded':
      return 'bg-warning'
    case 'inactive':
      return 'bg-destructive'
  }
}

// ─── Sub-components ────────────────────────────────────────

function ActivePanelContent({ panel }: { panel: PanelId }) {
  switch (panel) {
    case 'data':
      return <DataExplorer />
    case 'changes':
      return <ChangeTimeline />
    case 'logs':
      return <LogsPanel />
    case 'performance':
      return <PerformancePanel />
    case 'sync':
      return <SyncMonitor />
    case 'yjs':
      return <YjsInspector />
    case 'queries':
      return <QueryDebugger />
    case 'traces':
      return <TracesPanel />
    case 'authz':
      return <AuthZPanel />
    case 'abuse':
      return <AbusePanel />
    case 'telemetry':
      return <TelemetryPanel />
    case 'schemas':
      return <SchemaRegistry />
    case 'schema-history':
      return <SchemaHistoryPanel />
    case 'security':
      return <SecurityPanel />
    case 'sqlite':
      return <SQLitePanel />
    case 'version':
      return <VersionPanel />
    case 'migration':
      return <MigrationWizard />
    case 'seed':
      return <Seed />
    case 'history':
      return <HistoryPanel />
    case 'reset':
      return <Reset />
  }
}

function EventCounter({ count }: { count: number }) {
  return <span className="text-[10px] text-ink-3">{count}</span>
}

function PauseButton({
  isPaused,
  onPause,
  onResume
}: {
  isPaused: boolean
  onPause: () => void
  onResume: () => void
}) {
  return (
    <button
      onClick={isPaused ? onResume : onPause}
      className="text-ink-2 hover:text-ink-1 text-xs p-0.5"
      title={isPaused ? 'Resume' : 'Pause'}
    >
      {isPaused ? '>' : '||'}
    </button>
  )
}

function ClearButton({ onClear }: { onClear: () => void }) {
  return (
    <button
      onClick={onClear}
      className="text-ink-2 hover:text-ink-1 text-xs p-0.5"
      title="Clear events"
    >
      clr
    </button>
  )
}

function ClearDataButton() {
  const { onResetLocalData, store, consoleLogs } = useDevTools()
  const [confirming, setConfirming] = useState(false)

  const handleClick = async () => {
    if (!confirming) {
      setConfirming(true)
      setTimeout(() => setConfirming(false), 3000)
      return
    }

    try {
      // Prefer the host's OPFS-aware reset (wipes the SAH-pool SQLite that holds
      // the real data, then reloads). The inline fallback below only touches
      // IndexedDB + adapter.clear() which the SQLite adapter doesn't implement.
      if (onResetLocalData) {
        await onResetLocalData()
        return
      }

      const storageAdapter = store?.getStorageAdapter() as {
        clear?: () => Promise<void>
      } | null

      if (storageAdapter && typeof storageAdapter.clear === 'function') {
        await storageAdapter.clear()
      }

      if (typeof indexedDB !== 'undefined' && typeof indexedDB.databases === 'function') {
        const databases = await indexedDB.databases()
        for (const db of databases) {
          if (db.name?.startsWith('xnet-')) {
            indexedDB.deleteDatabase(db.name)
          }
        }
      }

      // Preserved logs live in sessionStorage, which survives the reload;
      // turning preserve off also stops the dirty-flush re-writing the key.
      consoleLogs.setPreserve(false)

      window.location.reload()
    } catch (err) {
      console.error('[DevTools] Failed to clear data:', err)
      setConfirming(false)
    }
  }

  return (
    <button
      onClick={handleClick}
      className={`text-xs p-0.5 ${confirming ? 'text-destructive hover:text-destructive' : 'text-ink-2 hover:text-ink-1'}`}
      title={confirming ? 'Click again to confirm' : 'Clear all local data'}
    >
      {confirming ? 'Confirm Clear?' : 'Clear Data'}
    </button>
  )
}

function ResizeHandle({
  position,
  height,
  setHeight
}: {
  position: PanelPosition
  height: number
  setHeight: (h: number) => void
}) {
  const handleMouseDown = (e: ReactMouseEvent) => {
    e.preventDefault()
    const startY = e.clientY
    const startX = e.clientX
    const startHeight = height

    const onMove = (me: globalThis.MouseEvent) => {
      const delta =
        position === 'bottom'
          ? startY - me.clientY // drag up = larger
          : startX - me.clientX // drag left = larger
      const newHeight = Math.max(DEFAULTS.PANEL_MIN_HEIGHT, startHeight + delta)
      setHeight(newHeight)
    }

    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  const isVertical = position === 'right'

  return (
    <div
      onMouseDown={handleMouseDown}
      className="shrink-0 group bg-hairline"
      style={{
        cursor: isVertical ? 'ew-resize' : 'ns-resize',
        width: isVertical ? 4 : '100%',
        height: isVertical ? '100%' : 4,
        position: 'relative'
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: isVertical ? 0 : -3,
          left: isVertical ? -3 : 0,
          width: isVertical ? 10 : '100%',
          height: isVertical ? '100%' : 10
        }}
      />
    </div>
  )
}

// ─── Layout Helpers ────────────────────────────────────────

function getContainerClass(position: PanelPosition): string {
  // Every dock now renders as a hovering overlay island. The `wb-root` class
  // pulls in the workbench's floating-island token scope (--island-pop /
  // --pop-shadow + warm surfaces) so the panel matches the app's other hover
  // panels instead of falling back to the neutral popover ramp; the island
  // classes (rounded-2xl + full border + shadow-pop) mirror the Modal recipe.
  const base =
    'wb-root flex flex-col overflow-hidden bg-island-pop text-ink-1 font-mono text-xs border border-hairline shadow-pop rounded-2xl z-[9999]'

  switch (position) {
    // Inset from the edges so the island clearly floats above the content
    // rather than sitting flush like a docked sheet.
    case 'bottom':
      return `${base} fixed bottom-2 left-2 right-2`
    case 'right':
      return `${base} fixed top-2 right-2 bottom-2`
    case 'floating':
      return `${base} fixed bottom-4 right-4`
  }
}

function getContainerStyle(position: PanelPosition, height: number): CSSProperties {
  switch (position) {
    case 'bottom':
      return { height }
    case 'right':
      return { width: height }
    case 'floating':
      return { width: 600, height }
  }
}
