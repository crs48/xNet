/**
 * Deprecation System
 *
 * Tracks deprecated protocols, schemas, and features to help developers
 * migrate away from outdated functionality before it's removed.
 *
 * @example
 * ```typescript
 * // Check for deprecation warnings
 * const warnings = checkDeprecations({
 *   protocolVersion: 0,
 *   schemas: ['xnet://xnet.fyi/Task@1.0.0'],
 *   features: ['legacy-auth']
 * })
 *
 * for (const warning of warnings) {
 *   console.warn(warning.message)
 * }
 * ```
 */

import type { FeatureFlag } from './features'

/**
 * Schema IRI type (mirrors @xnet/data to avoid circular dependency).
 * Format: xnet://namespace/Name@version
 */
type SchemaIRI = `xnet://${string}/${string}` | `xnet://${string}/${string}@${string}`

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Type of deprecated item.
 */
export type DeprecationType = 'protocol' | 'schema' | 'feature' | 'api'

/**
 * A deprecation notice for a protocol, schema, feature, or API.
 */
export interface DeprecationNotice {
  /** Type of deprecated item */
  type: DeprecationType
  /** Identifier of the deprecated item */
  subject: string
  /** Human-readable description */
  description: string
  /** Version where this was deprecated */
  deprecatedIn: string
  /** Version where this will be/was removed (if known) */
  removedIn?: string
  /** What to use instead */
  alternative?: string
  /** URL to migration documentation */
  migrationGuide?: string
  /** Date when deprecated */
  deprecatedDate?: string
  /** Date when removed/sunset (if known) */
  sunsetDate?: string
}

/**
 * Context for checking deprecations.
 */
export interface DeprecationContext {
  /** Current protocol version in use */
  protocolVersion?: number
  /** Schema IRIs currently in use */
  schemas?: (SchemaIRI | string)[]
  /** Features currently enabled */
  features?: (FeatureFlag | string)[]
  /** Package version */
  packageVersion?: string
}

/**
 * A deprecation warning generated from context.
 */
export interface DeprecationWarning {
  /** The deprecation notice that triggered this warning */
  notice: DeprecationNotice
  /** Human-readable warning message */
  message: string
  /** Recommended action to take */
  action: string
  /** Severity: 'warning' for deprecated, 'error' for removed */
  severity: 'warning' | 'error'
  /** Days until removal (if sunsetDate is known) */
  daysUntilRemoval?: number
}

/**
 * Callback for deprecation events.
 */
export type DeprecationCallback = (warning: DeprecationWarning) => void

// ─── Deprecation Registry ─────────────────────────────────────────────────────

/**
 * Registry of all known deprecations.
 *
 * Add new entries here when deprecating functionality.
 * This serves as both documentation and runtime checking.
 */
export const DEPRECATIONS: DeprecationNotice[] = [
  // Protocol deprecations
  {
    type: 'protocol',
    subject: 'Protocol v0 (unsigned changes)',
    description: 'Protocol v0 changes without signatures are deprecated',
    deprecatedIn: '0.5.0',
    removedIn: '1.0.0',
    alternative: 'Protocol v1 with signed changes',
    migrationGuide: '/docs/migrations/protocol-v0-to-v1',
    deprecatedDate: '2026-01-15'
  },
  {
    type: 'protocol',
    subject: 'Legacy Yjs updates',
    description: 'Unsigned Yjs updates are deprecated',
    deprecatedIn: '0.5.0',
    removedIn: '1.0.0',
    alternative: 'Signed Yjs envelopes',
    migrationGuide: '/docs/migrations/yjs-signed-envelopes'
  }

  // Schema deprecations (examples for future use)
  // {
  //   type: 'schema',
  //   subject: 'xnet://xnet.fyi/Task@1.0.0',
  //   description: 'Task v1.0.0 schema is deprecated',
  //   deprecatedIn: '0.6.0',
  //   alternative: 'xnet://xnet.fyi/Task@2.0.0',
  //   migrationGuide: '/docs/migrations/task-v1-to-v2'
  // },

  // Feature deprecations (examples for future use)
  // {
  //   type: 'feature',
  //   subject: 'legacy-auth',
  //   description: 'Legacy authentication method is deprecated',
  //   deprecatedIn: '0.7.0',
  //   removedIn: '1.0.0',
  //   alternative: 'did-auth',
  //   migrationGuide: '/docs/migrations/legacy-auth-to-did'
  // }
]

