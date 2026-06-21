/**
 * Optional browser Sentry adapter (exploration 0210).
 *
 * Sentry is wired without an npm dependency: when `VITE_SENTRY_DSN` is set we
 * lazily inject Sentry's official CDN Loader Script and forward exceptions to
 * it. With no DSN (self-host / PR previews / dev) nothing is loaded and every
 * call is a no-op — so the bundle stays clean and the privacy posture holds
 * until the hosted demo opts in. Capture is also gated on consent by the caller
 * (`error-reporter.ts` only calls this at tier ≥ crashes).
 *
 * `sendDefaultPii: false` + a `beforeSend` scrub keep user data out of reports.
 */
import { scrubTelemetryData } from '@xnetjs/telemetry'

interface SentryGlobal {
  onLoad(cb: () => void): void
  init(options: Record<string, unknown>): void
  captureException(error: unknown): void
  forceLoad?(): void
}

declare global {
  interface Window {
    Sentry?: SentryGlobal
  }
}

const DSN: string | undefined = import.meta.env.VITE_SENTRY_DSN
const RELEASE: string | undefined = import.meta.env.VITE_APP_VERSION

/** Parse the public key from a DSN (`https://<key>@host/project`). */
export function publicKeyFromDsn(dsn: string): string | null {
  try {
    return new URL(dsn).username || null
  } catch {
    return null
  }
}

let injected = false

/** Inject Sentry's Loader Script once and configure it on load. */
function loadSentry(dsn: string): void {
  if (injected || typeof document === 'undefined') return
  const key = publicKeyFromDsn(dsn)
  if (!key) return
  injected = true
  const script = document.createElement('script')
  script.src = `https://js.sentry-cdn.com/${key}.min.js`
  script.crossOrigin = 'anonymous'
  script.onload = () => {
    window.Sentry?.onLoad(() => {
      window.Sentry?.init({
        dsn,
        release: RELEASE,
        sendDefaultPii: false,
        // Reuse the first-party scrubber so paths/emails/IPs/tokens never ship.
        beforeSend: (event: Record<string, unknown>) => scrubTelemetryData(event)
      })
    })
    window.Sentry?.forceLoad?.()
  }
  document.head.appendChild(script)
}

/** Report an error to Sentry if a DSN is configured. Lazy + fire-and-forget. */
export function captureToSentry(error: unknown): void {
  if (!DSN) return
  loadSentry(DSN)
  // The loader queues calls made before the SDK finishes downloading.
  window.Sentry?.captureException(error)
}

/** True when a Sentry DSN is configured for this build. */
export function isSentryConfigured(): boolean {
  return Boolean(DSN)
}

/** Test-only: reset the one-shot injection latch. */
export function __resetSentry(): void {
  injected = false
}
