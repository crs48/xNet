/**
 * Hub write-rejection banners (exploration 0418).
 *
 * When a hub refuses a write it sends a machine-readable code. Without this
 * mapping the app shows whatever generic sync failure the transport produced,
 * which is actively misleading for the billing case: "sync error" reads as
 * *something is broken and your data may be at risk*, when the truth is
 * *everything is fine, a card expired, and nothing new is being saved to the
 * cloud until it is fixed*. Those need to feel completely different.
 *
 * Reuses `StorageBannerDescriptor` so these render through the same banner the
 * storage warnings already use — one place in the UI that means "your writes are
 * constrained, here is why", rather than a second competing surface.
 */

import type { StorageBannerDescriptor } from './storage-banner'

/**
 * Write-rejection codes a hub can send. Mirrors `NodeRelayError['code']` in
 * `@xnetjs/hub` plus the HTTP middleware's `billing_read_only`, which arrives
 * lower-cased in a JSON body rather than as a socket error.
 */
export type HubWriteRejection =
  | 'BILLING_READ_ONLY'
  | 'billing_read_only'
  | 'QUOTA_EXCEEDED'
  | 'STORAGE_FULL'

const BILLING_READ_ONLY: StorageBannerDescriptor = {
  tone: 'warning',
  title: 'Your hub is read-only — a payment needs attention',
  message:
    'Everything you have is safe and still readable, and the copy on this device is untouched. ' +
    'Your hub has paused new writes because a payment did not go through. Updating your billing ' +
    'details restores writes within the hour.',
  actionLabel: 'Manage billing',
  detailItems: [
    'Nothing has been deleted, and nothing will be without an email telling you first.',
    'Changes you make here stay on this device and sync as soon as writes resume.'
  ]
}

const QUOTA_EXCEEDED: StorageBannerDescriptor = {
  tone: 'warning',
  title: 'Your hub is full',
  message:
    'Your hub has reached its storage limit, so new changes are not syncing. Free up space or ' +
    'move to a larger plan and syncing resumes on its own.',
  actionLabel: 'Manage plan',
  detailItems: ['Your existing data is intact — only new writes are affected.']
}

const STORAGE_FULL: StorageBannerDescriptor = {
  tone: 'warning',
  title: 'Your hub is temporarily out of disk',
  message:
    'The hub is shedding new writes to avoid running out of disk entirely. This usually clears ' +
    'on its own; your changes are held on this device until it does.',
  detailItems: ['Nothing has been lost — writes are queued locally, not dropped.']
}

/**
 * Map a hub write-rejection code to a banner, or `null` for a code that is not a
 * user-actionable write rejection.
 *
 * Returning `null` for unknown codes is deliberate: inventing a friendly message
 * for a failure we do not understand is how a real bug gets rendered as a
 * reassurance. Unknown codes fall through to ordinary error handling.
 */
export function hubErrorBanner(
  code: string | undefined | null,
  links: { billingUrl?: string } = {}
): StorageBannerDescriptor | null {
  switch (code) {
    case 'BILLING_READ_ONLY':
    case 'billing_read_only':
      // The action is only offered when we actually know where to send them —
      // a button that goes nowhere is worse than no button.
      return links.billingUrl ? BILLING_READ_ONLY : { ...BILLING_READ_ONLY, actionLabel: undefined }
    case 'QUOTA_EXCEEDED':
      return links.billingUrl ? QUOTA_EXCEEDED : { ...QUOTA_EXCEEDED, actionLabel: undefined }
    case 'STORAGE_FULL':
      return STORAGE_FULL
    default:
      return null
  }
}

/** Does this code mean the hub is refusing writes for a *billing* reason? */
export function isBillingReadOnly(code: string | undefined | null): boolean {
  return code === 'BILLING_READ_ONLY' || code === 'billing_read_only'
}

/**
 * Pull a rejection code out of whatever the hub sent.
 *
 * The same condition arrives two ways — as a socket error object from the relay
 * and as a JSON body from the HTTP middleware — so callers should not have to
 * know which they are holding.
 */
export function rejectionCodeOf(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null
  const p = payload as { code?: unknown; error?: { code?: unknown } }
  if (typeof p.code === 'string') return p.code
  if (p.error && typeof p.error === 'object' && typeof p.error.code === 'string') {
    return p.error.code
  }
  return null
}
