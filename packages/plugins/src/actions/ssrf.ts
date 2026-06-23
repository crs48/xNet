/**
 * @xnetjs/plugins — SSRF guard for outbound actions (exploration 0213).
 *
 * Outbound actions POST to URLs that may be user-configured (a generic
 * webhook-out target). Even when the host is "allowlisted" (the action derived
 * its `network` grant from the configured URL), a user could point it at an
 * internal target — `http://169.254.169.254/` (cloud metadata), `localhost`, a
 * private RFC-1918 range — to exfiltrate credentials or reach internal
 * services. {@link assertPublicUrl} rejects those before the request leaves.
 *
 * This is a *literal-host* guard (scheme + hostname/IP inspection), not a
 * post-DNS-resolution guard: a hostname that resolves to a private IP at
 * request time is not caught here. That deeper check belongs in the fetch
 * implementation; this closes the common, cheap holes by construction.
 */

export class ActionSsrfError extends Error {
  constructor(
    message: string,
    public readonly url: string
  ) {
    super(message)
    this.name = 'ActionSsrfError'
  }
}

/** Decimal-dotted IPv4 → 32-bit int, or null if not an IPv4 literal. */
function parseIpv4(host: string): number | null {
  const parts = host.split('.')
  if (parts.length !== 4) return null
  let value = 0
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null
    const octet = Number(part)
    if (octet > 255) return null
    value = value * 256 + octet
  }
  return value >>> 0
}

function isPrivateIpv4(host: string): boolean {
  const ip = parseIpv4(host)
  if (ip === null) return false
  const inRange = (base: string, bits: number) => {
    const baseIp = parseIpv4(base)!
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0
    return (ip & mask) === (baseIp & mask)
  }
  return (
    inRange('0.0.0.0', 8) || // "this" network / 0.0.0.0
    inRange('10.0.0.0', 8) || // private
    inRange('127.0.0.0', 8) || // loopback
    inRange('169.254.0.0', 16) || // link-local + cloud metadata (169.254.169.254)
    inRange('172.16.0.0', 12) || // private
    inRange('192.168.0.0', 16) || // private
    inRange('100.64.0.0', 10) // carrier-grade NAT
  )
}

function isBlockedIpv6(host: string): boolean {
  // URL hostnames keep IPv6 in brackets; strip them.
  const h = host.replace(/^\[|\]$/g, '').toLowerCase()
  if (h === '::1' || h === '::') return true // loopback / unspecified
  if (h.startsWith('fe80') || h.startsWith('fe9') || h.startsWith('fea') || h.startsWith('feb'))
    return true // link-local fe80::/10
  if (h.startsWith('fc') || h.startsWith('fd')) return true // unique-local fc00::/7
  // IPv4-mapped (::ffff:a.b.c.d) — pull the embedded IPv4 and re-check.
  const mapped = h.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  if (mapped && isPrivateIpv4(mapped[1])) return true
  return false
}

const BLOCKED_HOSTNAMES = new Set(['localhost', 'metadata.google.internal'])

/**
 * Throw {@link ActionSsrfError} unless `rawUrl` is a plausibly-public HTTP(S)
 * endpoint: rejects non-http(s) schemes, localhost, `.local`/`.internal`
 * suffixes, the cloud metadata host, and private/loopback/link-local IP
 * literals (v4 and v6).
 */
export function assertPublicUrl(rawUrl: string): void {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new ActionSsrfError(`outbound action URL is not a valid URL: ${rawUrl}`, rawUrl)
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ActionSsrfError(`outbound action URL must be http(s): ${rawUrl}`, rawUrl)
  }

  const host = url.hostname.toLowerCase()
  const blocked =
    BLOCKED_HOSTNAMES.has(host) ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    isPrivateIpv4(host) ||
    isBlockedIpv6(host)

  if (blocked) {
    throw new ActionSsrfError(`outbound action URL targets a non-public host: ${host}`, rawUrl)
  }
}
