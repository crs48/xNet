/**
 * User-triggered debug-report composer (exploration 0315 P2).
 *
 * "Report a problem" builds one of these, shows the user the EXACT payload
 * (each section toggleable), and only sends what they confirm. Because the send
 * is an explicit, previewed action, this lane needs no ambient consent tier —
 * the click IS the consent for this payload.
 *
 * Everything here is re-scrubbed at compose time: the devtools log ring is
 * already scrubbed on snapshot (0275), but a single redaction layer is exactly
 * what leaked for Signal, so we scrub again before it can leave the device.
 */

import type { DebugReport } from '@xnetjs/telemetry'
import { scrubTelemetryData } from '@xnetjs/telemetry'
import { lastBootPhase } from './boot-timeline'
import { uaFamilyOnly } from './ua-family'

/** The composed report, split into sections the preview UI can toggle. */
export interface ComposedDebugReport {
  userDescription: string
  release?: string
  surface: DebugReport['surface']
  bootStage?: string
  uaFamily?: string
  /** Scrubbed recent console lines (devtools ring + electron main crashes). */
  breadcrumbs: string[]
  /** The most recent captured boot/runtime error, if any. */
  lastError?: { kind: string; message: string; stage: string }
}

/** Which sections the user kept in the preview. Description is always sent. */
export interface ReportSectionToggles {
  breadcrumbs: boolean
  lastError: boolean
  systemInfo: boolean
}

export const DEFAULT_SECTION_TOGGLES: ReportSectionToggles = {
  breadcrumbs: true,
  lastError: true,
  systemInfo: true
}

interface ComposeInput {
  userDescription: string
  /** Recent scrubbed console lines from the devtools ring (0275). */
  breadcrumbs?: string[]
}

const isElectron = (): boolean =>
  typeof window !== 'undefined' && (window as { xnet?: unknown }).xnet !== undefined

/**
 * Pull recent main-process crash lines from the Electron bridge, if present.
 * No-op (returns []) in the browser. Read-only IPC — nothing is transmitted
 * here; the lines only become part of a report the user explicitly sends.
 */
export async function collectElectronCrashBreadcrumbs(): Promise<string[]> {
  const bridge = (window as { xnet?: { readCrashLog?: () => Promise<unknown> } }).xnet
  if (!bridge?.readCrashLog) return []
  try {
    const entries = await bridge.readCrashLog()
    if (!Array.isArray(entries)) return []
    return entries
      .filter(
        (e): e is { kind: string; message: string } =>
          typeof e === 'object' && e !== null && 'message' in e
      )
      .map((e) => `main [${e.kind}] ${e.message}`)
  } catch {
    return []
  }
}

/** Build the report from local diagnostics, scrubbing every free-text field. */
export function composeDebugReport(input: ComposeInput): ComposedDebugReport {
  const failure = typeof window !== 'undefined' ? window.__xnetBootError : undefined

  const scrubbed = scrubTelemetryData({
    userDescription: input.userDescription,
    breadcrumbs: input.breadcrumbs ?? [],
    lastErrorMessage: failure?.message ?? ''
  }) as { userDescription: string; breadcrumbs: string[]; lastErrorMessage: string }

  return {
    userDescription: scrubbed.userDescription,
    release: import.meta.env.VITE_APP_VERSION as string | undefined,
    surface: isElectron() ? 'electron' : 'web',
    bootStage: lastBootPhase(),
    uaFamily: typeof navigator !== 'undefined' ? uaFamilyOnly(navigator.userAgent) : undefined,
    breadcrumbs: scrubbed.breadcrumbs,
    lastError: failure
      ? { kind: failure.kind, message: scrubbed.lastErrorMessage, stage: failure.stage }
      : undefined
  }
}

/**
 * Reduce a composed report to the exact `DebugReport` payload that will be
 * POSTed, honouring the user's section toggles. This is the object the preview
 * renders verbatim — what the user sees is byte-for-byte what is sent.
 */
export function toSubmitPayload(
  report: ComposedDebugReport,
  toggles: ReportSectionToggles
): DebugReport {
  return {
    errorName: report.lastError?.kind ?? 'UserReport',
    message:
      report.lastError && toggles.lastError ? report.lastError.message : report.userDescription,
    stack: report.lastError && toggles.lastError ? report.lastError.stage : undefined,
    release: toggles.systemInfo ? report.release : undefined,
    surface: report.surface,
    bootStage: toggles.systemInfo ? report.bootStage : undefined,
    uaFamily: toggles.systemInfo ? report.uaFamily : undefined,
    userDescription: report.userDescription,
    breadcrumbs: toggles.breadcrumbs ? report.breadcrumbs : undefined
  }
}
