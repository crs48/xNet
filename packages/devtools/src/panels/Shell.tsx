/**
 * DevToolsPanel Shell - Tab container, resize handle, status bar
 *
 * Uses a dark zinc theme to distinguish from app content.
 */

import type { PanelId, PanelPosition } from '../provider/DevToolsContext'
import { useState, type MouseEvent as ReactMouseEvent, type CSSProperties } from 'react'
import { DEFAULTS } from '../core/constants'
import { useDevTools } from '../provider/useDevTools'
import { ChangeTimeline } from './ChangeTimeline/ChangeTimeline'
import { HistoryPanel } from './HistoryPanel/HistoryPanel'
import { MigrationWizard } from './MigrationWizard/MigrationWizard'
import { NodeExplorer } from './NodeExplorer/NodeExplorer'
import { QueryDebugger } from './QueryDebugger/QueryDebugger'
import { SchemaRegistry } from './SchemaRegistry/SchemaRegistry'
import { Seed } from './Seed/Seed'
import { SyncMonitor } from './SyncMonitor/SyncMonitor'
import { TelemetryPanel } from './TelemetryPanel/TelemetryPanel'
import { VersionPanel } from './VersionPanel/VersionPanel'
import { YjsInspector } from './YjsInspector/YjsInspector'

const PANELS: Array<{ id: PanelId; label: string }> = [
  { id: 'nodes', label: 'Nodes' },
  { id: 'changes', label: 'Changes' },
  { id: 'sync', label: 'Sync' },
  { id: 'yjs', label: 'Yjs' },
  { id: 'queries', label: 'Queries' },
  { id: 'telemetry', label: 'Telemetry' },
  { id: 'schemas', label: 'Schemas' },
  { id: 'version', label: 'Version' },
  { id: 'migration', label: 'Migrate' },
  { id: 'seed', label: 'Seed' },
  { id: 'history', label: 'History' }
]

export function DevToolsPanel() {
  const { position, height, activePanel, setActivePanel, setHeight, toggle, eventBus, store } =
    useDevTools()

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
      <div className="flex items-center border-b border-zinc-700 px-2 shrink-0">
        <span className="text-xs font-bold text-zinc-400 mr-3 select-none">xNet</span>

        {PANELS.map((panel) => (
          <button
            key={panel.id}
            onClick={() => setActivePanel(panel.id)}
            className={`
              px-3 py-1.5 text-xs font-medium border-b-2 transition-colors
              ${
                activePanel === panel.id
                  ? 'border-blue-400 text-blue-400'
                  : 'border-transparent text-zinc-400 hover:text-zinc-200'
              }
            `}
          >
            {panel.label}
          </button>
        ))}

        {/* Right-side controls */}
        <div className="ml-auto flex items-center gap-2">
          <EventCounter count={eventBus.size} capacity={eventBus.capacity} />
          <PauseButton
            isPaused={eventBus.isPaused}
            onPause={() => eventBus.pause()}
            onResume={() => eventBus.resume()}
          />
          <ClearButton onClear={() => eventBus.clear()} />
          <button
            onClick={toggle}
            className="text-zinc-400 hover:text-white p-1 text-xs"
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
      <div className="flex items-center px-3 py-1 border-t border-zinc-800 bg-zinc-950 text-[10px] text-zinc-500 shrink-0">
        <span>
          Events: {eventBus.size}/{eventBus.capacity}
        </span>
        <span className="mx-2">|</span>
        <span>Store: {store ? 'connected' : 'disconnected'}</span>
        <span className="mx-2">|</span>
        <ClearDataButton />
        <span className="ml-auto">Ctrl+Shift+D to toggle</span>
      </div>
    </div>
  )
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
    case 'telemetry':
      return <TelemetryPanel />
    case 'schemas':
      return <SchemaRegistry />
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
  return <span className="text-[10px] text-zinc-500">{count}</span>
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
      className="text-zinc-400 hover:text-white text-xs p-0.5"
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
      className="text-zinc-400 hover:text-white text-xs p-0.5"
      title="Clear events"
    >
      clr
    </button>
  )
}

function ClearDataButton() {
  const [confirming, setConfirming] = useState(false)

  const handleClick = async () => {
    if (!confirming) {
      setConfirming(true)
      // Auto-cancel after 3 seconds
      setTimeout(() => setConfirming(false), 3000)
      return
    }

    // Clear IndexedDB
    try {
      const databases = await indexedDB.databases()
      for (const db of databases) {
        if (db.name?.startsWith('xnet-')) {
          indexedDB.deleteDatabase(db.name)
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
      className={`text-xs p-0.5 ${confirming ? 'text-red-400 hover:text-red-300' : 'text-zinc-400 hover:text-white'}`}
      title={confirming ? 'Click again to confirm' : 'Clear all IndexedDB data'}
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
      className="shrink-0 group"
      style={{
        cursor: isVertical ? 'ew-resize' : 'ns-resize',
        width: isVertical ? 4 : '100%',
        height: isVertical ? '100%' : 4,
        backgroundColor: '#27272a',
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
  const base = 'dark flex flex-col text-zinc-200 font-mono text-xs border-zinc-700 z-[9999]'

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
  // Use inline background color as fallback (Tailwind bg-zinc-950 may not be bundled)
  const baseStyle: CSSProperties = { backgroundColor: '#09090b' }

  switch (position) {
    case 'bottom':
      return { ...baseStyle, height }
    case 'right':
      return { ...baseStyle, width: height }
    case 'floating':
      return { ...baseStyle, width: 600, height }
  }
}
