/**
 * DevTools React Context
 */

import { createContext } from 'react'
import type { DevToolsEventBus } from '../core/event-bus'
import type { NodeStore } from '@xnet/data'

export type PanelId = 'nodes' | 'changes' | 'sync' | 'yjs' | 'queries' | 'telemetry' | 'schemas'

export type PanelPosition = 'bottom' | 'right' | 'floating'

export interface DevToolsContextValue {
  /** Whether the devtools panel is open */
  isOpen: boolean
  /** Currently active panel tab */
  activePanel: PanelId
  /** Panel dock position */
  position: PanelPosition
  /** Panel height/width in pixels */
  height: number

  /** Toggle panel visibility */
  toggle: () => void
  /** Switch to a specific panel */
  setActivePanel: (panel: PanelId) => void
  /** Change panel position */
  setPosition: (pos: PanelPosition) => void
  /** Set panel height */
  setHeight: (height: number) => void

  /** The event bus instance */
  eventBus: DevToolsEventBus
  /** The NodeStore instance (from context) */
  store: NodeStore | null
}

export const DevToolsContext = createContext<DevToolsContextValue | null>(null)
