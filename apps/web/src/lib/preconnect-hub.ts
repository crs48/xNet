/**
 * Warm the hub connection during boot (exploration 0204).
 *
 * Time-to-"green" is serial: the hub isn't dialed until SQLite WASM init,
 * identity unlock, and the NodeStore/bridge are all ready. The *network* setup
 * for that dial — DNS lookup, TCP, TLS — is independent of that local CPU
 * work, so we emit a <link rel="preconnect"> to the hub origin at module-eval
 * (before React mounts). The expensive handshake setup then overlaps with boot
 * and the later WebSocket upgrade is fast.
 *
 * This is a pure resource hint: no socket is opened, no auth happens, and it is
 * safe to over-issue. It does not touch the sync state machine, so it carries
 * none of the risk of buffering inbound sync before the store attaches (the
 * fuller "parallelize connect" refactor, deferred in 0204).
 */
import { configuredHubUrl } from './hub-url'

/** Map a ws(s):// hub URL to its http(s):// origin for resource hints, or null. */
export function hubHttpOrigin(hubUrl: string): string | null {
  if (!hubUrl) return null
  try {
    const url = new URL(hubUrl)
    const protocol =
      url.protocol === 'wss:' ? 'https:' : url.protocol === 'ws:' ? 'http:' : url.protocol
    return `${protocol}//${url.host}`
  } catch {
    return null
  }
}

/** Inject preconnect + dns-prefetch hints for the configured hub origin. */
export function preconnectHub(hubUrl = configuredHubUrl()): void {
  if (typeof document === 'undefined') return
  const origin = hubHttpOrigin(hubUrl)
  if (!origin) return
  for (const rel of ['preconnect', 'dns-prefetch']) {
    if (document.head.querySelector(`link[rel="${rel}"][href="${origin}"]`)) continue
    const link = document.createElement('link')
    link.rel = rel
    link.href = origin
    link.crossOrigin = 'anonymous'
    document.head.appendChild(link)
  }
}
