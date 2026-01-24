/**
 * DevTools instrumentation context
 *
 * Provides an optional bridge between @xnet/react hooks and @xnet/devtools.
 * When XNetDevToolsProvider is present, it populates this context so hooks
 * can report Y.Doc registrations and query lifecycle events.
 *
 * When no devtools provider is present, the context is null and hooks skip reporting.
 */

import { createContext, useContext } from 'react'
import type * as Y from 'yjs'

/**
 * Query tracker interface (implemented by @xnet/devtools QueryTracker)
 */
export interface QueryTrackerLike {
  register(
    id: string,
    meta: {
      type: 'useQuery' | 'useMutate' | 'useNode'
      schemaId: string
      mode: 'list' | 'single' | 'filtered' | 'document'
      filter?: Record<string, unknown>
      nodeId?: string
      callerInfo?: string
    }
  ): void
  recordUpdate(id: string, resultCount: number, renderTime: number): void
  recordError(id: string, error: string): void
  unregister(id: string): void
}

/**
 * Y.Doc registry interface (implemented by XNetDevToolsProvider)
 */
export interface YDocRegistryLike {
  register(docId: string, doc: Y.Doc): void
  unregister(docId: string): void
}

/**
 * Instrumentation context value
 */
export interface InstrumentationContextValue {
  /** Register/unregister Y.Docs for inspection */
  yDocRegistry: YDocRegistryLike
  /** Track query lifecycle (subscribe, result, unsubscribe) */
  queryTracker: QueryTrackerLike
}

export const InstrumentationContext = createContext<InstrumentationContextValue | null>(null)

/**
 * Hook to access instrumentation context (null if no devtools provider)
 */
export function useInstrumentation(): InstrumentationContextValue | null {
  return useContext(InstrumentationContext)
}
