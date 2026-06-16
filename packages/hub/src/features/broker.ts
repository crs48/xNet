/**
 * @xnetjs/hub - Capability / secret broker (exploration 0189).
 *
 * A hub feature only ever sees the environment secrets it explicitly declared.
 * `scopedEnv` projects the full process env down to a feature's allowlist, so a
 * billing feature can read `STRIPE_SECRET_KEY` but never `HUB_GITHUB_WEBHOOK_SECRET`,
 * and vice-versa. This is the server-side half of the capability model: features
 * declare `secrets`, the broker enforces them at mount time.
 *
 * Allowlist entries are either an exact key (`STRIPE_SECRET_KEY`) or a
 * `PREFIX_*` glob (`BTCPAY_*`).
 */

export type Env = Record<string, string | undefined>

/** Is `key` permitted by the allowlist (exact match or `PREFIX_*` glob)? */
export function isEnvKeyAllowed(key: string, allow: readonly string[]): boolean {
  for (const pattern of allow) {
    if (pattern.endsWith('*')) {
      if (key.startsWith(pattern.slice(0, -1))) return true
    } else if (key === pattern) {
      return true
    }
  }
  return false
}

/** Project `env` down to only the keys a feature declared. */
export function scopedEnv(env: Env, allow: readonly string[]): Env {
  const out: Env = {}
  for (const key of Object.keys(env)) {
    if (isEnvKeyAllowed(key, allow)) out[key] = env[key]
  }
  return out
}
