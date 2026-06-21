/**
 * Cookieless product analytics for the hosted app (exploration 0210).
 *
 * Loads a privacy-preserving, cookieless analytics script (Plausible by default,
 * or any compatible self-hosted endpoint via `VITE_ANALYTICS_SRC`) only when
 * `VITE_ANALYTICS_DOMAIN` is set — i.e. the official hosted demo. Self-hosted
 * and PR-preview builds load nothing. Because the script sets no cookies and
 * collects no personal data, it needs no consent banner; it is, however, still
 * suppressed when the user has globally opted out of all telemetry (consent tier
 * `off` after an explicit choice) as a courtesy to the privacy-minded.
 */
import { consent, hasChosenConsent } from './consent'

const DOMAIN: string | undefined = import.meta.env.VITE_ANALYTICS_DOMAIN
const SRC: string = import.meta.env.VITE_ANALYTICS_SRC || 'https://plausible.io/js/script.hash.js'

let loaded = false

/** Inject the cookieless analytics script. Idempotent; safe to call once at boot. */
export function initAnalytics(): void {
  if (loaded || !DOMAIN || typeof document === 'undefined') return
  // Respect an explicit global opt-out, even though the script is cookieless.
  if (hasChosenConsent() && consent.tier === 'off') return
  loaded = true
  const script = document.createElement('script')
  script.defer = true
  script.dataset.domain = DOMAIN
  script.src = SRC
  document.head.appendChild(script)
}

/** True when an analytics domain is configured for this build. */
export function isAnalyticsConfigured(): boolean {
  return Boolean(DOMAIN)
}

/** Test-only: reset the one-shot load latch. */
export function __resetAnalytics(): void {
  loaded = false
}
