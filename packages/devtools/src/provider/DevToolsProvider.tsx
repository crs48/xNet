/**
 * DevToolsProvider - Full development implementation
 *
 * Wraps the app, sets up instrumentation, manages panel visibility,
 * and provides context to all devtools panels.
 */

import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react'
import { DevToolsContext, type PanelId, type PanelPosition } from './DevToolsContext'
import { DevToolsEventBus } from '../core/event-bus'
import { DEFAULTS } from '../core/constants'
import { instrumentStore } from '../instrumentation/store'
import { useNodeStore } from '@xnet/react/internal'
import { DevToolsPanel } from '../panels/Shell'

export interface DevToolsProviderProps {
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
}

export function DevToolsProvider({
  children,
  defaultOpen = false,
  defaultPanel = 'nodes',
  position: initialPosition = 'bottom',
  height: initialHeight = DEFAULTS.PANEL_HEIGHT,
  maxEvents = DEFAULTS.MAX_EVENTS
}: DevToolsProviderProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)
  const [activePanel, setActivePanel] = useState<PanelId>(defaultPanel)
  const [position, setPosition] = useState<PanelPosition>(initialPosition)
  const [height, setHeight] = useState(initialHeight)

  const busRef = useRef<DevToolsEventBus>(new DevToolsEventBus({ maxEvents }))
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
    store
  }

  return (
    <DevToolsContext.Provider value={contextValue}>
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
      </div>
    </DevToolsContext.Provider>
  )
}
