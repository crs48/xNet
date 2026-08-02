/**
 * xNet Cloud — public status (the `/status` page).
 *
 * The control plane serves a public, aggregate-only `GET /status.json` (built by
 * `apps/cloud/src/observability/status.ts`). This page fetches it live and falls
 * back to the committed snapshot below when the control plane is unreachable —
 * so the status page is never blank, even during an outage. The `PublicStatus`
 * shape mirrors the control plane; the JSON is the contract (the static site
 * never imports the cloud package — see scripts/check-cloud-boundary.sh).
 *
 * See exploration 0201.
 */

import raw from './status.json'

export type ComponentStatus = 'operational' | 'degraded' | 'down' | 'not-configured'

interface StatusComponent {
  id: string
  status: ComponentStatus
  /** Rolling availability fraction (0..1), or null when suppressed / not applicable. */
  availability?: number | null
}

interface PublicStatus {
  updatedMs: number
  overall: ComponentStatus
  components: StatusComponent[]
  errorBudgetPolicy: { ship: number; caution: number; freeze: number }
}

/** Committed fallback snapshot, rendered server-side before the live fetch. */
export const fallback = raw as PublicStatus

/** Where the page fetches live status; falls back to {@link fallback} on failure. */
export const STATUS_URL = 'https://cloud.xnet.fyi/status.json'

export const COMPONENT_LABELS: Record<string, string> = {
  'control-plane': 'Control plane',
  'hub-fleet': 'Hub fleet',
  'ai-gateway': 'Managed AI gateway',
  backups: 'Backups (Litestream → R2)'
}

/**
 * What each component means in plain language — the status page is read by
 * people deciding whether to trust us, not only by people already paged.
 */
export const COMPONENT_BLURBS: Record<string, string> = {
  'control-plane': 'Sign-in, billing, and provisioning.',
  'hub-fleet': 'The hubs that sync your data. Your app keeps working offline when this is degraded.',
  'ai-gateway': 'The managed AI gateway. Off until you use it.',
  backups:
    'Continuous replication of hub databases to object storage. Freshness is measured, not assumed.'
}

/**
 * The objective each tier is held to, for the status page's SLO table
 * (exploration 0425). Derived from the generated durability mirror so a
 * published figure here can never drift from the plan catalog.
 */
export { DURABILITY, type SitePlanId } from './durability'

/** Tiers shown on the status page's objective table, cheapest → richest. */
export const STATUS_TIERS: { id: 'demo' | 'personal' | 'family' | 'team' | 'enterprise'; name: string }[] =
  [
    { id: 'demo', name: 'Free' },
    { id: 'personal', name: 'Personal' },
    { id: 'family', name: 'Family' },
    { id: 'team', name: 'Team' },
    { id: 'enterprise', name: 'Enterprise' }
  ]

export const STATUS_LABELS: Record<ComponentStatus, string> = {
  operational: 'Operational',
  degraded: 'Degraded',
  down: 'Down',
  'not-configured': 'Not configured'
}

export const STATUS_COLORS: Record<ComponentStatus, string> = {
  operational: '#10b981',
  degraded: '#f59e0b',
  down: '#ef4444',
  'not-configured': '#9ca3af'
}
