/**
 * DevTools React Context
 */

import type { DevToolsEventBus } from '../core/event-bus'
import type { ConsoleLogStore } from '../core/log-store'
import type { NodeStore } from '@xnetjs/data'
import type { DocumentHistoryEngine } from '@xnetjs/history'
import type * as Y from 'yjs'
import { createContext } from 'react'

export type PanelId =
  // Hero panels (always-visible primary row)
  | 'data'
  | 'changes'
  | 'logs'
  | 'performance'
  // Secondary panels (grouped in the "More" menu + command palette)
  | 'sync'
  | 'yjs'
  | 'authz'
  | 'abuse'
  | 'agent-audit'
  | 'queries'
  | 'traces'
  | 'telemetry'
  | 'schemas'
  | 'schema-history'
  | 'version'
  | 'migration'
  | 'seed'
  | 'history'
  | 'security'
  | 'sqlite'
  | 'reset'

export type PanelPosition = 'bottom' | 'right' | 'floating'

export interface RuntimeDiagnostics {
  requestedMode: 'main-thread' | 'worker' | 'ipc'
  activeMode: 'main-thread' | 'worker' | 'ipc' | null
  fallbackMode: 'main-thread' | 'worker' | 'ipc' | null
  usedFallback: boolean
  phase: 'initializing' | 'ready' | 'error'
  reason: string | null
}

export interface SyncDiagnostics {
  status: string
  lifecyclePhase: string
  queueSize: number
  trackedCount: number
  pendingBlobCount: number
  lastVerificationFailure: {
    nodeId: string
    sender: string | null
    reason: string
    at: number
  } | null
}

export interface StorageDurabilityInfo {
  state: 'granted' | 'not-granted' | 'unsupported' | 'error'
  message: string
  usageBytes?: number
  quotaBytes?: number
}

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
  /**
   * True when the full devtools implementation is mounted (dev entry). Hosts use
   * this to decide whether to render their own devtools launcher (e.g. the
   * workbench dev-tools island, 0287/0289) — it matches exactly when the FAB
   * would show, so it works in any build that bundles the real provider, not
   * only under `import.meta.env.DEV`. The production stub returns `false`.
   */
  available: boolean
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
  /** Provider-lifetime captured console output (exploration 0275) */
  consoleLogs: ConsoleLogStore
  /** The NodeStore instance (from context) */
  store: NodeStore | null
  /** Registry of Y.Doc instances for tree inspection */
  yDocRegistry: YDocRegistry

  /** Node ID of the document currently open in the app (page, database, etc.) */
  activeNodeId: string | null
  /** Called by the app when the user navigates to a different document */
  setActiveNodeId: (id: string | null) => void

  /** Document history engine for Yjs snapshot-based time travel */
  documentHistory: DocumentHistoryEngine | null
  /** Current runtime bootstrap status from XNetProvider */
  runtimeStatus: RuntimeDiagnostics
  /** Current sync lifecycle/status snapshot */
  syncDiagnostics: SyncDiagnostics
  /** Current storage durability status, if the host app provides it */
  storageDurability: StorageDurabilityInfo | null

  /**
   * Host-provided "wipe the local database" action (OPFS SQLite + IndexedDB +
   * localStorage, then reload). Null when the host app didn't wire one — the
   * Reset panel then falls back to a best-effort inline clear.
   */
  onResetLocalData: (() => void | Promise<void>) | null
  /**
   * Host-provided "wipe my data on the hub" action. Resolves with the number
   * of changes the hub removed. Null when not wired (e.g. no sync manager).
   */
  onResetHub: (() => Promise<number>) | null
}

export const DevToolsContext = createContext<DevToolsContextValue | null>(null)
