export interface OfflineAuthPolicy {
  /** Cache TTL for can() decisions in eventual mode. Default: 5 minutes. */
  decisionCacheTTL: number

  /** Max staleness before operations must revalidate. Default: 1 hour. */
  maxStaleness: number

  /** Re-validation strategy used on reconnect. */
  revalidation: 'eager' | 'lazy' | 'hybrid'

  /** Allow grant/revoke writes while offline. */
  allowOfflineGrants: boolean
}

export const DEFAULT_OFFLINE_POLICY: OfflineAuthPolicy = {
  decisionCacheTTL: 5 * 60 * 1000,
  maxStaleness: 60 * 60 * 1000,
  revalidation: 'hybrid',
  allowOfflineGrants: true
}

export type RevocationConsistency = 'eventual' | 'strict'

export interface RevocationConfig {
  mode: RevocationConsistency
  maxStaleness: number
}

export function mergeOfflinePolicy(
  current: OfflineAuthPolicy,
  patch: Partial<OfflineAuthPolicy>
): OfflineAuthPolicy {
  return {
    ...current,
    ...patch
  }
}
