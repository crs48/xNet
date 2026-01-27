/**
 * XNetDevToolsProvider - Full development implementation
 *
 * Wraps the app, sets up instrumentation, manages panel visibility,
 * and provides context to all devtools panels.
 */

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
  type ReactNode,
  type MouseEvent as ReactMouseEvent
} from 'react'
import type * as Y from 'yjs'
import {
  DevToolsContext,
  type PanelId,
  type PanelPosition,
  type YDocRegistry
} from './DevToolsContext'
import { DevToolsEventBus } from '../core/event-bus'
import { DEFAULTS } from '../core/constants'
import { instrumentStore } from '../instrumentation/store'
import { instrumentYDoc } from '../instrumentation/yjs'
import { instrumentTelemetry } from '../instrumentation/telemetry'
import { QueryTracker } from '../instrumentation/query'
import {
  useNodeStore,
  InstrumentationContext,
  type InstrumentationContextValue
} from '@xnet/react/internal'
import { DevToolsPanel } from '../panels/Shell'

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
function DevToolsFab({ isOpen, onToggle }: { isOpen: boolean; onToggle: () => void }) {
  const [pos, setPos] = useState({ x: 16, y: 16 }) // bottom-right offset
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
      style={{
        position: 'fixed',
        bottom: pos.y,
        right: pos.x,
        width: 32,
        height: 32,
        borderRadius: '50%',
        backgroundColor: isOpen ? '#0066ff' : '#333',
        border: '2px solid rgba(255,255,255,0.2)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: dragging.current ? 'grabbing' : 'grab',
        zIndex: 99999,
        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        userSelect: 'none',
        transition: 'background-color 0.15s'
      }}
    >
      <svg
        width={14}
        height={14}
        viewBox="0 0 24 24"
        fill="none"
        stroke="white"
        strokeWidth={2.5}
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
}

const STORAGE_KEY_OPEN = 'xnet:devtools:open'
const STORAGE_KEY_PANEL = 'xnet:devtools:panel'
const STORAGE_KEY_POSITION = 'xnet:devtools:position'

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
  if (
    stored &&
    ['nodes', 'queries', 'sync', 'yjs', 'schemas', 'timeline', 'telemetry'].includes(stored)
  ) {
    return stored as PanelId
  }
  return defaultPanel
}

function loadStoredPosition(defaultPosition: PanelPosition): PanelPosition {
  if (typeof localStorage === 'undefined') return defaultPosition
  const stored = localStorage.getItem(STORAGE_KEY_POSITION)
  if (stored === 'bottom' || stored === 'right') {
    return stored
  }
  return defaultPosition
}

export function XNetDevToolsProvider({
  children,
  defaultOpen = false,
  defaultPanel = 'nodes',
  position: initialPosition = 'bottom',
  height: initialHeight = DEFAULTS.PANEL_HEIGHT,
  maxEvents = DEFAULTS.MAX_EVENTS,
  telemetryCollector,
  consentManager
}: XNetDevToolsProviderProps) {
  const [isOpen, setIsOpenState] = useState(() => loadStoredOpen(defaultOpen))
  const [activePanel, setActivePanelState] = useState<PanelId>(() => loadStoredPanel(defaultPanel))
  const [position, setPositionState] = useState<PanelPosition>(() =>
    loadStoredPosition(initialPosition)
  )
  const [height, setHeight] = useState(initialHeight)

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

  const busRef = useRef<DevToolsEventBus>(new DevToolsEventBus({ maxEvents }))
  const yDocRegistryRef = useRef(createYDocRegistry(busRef.current))
  const queryTrackerRef = useRef(new QueryTracker(busRef.current))
  const cleanupsRef = useRef<Array<() => void>>([])

  // Get store from NodeStoreProvider context
  const { store } = useNodeStore()

  // Set up store instrumentation when store becomes available
  useEffect(() => {
    if (!store) return

    const cleanup = instrumentStore(store, busRef.current)
    cleanupsRef.current.push(cleanup)

    return () => {
      cleanup()
      cleanupsRef.current = cleanupsRef.current.filter((fn) => fn !== cleanup)
    }
  }, [store])

  // Set up telemetry instrumentation when collector and consent are available
  useEffect(() => {
    if (!telemetryCollector || !consentManager) return

    const cleanup = instrumentTelemetry(telemetryCollector, consentManager, busRef.current)
    cleanupsRef.current.push(cleanup)

    return () => {
      cleanup()
      cleanupsRef.current = cleanupsRef.current.filter((fn) => fn !== cleanup)
    }
  }, [telemetryCollector, consentManager])

  // Cleanup all instrumentation on unmount
  useEffect(() => {
    return () => {
      cleanupsRef.current.forEach((fn) => fn())
      cleanupsRef.current = []
    }
  }, [])

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

  const contextValue = {
    isOpen,
    activePanel,
    position,
    height,
    toggle,
    setActivePanel,
    setPosition,
    setHeight,
    eventBus: busRef.current,
    store,
    yDocRegistry: yDocRegistryRef.current
  }

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
          <DevToolsFab isOpen={isOpen} onToggle={toggle} />
        </div>
      </InstrumentationContext.Provider>
    </DevToolsContext.Provider>
  )
}
