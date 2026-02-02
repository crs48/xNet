/**
 * DevTools React Context
 */

import { createContext } from 'react'
import type { DevToolsEventBus } from '../core/event-bus'
import type { NodeStore } from '@xnet/data'
import type * as Y from 'yjs'

export type PanelId =
  | 'nodes'
  | 'changes'
  | 'sync'
  | 'yjs'
  | 'queries'
  | 'telemetry'
  | 'schemas'
  | 'seed'
  | 'history'

export type PanelPosition = 'bottom' | 'right' | 'floating'

/** Registry of Y.Doc instances being tracked */
export interface YDocRegistry {
  /** Get all tracked docs */
  getDocs: () => Map<string, Y.Doc>
  /** Register a doc for inspection */
  register: (docId: string, doc: Y.Doc) => void
  /** Unregister a doc */
  unregister: (docId: string) => void
}

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
  /** Registry of Y.Doc instances for tree inspection */
  yDocRegistry: YDocRegistry

  /** Node ID of the document currently open in the app (page, database, etc.) */
  activeNodeId: string | null
  /** Called by the app when the user navigates to a different document */
  setActiveNodeId: (id: string | null) => void
}

export const DevToolsContext = createContext<DevToolsContextValue | null>(null)
