/**
 * TelemetryContext - React context for telemetry consent and collection.
 */

import { createContext, useContext, type ReactNode } from 'react'
import type { ConsentManager } from '../consent/manager'
import type { TelemetryCollector } from '../collection/collector'

export interface TelemetryContextValue {
  consent: ConsentManager
  collector?: TelemetryCollector
}

export const TelemetryContext = createContext<TelemetryContextValue | null>(null)

export interface TelemetryProviderProps {
  consent: ConsentManager
  collector?: TelemetryCollector
  children: ReactNode
}

/**
 * Provider for telemetry context.
 * Wraps React tree with consent manager and optional collector.
 */
export function TelemetryProvider({ consent, collector, children }: TelemetryProviderProps) {
  return (
    <TelemetryContext.Provider value={{ consent, collector }}>{children}</TelemetryContext.Provider>
  )
}

/**
 * Access telemetry context. Throws if used outside TelemetryProvider.
 * @internal
 */
export function useTelemetryContext(): TelemetryContextValue {
  const context = useContext(TelemetryContext)
  if (!context) {
    throw new Error('useTelemetry/useConsent must be used within a TelemetryProvider')
  }
  return context
}
