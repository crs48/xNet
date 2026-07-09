/**
 * XNetDevToolsProvider - Full development implementation
 *
 * Wraps the app, sets up instrumentation, manages panel visibility,
 * and provides context to all devtools panels.
 */

import type { QueryMaterializedInfo, QueryPlanInfo } from '../core/types'
import type * as Y from 'yjs'
import { DocumentHistoryEngine, MemoryYjsSnapshotStorage } from '@xnetjs/history'
import {
  useDataBridge,
  useNodeStore,
  useXNet,
  InstrumentationContext,
  type InstrumentationContextValue
} from '@xnetjs/react/internal'
import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
  type ReactNode,
  type MouseEvent as ReactMouseEvent
} from 'react'
import { DEFAULTS } from '../core/constants'
import { DevToolsEventBus } from '../core/event-bus'
import { ConsoleLogStore } from '../core/log-store'
import { instrumentConsole } from '../instrumentation/console'
import { QueryTracker } from '../instrumentation/query'
import { instrumentChangeFeed, instrumentStore } from '../instrumentation/store'
import { instrumentTelemetry } from '../instrumentation/telemetry'
import { instrumentTracing, type TraceCollectorLike } from '../instrumentation/tracing'
import { instrumentYDoc } from '../instrumentation/yjs'
import { migratePanelId } from '../panels/panel-registry'
import { DevToolsPanel } from '../panels/Shell'
import {
  DevToolsContext,
  type PanelId,
  type PanelPosition,
  type RuntimeDiagnostics,
  type StorageDurabilityInfo,
  type SyncDiagnostics,
  type YDocRegistry
} from './DevToolsContext'

type NodeChangeBridge = ReturnType<typeof useDataBridge>
type DevToolsNodeStore = ReturnType<typeof useNodeStore>['store']

function selectBridgeChangeFeed(bridge: NodeChangeBridge) {
  if (!bridge || !bridge.subscribeToChanges || bridge.nodeStore) return null
  return bridge.subscribeToChanges.bind(bridge)
}

/**
 * With a worker-resident data layer (0164) the main-thread store never
 * sees hook-driven writes, so prefer the bridge's change feed whenever
 * the bridge has no main-thread store of its own. Main-thread bridges
 * keep direct store instrumentation (which adds conflict polling).
 */
function instrumentNodeChanges(
  store: DevToolsNodeStore,
  bridge: NodeChangeBridge,
  bus: DevToolsEventBus
): (() => void) | null {
  const bridgeFeed = selectBridgeChangeFeed(bridge)
  if (bridgeFeed) return instrumentChangeFeed(bridgeFeed, bus)
  if (store) return instrumentStore(store, bus)
  return null
}

/**
 * DocumentHistoryEngine backed by the store's storage adapter when it
 * supports Yjs snapshots, else in-memory.
 */
function createDocumentHistoryEngine(store: DevToolsNodeStore): DocumentHistoryEngine {
  const storage = (store as any)?.storage
  if (storage && typeof storage.saveYjsSnapshot === 'function') {
    return new DocumentHistoryEngine(storage, { minInterval: 2000 })
  }
  return new DocumentHistoryEngine(new MemoryYjsSnapshotStorage(), { minInterval: 2000 })
}

function createSyncDiagnostics(
  syncManager: ReturnType<typeof useXNet>['syncManager']
): SyncDiagnostics {
  return {
    status: syncManager?.status ?? 'disconnected',
    lifecyclePhase: syncManager?.lifecycle.phase ?? 'idle',
    queueSize: syncManager?.queueSize ?? 0,
    trackedCount: syncManager?.trackedCount ?? 0,
    pendingBlobCount: syncManager?.pendingBlobCount ?? 0,
    lastVerificationFailure: syncManager?.lastVerificationFailure ?? null
  }
}

