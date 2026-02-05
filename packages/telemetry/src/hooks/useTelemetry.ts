/**
 * useTelemetry - Hook for reporting telemetry from React components.
 */

import type { ReportOptions } from '../collection/collector'
import type { TelemetryTier } from '../consent/types'
import { useCallback, useRef, useEffect } from 'react'
import { useTelemetryContext } from './TelemetryContext'

export interface UseTelemetryOptions {
  /** Minimum tier required for this component's telemetry */
  minTier?: TelemetryTier

  /** Component name for crash context */
  component?: string
}

export interface UseTelemetryReturn {
  /** Whether telemetry is enabled for this tier */
  isEnabled: boolean

  /** Report generic telemetry */
  report: (
    schemaId: string,
    data: Record<string, unknown>,
    options?: ReportOptions
  ) => string | null

  /** Report a crash/error */
  reportCrash: (
    error: Error,
    context?: {
      codeNamespace?: string
      codeFunction?: string
      userAction?: string
      serviceVersion?: string
      osType?: string
    }
  ) => string | null

  /** Report a usage metric */
  reportUsage: (
    metric: string,
    value: number,
    period?: 'daily' | 'weekly' | 'monthly'
  ) => string | null

  /** Report a performance metric */
  reportPerformance: (metric: string, durationMs: number, codeNamespace?: string) => string | null

  /** Report a security event */
  reportSecurity: (
    eventName: string,
    severity: 'low' | 'medium' | 'high' | 'critical',
    details?: Record<string, unknown>
  ) => string | null
}

/**
 * Hook for reporting telemetry from React components.
 * Wraps TelemetryCollector methods with component context.
 */
export function useTelemetry(options: UseTelemetryOptions = {}): UseTelemetryReturn {
  const { consent, collector } = useTelemetryContext()
  const componentRef = useRef(options.component)

  useEffect(() => {
    componentRef.current = options.component
  }, [options.component])

  const isEnabled = consent.allowsTier(options.minTier ?? 'local')

  const report = useCallback(
    (
      schemaId: string,
      data: Record<string, unknown>,
      reportOptions?: ReportOptions
    ): string | null => {
      if (!collector) return null
      return collector.report(schemaId, data, reportOptions)
    },
    [collector]
  )

  const reportCrash = useCallback(
    (
      error: Error,
      context?: {
        codeNamespace?: string
        codeFunction?: string
        userAction?: string
        serviceVersion?: string
        osType?: string
      }
    ): string | null => {
      if (!collector) return null
      return collector.reportCrash(error, {
        codeNamespace: context?.codeNamespace ?? componentRef.current,
        ...context
      })
    },
    [collector]
  )

  const reportUsage = useCallback(
    (
      metric: string,
      value: number,
      period: 'daily' | 'weekly' | 'monthly' = 'daily'
    ): string | null => {
      if (!collector) return null
      return collector.reportUsage(metric, value, period)
    },
    [collector]
  )

  const reportPerformance = useCallback(
    (metric: string, durationMs: number, codeNamespace?: string): string | null => {
      if (!collector) return null
      return collector.reportPerformance(metric, durationMs, codeNamespace ?? componentRef.current)
    },
    [collector]
  )

  const reportSecurity = useCallback(
    (
      eventName: string,
      severity: 'low' | 'medium' | 'high' | 'critical',
      details?: Record<string, unknown>
    ): string | null => {
      if (!collector) return null
      return collector.reportSecurityEvent(eventName, severity, details)
    },
    [collector]
  )

  return {
    isEnabled,
    report,
    reportCrash,
    reportUsage,
    reportPerformance,
    reportSecurity
  }
}
