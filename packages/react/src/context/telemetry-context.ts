/**
 * Telemetry context for @xnetjs/react
 *
 * Provides an optional duck-typed TelemetryReporter to the React tree.
 * When present, hooks report performance timing, usage counts, and errors.
 *
 * Uses the same duck-typed interface pattern as other xNet packages to
 * avoid circular dependencies with @xnetjs/telemetry.
 */

import { createContext, useContext } from 'react'

// ─── TelemetryReporter Interface ─────────────────────────────────────────────

/**
 * Duck-typed interface for telemetry reporting.
 * Satisfied by @xnetjs/telemetry's TelemetryCollector or any compatible object.
 *
 * @example
 * ```ts
 * import { TelemetryCollector } from '@xnetjs/telemetry'
 * const telemetry = new TelemetryCollector({ consent })
 * // Pass to XNetProvider via config.telemetry
 * ```
 */
export interface TelemetryReporter {
  reportPerformance(metricName: string, durationMs: number): void
  reportUsage(metricName: string, count: number): void
  reportCrash(error: Error, context?: Record<string, unknown>): void
}

// ─── Context ─────────────────────────────────────────────────────────────────

export const TelemetryContext = createContext<TelemetryReporter | null>(null)

/**
 * Hook to access the telemetry reporter (null if no telemetry configured).
 * @internal Used by useQuery/useMutate - not part of public API.
 */
export function useTelemetryReporter(): TelemetryReporter | null {
  return useContext(TelemetryContext)
}