// ─── Deprecation Checking ─────────────────────────────────────────────────────

/**
 * Check for deprecation warnings based on current context.
 *
 * @param context - The current usage context to check
 * @returns Array of deprecation warnings
 *
 * @example
 * ```typescript
 * const warnings = checkDeprecations({
 *   protocolVersion: 0,
 *   schemas: ['xnet://xnet.fyi/Task@1.0.0']
 * })
 *
 * if (warnings.length > 0) {
 *   console.warn('Deprecation warnings:', warnings)
 * }
 * ```
 */
export function checkDeprecations(context: DeprecationContext): DeprecationWarning[] {
  const warnings: DeprecationWarning[] = []
  const now = new Date()

  for (const notice of DEPRECATIONS) {
    let triggered = false

    // Check protocol version
    if (notice.type === 'protocol') {
      if (notice.subject.includes('v0') && (context.protocolVersion ?? 0) < 1) {
        triggered = true
      }
      if (notice.subject.includes('Legacy Yjs') && (context.protocolVersion ?? 0) < 1) {
        triggered = true
      }
    }

    // Check schemas
    if (notice.type === 'schema' && context.schemas) {
      if (context.schemas.includes(notice.subject as SchemaIRI)) {
        triggered = true
      }
    }

    // Check features
    if (notice.type === 'feature' && context.features) {
      if (context.features.includes(notice.subject as FeatureFlag)) {
        triggered = true
      }
    }

    if (triggered) {
      const warning = createWarning(notice, now)
      warnings.push(warning)
    }
  }

  return warnings
}

/**
 * Create a deprecation warning from a notice.
 */
function createWarning(notice: DeprecationNotice, now: Date): DeprecationWarning {
  let daysUntilRemoval: number | undefined

  if (notice.sunsetDate) {
    const sunset = new Date(notice.sunsetDate)
    const diff = sunset.getTime() - now.getTime()
    daysUntilRemoval = Math.ceil(diff / (1000 * 60 * 60 * 24))
  }

  const isPastRemoval =
    notice.removedIn !== undefined && daysUntilRemoval !== undefined && daysUntilRemoval < 0

  const message = isPastRemoval
    ? `REMOVED: ${notice.subject} was removed in v${notice.removedIn}.`
    : `DEPRECATED: ${notice.subject} is deprecated since v${notice.deprecatedIn}.`

  let action = ''
  if (notice.alternative) {
    action = `Migrate to ${notice.alternative}.`
  }
  if (notice.removedIn && !isPastRemoval) {
    action += ` Will be removed in v${notice.removedIn}.`
  }
  if (notice.migrationGuide) {
    action += ` See ${notice.migrationGuide}`
  }

  return {
    notice,
    message,
    action: action.trim(),
    severity: isPastRemoval ? 'error' : 'warning',
    daysUntilRemoval:
      daysUntilRemoval !== undefined && daysUntilRemoval >= 0 ? daysUntilRemoval : undefined
  }
}

// ─── Deprecation Policy ───────────────────────────────────────────────────────

/**
 * Default deprecation policy.
 *
 * - Minimum deprecation period: 6 months
 * - Breaking changes require major version bump
 * - Warnings logged to console in development
 * - Errors thrown in strict mode for removed functionality
 */
export const DEPRECATION_POLICY = {
  /** Minimum time between deprecation and removal */
  minimumDeprecationPeriodDays: 180,

  /** Whether to log warnings to console */
  logWarnings: true,

  /** Whether to throw errors for removed functionality */
  strictMode: false,

  /** Console logger for warnings */
  logger: console.warn as (message: string) => void
}

/**
 * Configure the deprecation policy.
 */
export function configureDeprecationPolicy(options: Partial<typeof DEPRECATION_POLICY>): void {
  Object.assign(DEPRECATION_POLICY, options)
}

// ─── Deprecation Logging ──────────────────────────────────────────────────────

