/**
 * DevToolsPanel Shell - Tab container, resize handle, status bar
 *
 * Styled with the workspace monochrome tokens (surface/ink/hairline),
 * so it follows the app's light/dark theme.
 */

import type { PanelId, PanelPosition } from '../provider/DevToolsContext'
import { Tooltip } from '@xnetjs/ui'
import { useState, type MouseEvent as ReactMouseEvent, type CSSProperties } from 'react'
import { DEFAULTS } from '../core/constants'
import { useDevTools } from '../provider/useDevTools'
import { AbusePanel } from './AbusePanel/AbusePanel'
import { AuthZPanel } from './AuthZPanel/AuthZPanel'
import { ChangeTimeline } from './ChangeTimeline/ChangeTimeline'
import { HistoryPanel } from './HistoryPanel/HistoryPanel'
import { MigrationWizard } from './MigrationWizard/MigrationWizard'
import { NodeExplorer } from './NodeExplorer/NodeExplorer'
import { DEVTOOLS_PANELS } from './panel-registry'
import { QueryDebugger } from './QueryDebugger/QueryDebugger'
import { SchemaHistoryPanel } from './SchemaHistoryPanel/SchemaHistoryPanel'
import { SchemaRegistry } from './SchemaRegistry/SchemaRegistry'
import { SecurityPanel } from './SecurityPanel/SecurityPanel'
import { Seed } from './Seed/Seed'
import { SQLitePanel } from './SQLitePanel/SQLitePanel'
import { useSQLiteStatus } from './SQLitePanel/useSQLitePanel'
import { SyncMonitor } from './SyncMonitor/SyncMonitor'
import { TelemetryPanel } from './TelemetryPanel/TelemetryPanel'
import { VersionPanel } from './VersionPanel/VersionPanel'
import { YjsInspector } from './YjsInspector/YjsInspector'

export function DevToolsPanel() {
  const { position, height, activePanel, setActivePanel, setHeight, toggle, eventBus, store } =
    useDevTools()
  const sqliteStatus = useSQLiteStatus(store)
  const sqliteDotClass = getSQLiteHealthDotClass(sqliteStatus.health)

  return (
    <div
      className={getContainerClass(position)}
      style={getContainerStyle(position, height)}
      role="complementary"
      aria-label="xNet DevTools"
    >
      {/* Resize Handle */}
      <ResizeHandle position={position} height={height} setHeight={setHeight} />

      {/* Tab Bar */}
      <div className="flex items-center border-b border-hairline shrink-0 overflow-x-auto">
        <span className="text-xs font-bold text-ink-2 ml-2 mr-3 select-none shrink-0">xNet</span>

        <div className="flex items-center shrink-0">
          {DEVTOOLS_PANELS.map((panel) => (
            <button
              key={panel.id}
              onClick={() => setActivePanel(panel.id)}
              className={`
                px-3 py-1.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap
                ${
                  activePanel === panel.id
                    ? 'border-accent-ink text-ink-1'
                    : 'border-transparent text-ink-2 hover:text-ink-1'
                }
              `}
            >
              {panel.id === 'sqlite' ? (
                <Tooltip content={sqliteStatus.tooltip} side="bottom" sideOffset={6}>
                  <span className="inline-flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${sqliteDotClass}`} />
                    <span>{panel.label}</span>
                  </span>
                </Tooltip>
              ) : (
                panel.label
              )}
            </button>
          ))}
        </div>

        {/* Right-side controls */}
        <div className="ml-auto flex items-center gap-2 shrink-0 px-2">
          <EventCounter count={eventBus.size} capacity={eventBus.capacity} />
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
        <span>
          Events: {eventBus.size}/{eventBus.capacity}
        </span>
        <span className="mx-2">|</span>
        <span>Store: {store ? 'connected' : 'disconnected'}</span>
        <span className="mx-2">|</span>
        <ClearDataButton store={store} />
        <span className="ml-auto">Ctrl+Shift+D to toggle</span>
      </div>
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
    case 'nodes':
      return <NodeExplorer />
    case 'changes':
      return <ChangeTimeline />
    case 'sync':
      return <SyncMonitor />
    case 'yjs':
      return <YjsInspector />
    case 'queries':
      return <QueryDebugger />
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
  }
}

function EventCounter({ count }: { count: number; capacity?: number }) {
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

function ClearDataButton({ store }: { store: ReturnType<typeof useDevTools>['store'] }) {
  const [confirming, setConfirming] = useState(false)

  const handleClick = async () => {
    if (!confirming) {
      setConfirming(true)
      // Auto-cancel after 3 seconds
      setTimeout(() => setConfirming(false), 3000)
      return
    }

    try {
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

      // Reload the page to reset state
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
      {/* Wider invisible hit area */}
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
  const base = 'flex flex-col bg-surface-1 text-ink-1 font-mono text-xs border-hairline z-[9999]'

  switch (position) {
    case 'bottom':
      return `${base} fixed bottom-0 left-0 right-0 border-t`
    case 'right':
      return `${base} fixed top-0 right-0 bottom-0 border-l`
    case 'floating':
      return `${base} fixed bottom-4 right-4 rounded-lg border shadow-2xl`
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
