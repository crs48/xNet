/**
 * Local API port selection helpers.
 */

export const DEFAULT_LOCAL_API_PORT = 31415

function stableProfileOffset(profile: string): number {
  const numericSuffix = profile.match(/(\d+)$/)
  if (numericSuffix) {
    return Math.max(1, Number(numericSuffix[1]))
  }

  let hash = 0
  for (const char of profile) {
    hash = (hash * 31 + char.charCodeAt(0)) % 1000
  }

  return (hash % 100) + 1
}

export function resolveLocalAPIPort(
  profile = process.env.XNET_PROFILE || 'default',
  explicitPort = process.env.XNET_LOCAL_API_PORT
): number {
  if (explicitPort) {
    const parsed = Number(explicitPort)
    if (Number.isInteger(parsed) && parsed > 0 && parsed <= 65535) {
      return parsed
    }
  }

  if (profile === 'default') {
    return DEFAULT_LOCAL_API_PORT
  }

  return DEFAULT_LOCAL_API_PORT + stableProfileOffset(profile)
}
