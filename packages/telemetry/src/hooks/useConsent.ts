/**
 * useConsent - Hook for managing telemetry consent preferences.
 */

import type { TelemetryConsent, TelemetryTier } from '../consent/types'
import { useState, useEffect, useCallback } from 'react'
import { useTelemetryContext } from './TelemetryContext'

export interface UseConsentReturn {
  /** Current consent configuration */
  current: Readonly<TelemetryConsent>

  /** Current consent tier */
  tier: TelemetryTier

  /** Whether any telemetry is enabled */
  isEnabled: boolean

  /** Whether sharing is enabled */
  isSharingEnabled: boolean

  /** Whether consent has been loaded from storage */
  isLoaded: boolean

  /** Update consent configuration */
  setConsent: (updates: Partial<TelemetryConsent>) => Promise<void>

  /** Set just the tier */
  setTier: (tier: TelemetryTier) => Promise<void>

  /** Reset to defaults (opt out) */
  reset: () => Promise<void>

  /** Check if a tier is allowed */
  allowsTier: (tier: TelemetryTier) => boolean
}

/**
 * Hook for managing telemetry consent.
 * Subscribes to consent changes and re-renders on updates.
 */
export function useConsent(): UseConsentReturn {
  const { consent } = useTelemetryContext()
  const [, forceUpdate] = useState({})

  // Subscribe to consent changes for reactivity
  useEffect(() => {
    const handleChange = () => forceUpdate({})
    consent.on('consent-changed', handleChange)
    return () => {
      consent.off('consent-changed', handleChange)
    }
  }, [consent])

  const setConsent = useCallback(
    (updates: Partial<TelemetryConsent>) => consent.setConsent(updates),
    [consent]
  )

  const setTier = useCallback((tier: TelemetryTier) => consent.setTier(tier), [consent])

  const reset = useCallback(() => consent.reset(), [consent])

  const allowsTier = useCallback((tier: TelemetryTier) => consent.allowsTier(tier), [consent])

  return {
    current: consent.current,
    tier: consent.tier,
    isEnabled: consent.isEnabled,
    isSharingEnabled: consent.isSharingEnabled,
    isLoaded: consent.isLoaded,
    setConsent,
    setTier,
    reset,
    allowsTier
  }
}