function createYDocRegistry(
  bus: DevToolsEventBus
): YDocRegistry & { cleanups: Map<string, () => void> } {
  const docs = new Map<string, Y.Doc>()
  const cleanups = new Map<string, () => void>()

  return {
    getDocs: () => docs,
    register: (docId: string, doc: Y.Doc) => {
      // Unregister previous if exists
      if (cleanups.has(docId)) {
        cleanups.get(docId)!()
      }
      docs.set(docId, doc)
      // Auto-instrument the doc
      const cleanup = instrumentYDoc(doc, docId, bus, {
        getDocs: () => docs,
        register: () => {},
        unregister: () => {}
      })
      cleanups.set(docId, cleanup)
    },
    unregister: (docId: string) => {
      if (cleanups.has(docId)) {
        cleanups.get(docId)!()
        cleanups.delete(docId)
      }
      docs.delete(docId)
    },
    cleanups
  }
}

/**
 * Floating Action Button for toggling DevTools.
 * Draggable to reposition anywhere on screen.
 */
function DevToolsFab({
  isOpen,
  onToggle,
  initialOffset = { x: 16, y: 16 }
}: {
  isOpen: boolean
  onToggle: () => void
  initialOffset?: { x: number; y: number }
}) {
  const [pos, setPos] = useState(initialOffset) // bottom-right offset
  const dragging = useRef(false)
  const dragStart = useRef({ x: 0, y: 0, posX: 0, posY: 0 })
  const didDrag = useRef(false)

  const handleMouseDown = useCallback(
    (e: ReactMouseEvent) => {
      e.preventDefault()
      dragging.current = true
      didDrag.current = false
      dragStart.current = { x: e.clientX, y: e.clientY, posX: pos.x, posY: pos.y }

      const handleMouseMove = (moveEvent: globalThis.MouseEvent) => {
        if (!dragging.current) return
        const dx = moveEvent.clientX - dragStart.current.x
        const dy = moveEvent.clientY - dragStart.current.y
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
          didDrag.current = true
        }
        // Position is relative to bottom-right, so invert deltas
        setPos({
          x: Math.max(0, dragStart.current.posX - dx),
          y: Math.max(0, dragStart.current.posY + dy)
        })
      }

      const handleMouseUp = () => {
        dragging.current = false
        window.removeEventListener('mousemove', handleMouseMove)
        window.removeEventListener('mouseup', handleMouseUp)
      }

      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
    },
    [pos]
  )

  const handleClick = useCallback(() => {
    // Only toggle if we didn't drag
    if (!didDrag.current) {
      onToggle()
    }
  }, [onToggle])

  const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform)
  const shortcut = isMac ? '⌘⇧D' : 'Ctrl+Shift+D'

  return (
    <div
      onMouseDown={handleMouseDown}
      onClick={handleClick}
      title={`Toggle DevTools (${shortcut})`}
      className={`fixed z-[99999] flex h-8 w-8 select-none items-center justify-center rounded-full border shadow-md transition-colors ${
        isOpen
          ? 'border-transparent bg-primary text-primary-foreground'
          : 'border-hairline bg-surface-0 text-ink-2 hover:bg-surface-2 hover:text-ink-1'
      }`}
      style={{
        bottom: pos.y,
        right: pos.x,
        cursor: dragging.current ? 'grabbing' : 'grab'
      }}
    >
      <svg
        width={14}
        height={14}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* Wrench icon */}
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
      </svg>
    </div>
  )
}

export interface XNetDevToolsProviderProps {
  children: ReactNode
  /** Open the panel on mount */
  defaultOpen?: boolean
  /** Initial active panel */
  defaultPanel?: PanelId
  /** Panel dock position */
  position?: PanelPosition
  /** Panel height in pixels */
  height?: number
  /** Max events in ring buffer */
  maxEvents?: number
  /** TelemetryCollector instance for telemetry panel instrumentation */
  telemetryCollector?: any
  /** ConsentManager instance for telemetry panel instrumentation */
  consentManager?: any
  /** TraceCollector instance for the Traces panel (exploration 0190) */
  traceCollector?: TraceCollectorLike
  /** Optional storage durability status supplied by the host app */
  storageDurability?: StorageDurabilityInfo | null
  /** Floating action button offset from the bottom-right corner */
  fabInitialOffset?: { x: number; y: number }
  /**
   * Hide the floating draggable toggle FAB. The host renders its own docked
   * launcher instead (e.g. the workbench dev-tools island, 0287); ⌘⇧D and the
   * external toggle event still work.
   */
  hideFab?: boolean
  /**
   * "Wipe local database" action wired by the host (OPFS SQLite + IndexedDB +
   * localStorage, then reload). The Reset panel and the status-bar button use
   * this when provided; otherwise they fall back to a best-effort inline clear.
   */
  onResetLocalData?: () => void | Promise<void>
  /** "Wipe my data on the hub" action; resolves with the count removed. */
  onResetHub?: () => Promise<number>
}

