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
