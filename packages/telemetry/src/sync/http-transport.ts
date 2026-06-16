/**
 * HTTP transport for TelemetrySyncProvider — closes the "transport is a stub"
 * gap (exploration 0187).
 *
 * The sync provider is push-only and consent-gated; this turns its abstract
 * `transport` hook into a real `POST <endpoint>/telemetry/ingest` call carrying
 * a UCAN bearer (so the hub knows it's a real identity and can rate-limit /
 * hash the DID). `keepalive` lets a final batch flush during page unload.
 */

import type { TelemetryBatch, AggregatorResponse } from './protocol'

export interface HttpTransportOptions {
  /** Hub base URL, e.g. https://hub.xnet.fyi (no trailing slash required). */
  endpoint: string
  /**
   * Returns a fresh UCAN bearer for the telemetry/ingest capability, or null to
   * send unauthenticated (only accepted by hubs running with `--no-auth`).
   */
  getAuthToken?: () => Promise<string | null> | string | null
  /** Override fetch (tests / non-browser runtimes). Defaults to global fetch. */
  fetchImpl?: typeof fetch
  /** Per-request timeout in ms. Default: 10s. */
  timeoutMs?: number
}

export type TelemetryTransport = (
  aggregator: string,
  batch: TelemetryBatch
) => Promise<AggregatorResponse>

const normalizeEndpoint = (endpoint: string): string => endpoint.replace(/\/+$/, '')

/**
 * Build a transport function suitable for `TelemetrySyncConfig.transport`.
 *
 * The `aggregator` argument from the provider is ignored in favour of the
 * configured `endpoint`; pass a single-element `aggregators` array (the hub URL)
 * to keep the provider's failover loop a no-op.
 */
export function createHttpTransport(opts: HttpTransportOptions): TelemetryTransport {
  const doFetch = opts.fetchImpl ?? fetch
  const base = normalizeEndpoint(opts.endpoint)
  const timeoutMs = opts.timeoutMs ?? 10_000

  return async (_aggregator: string, batch: TelemetryBatch): Promise<AggregatorResponse> => {
    const token = opts.getAuthToken ? await opts.getAuthToken() : null

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await doFetch(`${base}/telemetry/ingest`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(token ? { authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify(batch),
        keepalive: true,
        signal: controller.signal
      })

      if (!res.ok) {
        return { accepted: false, processed: 0, error: `http_${res.status}` }
      }

      const json = (await res.json().catch(() => null)) as Partial<AggregatorResponse> | null
      return {
        accepted: json?.accepted ?? true,
        processed: json?.processed ?? batch.records.length,
        error: json?.error
      }
    } catch (err) {
      return {
        accepted: false,
        processed: 0,
        error: err instanceof Error ? err.message : 'transport_error'
      }
    } finally {
      clearTimeout(timer)
    }
  }
}