declare global {
  interface Window {
    __xnetDevToolsDiagnostics?: {
      getActiveNodeId: () => string | null
      getActiveQueries: () => Array<{
        id: string
        type: string
        schemaId: string
        mode: string
        descriptorKey?: string
        nodeId?: string
        source?: string
        plan?: QueryPlanInfo | null
        materialized?: QueryMaterializedInfo | null
        updateCount: number
        resultCount: number
      }>
    } | null
  }
}

const STORAGE_KEY_OPEN = 'xnet:devtools:open'
const STORAGE_KEY_PANEL = 'xnet:devtools:panel'
const STORAGE_KEY_POSITION = 'xnet:devtools:position'
const STORAGE_KEY_HEIGHT = 'xnet:devtools:height'

function loadStoredOpen(defaultOpen: boolean): boolean {
  if (typeof localStorage === 'undefined') return defaultOpen
  const stored = localStorage.getItem(STORAGE_KEY_OPEN)
  if (stored === 'true') return true
  if (stored === 'false') return false
  return defaultOpen
}

function loadStoredPanel(defaultPanel: PanelId): PanelId {
  if (typeof localStorage === 'undefined') return defaultPanel
  const stored = localStorage.getItem(STORAGE_KEY_PANEL)
  // Validate against the live registry (no stale hardcoded allowlist) and
  // migrate renamed ids (e.g. the old `nodes` panel -> `data`).
  return (stored && migratePanelId(stored)) || defaultPanel
}

function loadStoredPosition(defaultPosition: PanelPosition): PanelPosition {
  if (typeof localStorage === 'undefined') return defaultPosition
  const stored = localStorage.getItem(STORAGE_KEY_POSITION)
  if (stored === 'bottom' || stored === 'right' || stored === 'floating') {
    return stored
  }
  return defaultPosition
}

function loadStoredHeight(defaultHeight: number): number {
  if (typeof localStorage === 'undefined') return defaultHeight
  const stored = Number(localStorage.getItem(STORAGE_KEY_HEIGHT))
  return Number.isFinite(stored) && stored >= DEFAULTS.PANEL_MIN_HEIGHT ? stored : defaultHeight
}

