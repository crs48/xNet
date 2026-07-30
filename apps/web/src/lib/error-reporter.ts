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
import {
  TelemetryCollector,
  createDefaultTelemetryBuffer,
  createDiagnosticsClient,
  type CrashPing,
  type DiagnosticsClient
} from '@xnetjs/telemetry'
import { onBootFailure, type BootFailure } from './boot-diagnostics'
import { consent } from './consent'
import { diagnosticsIngestBase } from './hub-url'
import { captureToSentry } from './sentry'
import { uaFamilyOnly } from './ua-family'

/** Only the official hosted demo build sets this — never self-host or previews. */
const TELEMETRY_ENABLED = import.meta.env.VITE_XNET_TELEMETRY === 'on'
/** Vendor-cloud ingest fallback (0315), e.g. https://cloud.xnet.fyi. Unset → none. */
const DIAGNOSTICS_URL = import.meta.env.VITE_DIAGNOSTICS_URL as string | undefined

/**
 * Where diagnostics go (exploration 0341): the deployment's OWN hub first —
 * crash reports stay inside the user's trust domain, on every build, with no
 * env vars. The vendor cloud ingest is only the fallback for the hosted demo
 * running hubless, and only on official telemetry-enabled builds; self-host
 * and PR-preview builds without a hub resolve to null and phone nothing home.
 * Resolved per send, so connecting a hub in Settings takes effect live.
 */
function resolveIngestBase(): string | null {
  const own = diagnosticsIngestBase()
  if (own) return own
  return TELEMETRY_ENABLED && DIAGNOSTICS_URL ? DIAGNOSTICS_URL : null
}

let collector: TelemetryCollector | null = null
let diagnostics: DiagnosticsClient | null = null

function getCollector(): TelemetryCollector {
  if (!collector) {
    collector = new TelemetryCollector({ consent, buffer: createDefaultTelemetryBuffer() })
  }
  return collector
}

/**
 * The app's single local telemetry collector — the one place anything is
 * buffered about the user. Exposed so the "what we know about you" mirror
 * (Charter §Consent, exploration 0234) can enumerate and purge it.
 */
export function getTelemetryCollector(): TelemetryCollector {
  return getCollector()
}

/**
 * The first-party diagnostics transport (0315), or null when this build has no
 * ingest configured (self-host, previews). The automatic lane inside it is
 * consent-gated; `submit` (the user-triggered lane) is exposed to the
 * "Report a problem" flow, where the explicit send IS the consent.
 */
export function getDiagnosticsClient(): DiagnosticsClient | null {
  if (resolveIngestBase() === null) return null
  if (!diagnostics) {
    // The resolver is passed through so the destination follows the connected
    // hub — a hub set later in Settings redirects the very next send.
    diagnostics = createDiagnosticsClient({ ingestUrl: resolveIngestBase, consent })
  }
  return diagnostics
}

/** Whether this client currently has a first-party diagnostics destination. */
export function isDiagnosticsConfigured(): boolean {
  return resolveIngestBase() !== null
}

/** Whether diagnostics go to this deployment's own hub (vs the vendor cloud). */
export function isDiagnosticsLocalFirst(): boolean {
  return diagnosticsIngestBase() !== null
}

/** Whether the app is running inside the desktop shell (preload bridge present). */
const isElectron = (): boolean =>
  typeof window !== 'undefined' && (window as { xnet?: unknown }).xnet !== undefined

/**
 * Structured errors group better than raw names: a `TaggedError`'s `_tag` (and
 * `code`, when the class carries one) survives re-bundling and message churn,
 * so it becomes the fingerprint's error-name input (0303/0341). Duck-typed
 * rather than `instanceof` so tagged errors from any bundle copy qualify.
 */
function reportedErrorName(error: Error): string {
  const tag = (error as { _tag?: unknown })._tag
  if (typeof tag !== 'string' || tag.length === 0) return error.name || 'Error'
  const code = (error as { code?: unknown }).code
  return typeof code === 'string' && code.length > 0 ? `${tag}.${code}` : tag
}

/** Shared shape for the automatic crash lane and the debug-report composer. */
export function toCrashPing(failure: BootFailure, error: Error): CrashPing {
  return {
    errorName: reportedErrorName(error),
    message: failure.message,
    stack: failure.stack ?? error.stack,
    release: import.meta.env.VITE_APP_VERSION as string | undefined,
    surface: isElectron() ? 'electron' : 'web',
    bootStage: failure.stage,
    uaFamily: typeof navigator !== 'undefined' ? uaFamilyOnly(navigator.userAgent) : undefined
  }
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
  // First-party ingest (0315): the client itself enforces consent ≥ crashes and
  // is fail-silent; null when no ingest URL is configured for this build.
  getDiagnosticsClient()?.crash(toCrashPing(failure, err))
}

/**
 * Register the reporter as the boot-diagnostics sink. Call once, early in
 * `main.tsx`. Registered on telemetry-enabled builds (0210) and on any build
 * with a connected hub (0341 — deployment-local capture to the user's own
 * hub); a hubless self-host or PR-preview build still registers no sink.
 */
export function initErrorReporter(): void {
  if (!TELEMETRY_ENABLED && !isDiagnosticsLocalFirst()) return
  onBootFailure(reportError)
}

/** Test-only: drop the memoized collector + diagnostics client. */
export function __resetErrorReporter(): void {
  collector = null
  diagnostics = null
}
