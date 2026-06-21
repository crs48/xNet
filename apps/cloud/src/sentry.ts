/**
 * Optional Sentry bridge for the cloud control plane (exploration 0210).
 *
 * Sentry is wired but is NOT a hard dependency. `reportToSentry` loads
 * `@sentry/node` dynamically and only when a DSN is configured; with no DSN
 * (dev / self-host) or no SDK installed it is a safe no-op. This keeps the
 * build green and the privacy posture clean until the operator opts in by
 * installing the SDK and setting `SENTRY_DSN`. Capture is fire-and-forget so a
 * slow or absent Sentry never blocks the request's 500 response.
 */

interface SentryClient {
  captureException(error: unknown): void
}

let clientPromise: Promise<SentryClient | null> | null = null

async function loadSentry(dsn: string): Promise<SentryClient | null> {
  // Computed specifier so the bundler treats `@sentry/node` as an optional
  // runtime import, not a build-time dependency to resolve.
  const moduleName = ['@sentry', 'node'].join('/')
  try {
    const sentry = (await import(moduleName)) as {
      init(options: { dsn: string }): void
      captureException(error: unknown): void
    }
    sentry.init({ dsn })
    return { captureException: (error) => sentry.captureException(error) }
  } catch {
    // SDK not installed — the report seam stays a no-op.
    return null
  }
}

/** Report an unhandled error to Sentry if a DSN is set and the SDK is present. */
export function reportToSentry(dsn: string, error: unknown): void {
  if (!dsn) return
  if (!clientPromise) clientPromise = loadSentry(dsn)
  void clientPromise.then((client) => client?.captureException(error)).catch(() => {})
}

/** Test-only: drop the memoized client so the next call re-loads. */
export function __resetSentry(): void {
  clientPromise = null
}
