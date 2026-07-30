/**
 * @xnetjs/devtools - Production entry point
 *
 * No-op provider that renders children unchanged.
 * In development builds, the bundler selects index.dev.ts instead.
 * Tree-shakes to zero bytes in production.
 */

import type { ReactNode } from 'react'

export interface XNetDevToolsProviderProps {
  children: ReactNode
  defaultOpen?: boolean
  defaultPanel?: string
  position?: 'bottom' | 'right' | 'floating'
  height?: number
  maxEvents?: number
  /** TelemetryCollector instance for telemetry instrumentation. Ignored in production. */
  telemetryCollector?: unknown
  /** ConsentManager instance for telemetry instrumentation. Ignored in production. */
  consentManager?: unknown
  /** TraceCollector instance for the Traces panel (exploration 0190). Ignored in production. */
  traceCollector?: unknown
  /** Storage durability status supplied by the host app. Ignored in production. */
  storageDurability?: unknown
  /** Floating toggle FAB offset. Ignored in production. */
  fabInitialOffset?: { x: number; y: number }
  /** Hide the floating toggle FAB (host renders its own launcher). Ignored in production. */
  hideFab?: boolean
  /** "Wipe local database" action wired by the host. Ignored in production. */
  onResetLocalData?: () => void | Promise<void>
  /** "Wipe my data on the hub" action. Ignored in production. */
  onResetHub?: () => Promise<number>
}

/**
 * No-op in production. Renders children unchanged.
 * In development builds, this is replaced by the full implementation.
 */
export function XNetDevToolsProvider({ children }: XNetDevToolsProviderProps) {
  return children
}

export function useDevTools() {
  return {
    available: false,
    isOpen: false,
    toggle: () => {},
    eventBus: null,
    activeNodeId: null as string | null,
    setActiveNodeId: (_id: string | null) => {},
    documentHistory: null
  }
}

// Re-export types for consumers who type-check against devtools
export type { DevToolsEvent, DevToolsEventType } from './core/types'
