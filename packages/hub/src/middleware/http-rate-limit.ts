/**
 * @xnetjs/hub - HTTP rate limiting middleware.
 */

import type { MiddlewareHandler } from 'hono'

type HttpRateLimitConfig = {
  /** Max requests per window per IP (default: 100). */
  maxRequests: number
  /** Window duration in ms (default: 60000). */
  windowMs: number
  /** Max tracked IPs before cleanup (default: 10000). */
  maxTrackedIps: number
}

type IpState = {
  count: number
  windowStart: number
}

const DEFAULT_CONFIG: HttpRateLimitConfig = {
  maxRequests: 100,
  windowMs: 60_000,
  maxTrackedIps: 10_000
}

/**
 * Create Hono middleware for per-IP HTTP rate limiting.
 */
export function createHttpRateLimiter(config?: Partial<HttpRateLimitConfig>): MiddlewareHandler {
  const resolved = { ...DEFAULT_CONFIG, ...config }
  const ipMap = new Map<string, IpState>()

  // Periodic cleanup to prevent unbounded growth
  const cleanup = (): void => {
    if (ipMap.size <= resolved.maxTrackedIps) return
    const now = Date.now()
    for (const [ip, state] of ipMap) {
      if (now - state.windowStart >= resolved.windowMs) {
        ipMap.delete(ip)
      }
    }
  }

  return async (c, next) => {
    const ip =
      c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ??
      c.req.header('x-real-ip') ??
      'unknown'

    const now = Date.now()
    let state = ipMap.get(ip)

    if (!state || now - state.windowStart >= resolved.windowMs) {
      state = { count: 0, windowStart: now }
      ipMap.set(ip, state)
    }

    state.count += 1

    if (state.count > resolved.maxRequests) {
      const retryAfter = Math.ceil((state.windowStart + resolved.windowMs - now) / 1000)
      c.header('Retry-After', String(retryAfter))
      return c.json({ error: 'Too many requests', retryAfter }, 429)
    }

    cleanup()
    await next()
  }
}
