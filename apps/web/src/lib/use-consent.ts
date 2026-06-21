/**
 * React binding for the app's telemetry-consent spine (exploration 0210).
 *
 * Subscribes a component to the shared `ConsentManager` so the settings panel
 * and the first-run banner stay in sync with each other and with whatever the
 * reporter/analytics read. `ConsentManager.load()` (autoLoad) does not emit, so
 * we re-read once after it resolves to pick up the persisted tier.
 */
import type { TelemetryTier } from '@xnetjs/telemetry'
import { useEffect, useState } from 'react'
import { consent, consentReady, hasChosenConsent } from './consent'

export interface ConsentBinding {
  tier: TelemetryTier
  /** True once the user has made an explicit choice (banner answered). */
  chosen: boolean
  /** Whether the current tier meets a required tier. */
  allows: (required: TelemetryTier) => boolean
  setTier: (tier: TelemetryTier) => void
  reset: () => void
}

export function useConsent(): ConsentBinding {
  const [tier, setTier] = useState<TelemetryTier>(consent.tier)
  const [chosen, setChosen] = useState<boolean>(hasChosenConsent())

  useEffect(() => {
    const sync = (): void => {
      setTier(consent.tier)
      setChosen(hasChosenConsent())
    }
    consent.on('consent-changed', sync)
    // Pick up the restored tier once the shared initial load settles (load
    // emits nothing). Uses the shared promise — never a fresh per-mount load.
    void consentReady.then(sync)
    return () => {
      consent.off('consent-changed', sync)
    }
  }, [])

  return {
    tier,
    chosen,
    allows: (required) => consent.allowsTier(required),
    setTier: (next) => void consent.setTier(next),
    reset: () => void consent.reset()
  }
}
