/**
 * @xnet/devtools - Production entry point
 *
 * No-op provider that renders children unchanged.
 * In development builds, the bundler selects index.dev.ts instead.
 * Tree-shakes to zero bytes in production.
 */

import type { ReactNode } from 'react'

export interface XNetDevToolsProviderProps {
  children: ReactNode
  defaultOpen?: boolean
  position?: 'bottom' | 'right' | 'floating'
  height?: number
  maxEvents?: number
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
    isOpen: false,
    toggle: () => {},
    eventBus: null,
    activeNodeId: null as string | null,
    setActiveNodeId: (_id: string | null) => {}
  }
}

// Re-export types for consumers who type-check against devtools
export type { DevToolsEvent, DevToolsEventType } from './core/types'