export function XNetDevToolsProvider({
  children,
  defaultOpen = false,
  defaultPanel = 'data',
  position: initialPosition = 'bottom',
  height: initialHeight = DEFAULTS.PANEL_HEIGHT,
  maxEvents = DEFAULTS.MAX_EVENTS,
  telemetryCollector,
  consentManager,
  traceCollector,
  storageDurability = null,
  fabInitialOffset = { x: 16, y: 16 },
  hideFab = false,
  onResetLocalData,
  onResetHub
}: XNetDevToolsProviderProps) {
  const { runtimeStatus, syncManager } = useXNet()
  const [isOpen, setIsOpenState] = useState(() => loadStoredOpen(defaultOpen))
  const [activePanel, setActivePanelState] = useState<PanelId>(() => loadStoredPanel(defaultPanel))
  const [position, setPositionState] = useState<PanelPosition>(() =>
    loadStoredPosition(initialPosition)
  )
  const [height, setHeightState] = useState(() => loadStoredHeight(initialHeight))
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null)
  const [syncDiagnostics, setSyncDiagnostics] = useState<SyncDiagnostics>(() =>
    createSyncDiagnostics(syncManager)
  )

  // Persist open state
  const setIsOpen = (open: boolean | ((prev: boolean) => boolean)) => {
    setIsOpenState((prev) => {
      const newValue = typeof open === 'function' ? open(prev) : open
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY_OPEN, String(newValue))
      }
      return newValue
    })
  }

  // Persist panel selection
  const setActivePanel = (panel: PanelId) => {
    setActivePanelState(panel)
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY_PANEL, panel)
    }
  }

  // Persist position selection
  const setPosition = (pos: PanelPosition) => {
    setPositionState(pos)
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY_POSITION, pos)
    }
  }

  // Persist panel height (so a resized dock survives reload)
  const setHeight = (h: number) => {
    setHeightState(h)
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY_HEIGHT, String(Math.round(h)))
    }
  }

  const busRef = useRef<DevToolsEventBus>(new DevToolsEventBus({ maxEvents }))
  const consoleLogsRef = useRef<ConsoleLogStore>(new ConsoleLogStore())
  const yDocRegistryRef = useRef(createYDocRegistry(busRef.current))
  const queryTrackerRef = useRef(new QueryTracker(busRef.current))
  const documentHistoryRef = useRef<DocumentHistoryEngine | null>(null)
  const cleanupsRef = useRef<Array<() => void>>([])

  // Get store from NodeStoreProvider context
  const { store } = useNodeStore()
  const dataBridge = useDataBridge()

  // Set up store instrumentation when store becomes available.
  useEffect(() => {
    const cleanup = instrumentNodeChanges(store, dataBridge, busRef.current)
    if (!cleanup) return

    cleanupsRef.current.push(cleanup)
    documentHistoryRef.current = createDocumentHistoryEngine(store)

    return () => {
      cleanup()
      cleanupsRef.current = cleanupsRef.current.filter((fn) => fn !== cleanup)
    }
  }, [store, dataBridge])

  useEffect(() => {
    setSyncDiagnostics(createSyncDiagnostics(syncManager))

    if (!syncManager) {
      return
    }

    const refresh = () => {
      setSyncDiagnostics(createSyncDiagnostics(syncManager))
    }

    const cleanups = [
      syncManager.on('status', refresh),
      syncManager.on('lifecycle', refresh),
      syncManager.on('verification-failure', refresh)
    ]

    return () => {
      cleanups.forEach((cleanup) => cleanup())
    }
  }, [syncManager])

  // Console tap + session persistence — provider-lifetime so capture continues
  // while the Logs tab (or the whole dock) is closed (exploration 0275).
  useEffect(() => {
    const restoreConsole = instrumentConsole(consoleLogsRef.current)
    const detachPersistence = consoleLogsRef.current.attachSessionPersistence()
    return () => {
      restoreConsole()
      detachPersistence()
    }
  }, [])

  // Set up telemetry instrumentation when collector and consent are available
  useEffect(() => {
    if (!telemetryCollector || !consentManager) return

    const cleanup = instrumentTelemetry(telemetryCollector, consentManager, busRef.current, {
      logStore: consoleLogsRef.current
    })
    cleanupsRef.current.push(cleanup)

    return () => {
      cleanup()
      cleanupsRef.current = cleanupsRef.current.filter((fn) => fn !== cleanup)
    }
  }, [telemetryCollector, consentManager])

  // Set up tracing instrumentation when a TraceCollector is available (0190)
  useEffect(() => {
    if (!traceCollector) return

    const cleanup = instrumentTracing(traceCollector, busRef.current)
    cleanupsRef.current.push(cleanup)

    return () => {
      cleanup()
      cleanupsRef.current = cleanupsRef.current.filter((fn) => fn !== cleanup)
    }
  }, [traceCollector])

  // Cleanup all instrumentation on unmount
  useEffect(() => {
    return () => {
      cleanupsRef.current.forEach((fn) => fn())
      cleanupsRef.current = []
    }
  }, [])

  useEffect(() => {
    const diagnostics = {
      getActiveNodeId: () => activeNodeId,
      getActiveQueries: () =>
        queryTrackerRef.current.getActive().map((query) => ({
          id: query.id,
          type: query.type,
          schemaId: query.schemaId,
          mode: query.mode,
          descriptorKey: query.descriptorKey,
          nodeId: query.nodeId,
          source: query.source,
          plan: query.plan,
          materialized: query.materialized,
          updateCount: query.updateCount,
          resultCount: query.resultCount
        }))
    }

    window.__xnetDevToolsDiagnostics = diagnostics
    return () => {
      if (window.__xnetDevToolsDiagnostics === diagnostics) {
        window.__xnetDevToolsDiagnostics = null
      }
    }
  }, [activeNodeId])

  // Keyboard shortcut: Ctrl/Cmd + Shift + D
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const { key, shift } = DEFAULTS.KEYBOARD_SHORTCUT
      if ((e.ctrlKey || e.metaKey) && e.shiftKey === shift && e.key.toLowerCase() === key) {
        e.preventDefault()
        setIsOpen((prev) => !prev)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Custom event toggle (from Electron IPC or external triggers)
  useEffect(() => {
    const handler = () => setIsOpen((prev) => !prev)
    window.addEventListener('xnet-devtools-toggle', handler)
    return () => window.removeEventListener('xnet-devtools-toggle', handler)
  }, [])

  // Mobile: 4-finger tap
  useEffect(() => {
    const handler = (e: TouchEvent) => {
      if (e.touches.length === DEFAULTS.MOBILE_FINGER_COUNT) {
        e.preventDefault()
        setIsOpen((prev) => !prev)
      }
    }
    window.addEventListener('touchstart', handler, { passive: false })
    return () => window.removeEventListener('touchstart', handler)
  }, [])

  const toggle = useCallback(() => setIsOpen((prev) => !prev), [])

  const contextValue = useMemo(
    () => ({
      available: true,
      isOpen,
      activePanel,
      position,
      height,
      toggle,
      setActivePanel,
      setPosition,
      setHeight,
      eventBus: busRef.current,
      consoleLogs: consoleLogsRef.current,
      store,
      yDocRegistry: yDocRegistryRef.current,
      activeNodeId,
      setActiveNodeId,
      documentHistory: documentHistoryRef.current,
      runtimeStatus: runtimeStatus as RuntimeDiagnostics,
      syncDiagnostics,
      storageDurability,
      // Wrap the host wipe so it also drops the preserved-log snapshot —
      // sessionStorage survives the reload the wipe triggers, so a
      // SQLite/IndexedDB/localStorage-only clear would miss it. setPreserve
      // (not just clearing the key) so the periodic dirty-flush can't
      // re-write the snapshot while the async OPFS wipe is still running.
      onResetLocalData: onResetLocalData
        ? async () => {
            consoleLogsRef.current.setPreserve(false)
            await onResetLocalData()
          }
        : null,
      // Default the hub reset to the live SyncManager so it works without the
      // host wiring anything; a prop override still wins.
      onResetHub: onResetHub ?? (syncManager ? () => syncManager.clearHubData() : null)
    }),
    [
      isOpen,
      activePanel,
      position,
      height,
      toggle,
      setActivePanel,
      setPosition,
      store,
      activeNodeId,
      runtimeStatus,
      syncDiagnostics,
      storageDurability,
      onResetLocalData,
      onResetHub,
      syncManager
    ]
  )

  // Instrumentation context for hooks (useNode, useQuery, useMutate)
  const instrumentationValue: InstrumentationContextValue = useMemo(
    () => ({
      yDocRegistry: yDocRegistryRef.current,
      queryTracker: queryTrackerRef.current
    }),
    []
  )

  return (
    <DevToolsContext.Provider value={contextValue}>
      <InstrumentationContext.Provider value={instrumentationValue}>
        <div className="relative flex flex-col h-full">
          <div
            className="flex-1 overflow-hidden"
            style={
              isOpen && position === 'bottom'
                ? { paddingBottom: `${height}px` }
                : isOpen && position === 'right'
                  ? { paddingRight: `${height}px` }
                  : undefined
            }
          >
            {children}
          </div>
          {isOpen && <DevToolsPanel />}
          {!hideFab && (
            <DevToolsFab isOpen={isOpen} onToggle={toggle} initialOffset={fabInitialOffset} />
          )}
        </div>
      </InstrumentationContext.Provider>
    </DevToolsContext.Provider>
  )
}
