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
import { consent, consentReady, hasChosenConsent } from './consent'

const DOMAIN: string | undefined = import.meta.env.VITE_ANALYTICS_DOMAIN
const SRC: string = import.meta.env.VITE_ANALYTICS_SRC || 'https://plausible.io/js/script.hash.js'

let started = false

/**
 * Whether cookieless analytics is allowed. It needs no consent (no cookies, no
 * personal data), so the only thing that suppresses it is an EXPLICIT global
 * opt-out — a real choice (`grantedAt` set) that left the tier at `off`. Must be
 * evaluated only after the persisted consent has loaded; the in-memory default
 * reads as "not chosen" and would defeat a stored opt-out.
 */
export function analyticsAllowed(): boolean {
  return !(hasChosenConsent() && consent.tier === 'off')
}

function inject(): void {
  const script = document.createElement('script')
  script.defer = true
  script.dataset.domain = DOMAIN
  script.src = SRC
  document.head.appendChild(script)
}

/** Inject the cookieless analytics script. Idempotent; safe to call once at boot. */
export function initAnalytics(): void {
  if (started || !DOMAIN || typeof document === 'undefined') return
  started = true
  // Defer the decision until the persisted consent has loaded, so an explicit
  // opt-out made on a previous visit is honored (the synchronous boot tick would
  // otherwise read the default "not chosen" state and inject anyway).
  void consentReady.then(() => {
    if (analyticsAllowed()) inject()
  })
}

/** True when an analytics domain is configured for this build. */
export function isAnalyticsConfigured(): boolean {
  return Boolean(DOMAIN)
}

/** Test-only: reset the one-shot load latch. */
export function __resetAnalytics(): void {
  started = false
}
