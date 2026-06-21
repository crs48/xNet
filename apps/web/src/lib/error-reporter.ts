/**
 * Vendor-neutral, consent-gated error reporter (exploration 0210).
 *
 * Fans every captured failure out to two sinks, each independently gated:
 *  - the first-party `@xnetjs/telemetry` collector (`reportCrash`), which stores
 *    crashes locally and ships them only at consent tier ≥ crashes — the
 *    privacy-preserving path that also feeds the hub telemetry store (0187);
 *  - the optional Sentry adapter (`./sentry`), for rich stack-trace debugging,
 *    loaded only when `VITE_SENTRY_DSN` is configured.
 *
 * The whole reporter is ENV-GATED to the hosted demo via `VITE_XNET_TELEMETRY`,
 * so a self-hosted or PR-preview build registers no sink and phones nothing
 * home. P0's boot diagnostics still record the failure locally regardless, so
 * the in-app "couldn't start" screen works everywhere.
 */
import { TelemetryCollector, createDefaultTelemetryBuffer } from '@xnetjs/telemetry'
import { onBootFailure, type BootFailure } from './boot-diagnostics'
import { consent } from './consent'
import { captureToSentry } from './sentry'

/** Only the official hosted demo build sets this — never self-host or previews. */
const TELEMETRY_ENABLED = import.meta.env.VITE_XNET_TELEMETRY === 'on'

let collector: TelemetryCollector | null = null

function getCollector(): TelemetryCollector {
  if (!collector) {
    collector = new TelemetryCollector({ consent, buffer: createDefaultTelemetryBuffer() })
  }
  return collector
}

function toError(failure: BootFailure, error?: unknown): Error {
  if (error instanceof Error) return error
  const e = new Error(failure.message)
  if (failure.stack) e.stack = failure.stack
  return e
}

/** Report a failure to both sinks (each applies its own consent/env gate). */
export function reportError(failure: BootFailure, error?: unknown): void {
  const err = toError(failure, error)
  // First-party collector: internally returns null below tier 'crashes'.
  getCollector().reportCrash(err, {
    codeNamespace: 'web',
    codeFunction: failure.stage,
    userAction: failure.kind,
    serviceVersion: import.meta.env.VITE_APP_VERSION,
    osType: 'web'
  })
  // Sentry: explicit consent gate (the adapter additionally no-ops without a DSN).
  if (consent.allowsTier('crashes')) captureToSentry(err)
}

/**
 * Register the reporter as the boot-diagnostics sink. Call once, early in
 * `main.tsx`. A no-op (no sink registered) on non-hosted builds.
 */
export function initErrorReporter(): void {
  if (!TELEMETRY_ENABLED) return
  onBootFailure(reportError)
}

/** Test-only: drop the memoized collector. */
export function __resetErrorReporter(): void {
  collector = null
}
