/**
 * Telemetry consent types - progressive opt-in tiers.
 */

/** Progressive consent tiers (each tier includes all previous) */
export type TelemetryTier =
  | 'off' // No collection
  | 'local' // Local storage only
  | 'crashes' // + crash reports shared
  | 'anonymous' // + anonymous usage metrics
  | 'identified' // + stable identifier (beta testers)

/** Map tier to numeric level for comparison */
const TIER_LEVELS: Record<TelemetryTier, number> = {
  off: 0,
  local: 1,
  crashes: 2,
  anonymous: 3,
  identified: 4
}

/** Get the numeric level of a tier */
export function tierLevel(tier: TelemetryTier): number {
  return TIER_LEVELS[tier]
}

/** Check if a tier meets or exceeds a required tier */
export function tierMeetsRequirement(
  currentTier: TelemetryTier,
  requiredTier: TelemetryTier
): boolean {
  return tierLevel(currentTier) >= tierLevel(requiredTier)
}

/** User's telemetry consent preferences */
export interface TelemetryConsent {
  /** Current consent tier */
  tier: TelemetryTier
  /** Whether user wants to review data before sharing */
  reviewBeforeSend: boolean
  /** Whether to automatically scrub PII */
  autoScrub: boolean
  /** Specific schemas the user has enabled (empty = all allowed by tier) */
  enabledSchemas: string[]
  /** When consent was granted */
  grantedAt: Date
  /** Optional expiry (consent must be re-confirmed) */
  expiresAt?: Date
}

/** Default consent - everything off, privacy-first */
export const DEFAULT_CONSENT: TelemetryConsent = {
  tier: 'off',
  reviewBeforeSend: true,
  autoScrub: true,
  enabledSchemas: [],
  grantedAt: new Date(0)
}
