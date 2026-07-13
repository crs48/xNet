/**
 * Crash-ping + debug-report transport to the first-party diagnostics ingest
 * (exploration 0315 P1/P2).
 *
 * Two lanes, matching the cloud's `/diagnostics/ingest`:
 *  - `crash(ping)` — the AUTOMATIC lane. Consent-gated (tier ≥ `crashes`),
 *    scrubbed, allowlisted structured fields only, fire-and-forget, and
 *    fail-silent: telemetry must never break the app it observes. Crashes are
 *    queued and sent one at a time (the ingest dedupes by fingerprint, so a
 *    crash loop costs one record with a rising `occurrences`).
 *  - `submit(report)` — the USER-TRIGGERED lane. No consent tier required:
 *    the user just previewed the exact payload and clicked send, which IS the
 *    consent for that payload. Returns the ingest's `{ id, shortId }` so the
 *    UI can hand the user a quotable handle.
 *
 * No unique identifiers ever leave this module (the KDE rule): pings carry no
 * DID, no install id, no raw UA string.
 */

import type { ConsentManager } from '../consent/manager'
import { scrubTelemetryData } from '../collection/scrubbing'

/** Allowlisted structured fields for the automatic lane — no free text. */
export interface CrashPing {
  errorName: string
  message: string
  stack?: string
  release?: string
  surface: 'web' | 'electron' | 'hub' | 'cloud'
  bootStage?: string
  uaFamily?: string
}

/** The user-triggered lane: a crash ping plus what the user chose to attach. */
export interface DebugReport extends CrashPing {
  userDescription?: string
  breadcrumbs?: string[]
}

export interface DiagnosticsClientOptions {
  /** Ingest base URL, e.g. https://cloud.xnet.fyi (no trailing slash needed). */
  ingestUrl: string
  /** Gates the automatic lane; `submit` is deliberately not tier-gated. */
  consent: ConsentManager
  /** Override fetch (tests / non-browser runtimes). */
  fetchImpl?: typeof fetch
  /** Per-request timeout in ms. Default 10s. */
  timeoutMs?: number
}

export interface DiagnosticsClient {
  /** Automatic crash ping — consent ≥ `crashes`, queued, fail-silent. */
  crash(ping: CrashPing): void
  /** User-triggered debug report — returns the quotable id, or null on failure. */
  submit(report: DebugReport): Promise<{ id: string; shortId: string } | null>
  /** Test/teardown hook: resolves when the crash queue is idle. */
  flush(): Promise<void>
}

/** Cap the automatic queue: a crash loop should cost a few pings, not a flood. */
const MAX_QUEUED = 5

export function createDiagnosticsClient(options: DiagnosticsClientOptions): DiagnosticsClient {
  const doFetch = options.fetchImpl ?? fetch
  const base = options.ingestUrl.replace(/\/+$/, '')
  const timeoutMs = options.timeoutMs ?? 10_000

  const post = async (body: Record<string, unknown>): Promise<Response> => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      return await doFetch(`${base}/diagnostics/ingest`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        // Let a final ping escape during page unload.
        keepalive: true,
        signal: controller.signal
      })
    } finally {
      clearTimeout(timer)
    }
  }

  const queue: CrashPing[] = []
  let draining: Promise<void> = Promise.resolve()

  const drain = async (): Promise<void> => {
    while (queue.length > 0) {
      const ping = queue.shift()!
      try {
        await post({ lane: 'auto', ...scrubTelemetryData({ ...ping } as Record<string, unknown>) })
      } catch {
        // fail-silent: drop the ping, never retry-loop, never throw
      }
    }
  }

  return {
    crash(ping: CrashPing): void {
      if (!options.consent.allowsTier('crashes')) return
      if (queue.length >= MAX_QUEUED) return
      queue.push(ping)
      draining = draining.then(drain)
    },

    async submit(report: DebugReport): Promise<{ id: string; shortId: string } | null> {
      try {
        const res = await post({
          lane: 'user',
          ...scrubTelemetryData({ ...report } as Record<string, unknown>)
        })
        if (!res.ok) return null
        const json = (await res.json().catch(() => null)) as {
          id?: string
          shortId?: string
        } | null
        return json?.id && json.shortId ? { id: json.id, shortId: json.shortId } : null
      } catch {
        return null
      }
    },

    async flush(): Promise<void> {
      await draining
    }
  }
}