/** Set of already-logged deprecations to avoid spam */
const loggedDeprecations = new Set<string>()

/**
 * Log a deprecation warning (once per session).
 *
 * @param warning - The deprecation warning to log
 */
export function logDeprecation(warning: DeprecationWarning): void {
  if (!DEPRECATION_POLICY.logWarnings) return

  const key = `${warning.notice.type}:${warning.notice.subject}`
  if (loggedDeprecations.has(key)) return

  loggedDeprecations.add(key)

  const prefix = warning.severity === 'error' ? '[REMOVED]' : '[DEPRECATED]'
  DEPRECATION_POLICY.logger(`${prefix} ${warning.message} ${warning.action}`)
}

/**
 * Check and log deprecation warnings for a context.
 *
 * @param context - The current usage context
 * @returns Array of warnings (also logs them)
 */
export function checkAndLogDeprecations(context: DeprecationContext): DeprecationWarning[] {
  const warnings = checkDeprecations(context)

  for (const warning of warnings) {
    logDeprecation(warning)

    if (DEPRECATION_POLICY.strictMode && warning.severity === 'error') {
      throw new DeprecationError(warning)
    }
  }

  return warnings
}

/**
 * Clear the logged deprecations set (for testing).
 */
export function clearLoggedDeprecations(): void {
  loggedDeprecations.clear()
}

// ─── Deprecation Helpers ──────────────────────────────────────────────────────

/**
 * Get all deprecation notices of a specific type.
 */
export function getDeprecationsByType(type: DeprecationType): DeprecationNotice[] {
  return DEPRECATIONS.filter((d) => d.type === type)
}

/**
 * Get a specific deprecation notice by subject.
 */
export function getDeprecation(subject: string): DeprecationNotice | undefined {
  return DEPRECATIONS.find((d) => d.subject === subject)
}

/**
 * Check if a specific item is deprecated.
 */
export function isDeprecated(subject: string): boolean {
  return DEPRECATIONS.some((d) => d.subject === subject)
}

/**
 * Check if a specific item has been removed.
 */
export function isRemoved(subject: string): boolean {
  const notice = getDeprecation(subject)
  if (!notice?.removedIn) return false

  // Compare versions - simple check for now
  // In production, use proper semver comparison
  return true // Assume removed if removedIn is set
}

/**
 * Register a new deprecation notice.
 * Useful for applications to add their own deprecations.
 */
export function registerDeprecation(notice: DeprecationNotice): void {
  // Avoid duplicates
  const existing = DEPRECATIONS.findIndex((d) => d.subject === notice.subject)
  if (existing >= 0) {
    DEPRECATIONS[existing] = notice
  } else {
    DEPRECATIONS.push(notice)
  }
}

// ─── Deprecation Error ────────────────────────────────────────────────────────

/**
 * Error thrown when using removed functionality in strict mode.
 */
export class DeprecationError extends Error {
  constructor(public readonly warning: DeprecationWarning) {
    super(`${warning.message} ${warning.action}`)
    this.name = 'DeprecationError'
  }
}

// ─── Format Helpers ───────────────────────────────────────────────────────────

/**
 * Format deprecation warnings as a human-readable report.
 */
export function formatDeprecationReport(warnings: DeprecationWarning[]): string {
  if (warnings.length === 0) {
    return 'No deprecation warnings.'
  }

  const lines: string[] = ['Deprecation Report', '==================', '']

  const errors = warnings.filter((w) => w.severity === 'error')
  const warns = warnings.filter((w) => w.severity === 'warning')

  if (errors.length > 0) {
    lines.push('REMOVED (require immediate action):')
    for (const w of errors) {
      lines.push(`  - ${w.notice.subject}`)
      lines.push(`    ${w.action}`)
    }
    lines.push('')
  }

  if (warns.length > 0) {
    lines.push('DEPRECATED (plan to migrate):')
    for (const w of warns) {
      lines.push(`  - ${w.notice.subject}`)
      lines.push(`    ${w.action}`)
      if (w.daysUntilRemoval !== undefined) {
        lines.push(`    ${w.daysUntilRemoval} days until removal`)
      }
    }
    lines.push('')
  }

  return lines.join('\n')
}
