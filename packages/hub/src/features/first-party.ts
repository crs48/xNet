/**
 * @xnetjs/hub - First-party hub features (exploration 0189).
 *
 * The bundled integrations re-expressed as `HubFeature`s so they mount through
 * the feature registry instead of bespoke `app.route(...)` calls in `server.ts`.
 * Behaviour is identical to the previous hardcoded mounts — the only change is
 * that each feature now receives a broker-scoped env (e.g. billing can read
 * `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET`/`BTCPAY_*` but never
 * `HUB_GITHUB_WEBHOOK_SECRET`).
 *
 * Feature-specific services are closed over here; the shared deps come from the
 * registry.
 */

import type { HubFeature } from './types'
import type { TaskIdentifierService } from '../services/task-identifiers'
import { billingProviderFromEnv } from '@xnetjs/billing'
import { createBillingRoutes } from '../routes/billing'
import { createTaskRoutes } from '../routes/tasks'
import { createUnfurlRoutes } from '../routes/unfurl'
import { parsePricePlans } from '../services/billing-entitlements'
import { createBillingStore } from '../services/billing-store'
import {
  processGithubEvent,
  verifyWebhookSignature,
  type TaskAutomationAction
} from '../services/github-integration'

/** Billing (Stripe + Bitcoin) — opt-in via env; 503 when unconfigured (0187). */
export function billingFeature(): HubFeature {
  return {
    id: 'fyi.xnet.billing',
    // Every env key `billingProviderFromEnv` reads, plus the price→plan map for
    // the entitlements tie-in — and nothing else.
    secrets: [
      'XNET_BILLING_PROVIDER',
      'STRIPE_SECRET_KEY',
      'STRIPE_WEBHOOK_SECRET',
      'BTCPAY_*',
      'BILLING_FAKE_SECRET',
      'XNET_BILLING_PRICE_PLANS'
    ],
    mount({ app, env, requireAuth, storage, dataDir, appUrl }) {
      app.route(
        '/billing',
        createBillingRoutes({
          provider: billingProviderFromEnv(env),
          store: createBillingStore({ storage, dataDir }),
          requireAuth,
          appUrl,
          pricePlans: parsePricePlans(env.XNET_BILLING_PRICE_PLANS)
        })
      )
    }
  }
}

/**
 * Task short-ids (route) + the GitHub → Tasks webhook, now expressed as a
 * **declarative webhook** (exploration 0189 "v2" shape) rather than a hand-written
 * route. `applyAutomationActions` is optional — when provided, normalized actions
 * mutate the workspace's Task nodes.
 *
 * Production `server.ts` currently mounts this WITHOUT an apply callback: the
 * webhook verifies + normalizes deliveries into `TaskAutomationAction[]`, but
 * applying them to Task nodes needs server-authoritative node writes the hub does
 * not yet have, so the normalized actions are reported and discarded (same as the
 * previous hand-written route). The injection seam stays here so an authorized
 * caller — or a future hub system identity — can wire apply without re-plumbing.
 */
export function tasksFeature(
  identifiers: TaskIdentifierService,
  applyAutomationActions?: (actions: TaskAutomationAction[]) => Promise<void>
): HubFeature {
  return {
    id: 'fyi.xnet.github-tasks',
    secrets: ['HUB_GITHUB_WEBHOOK_SECRET'],
    webhooks: [
      {
        path: '/tasks/github/webhook',
        secretRef: 'HUB_GITHUB_WEBHOOK_SECRET',
        notConfiguredMessage: 'GitHub integration is not configured',
        verify: (rawBody, headers, secret) =>
          verifyWebhookSignature(secret, rawBody, headers['x-hub-signature-256']),
        normalize: (headers, payload) =>
          processGithubEvent(headers['x-github-event'] ?? '', payload),
        ...(applyAutomationActions
          ? {
              apply: (actions: unknown[]) =>
                applyAutomationActions(actions as TaskAutomationAction[])
            }
          : {})
      }
    ],
    mount({ app, requireAuth }) {
      app.use('/tasks/short-ids/*', requireAuth)
      app.route('/tasks', createTaskRoutes({ identifiers }))
    }
  }
}

/** Link unfurl + CDN image proxy used by the social/content enrichment path. */
export function unfurlFeature(userAgent: string): HubFeature {
  return {
    id: 'fyi.xnet.unfurl',
    mount({ app, requireAuth }) {
      app.route('/unfurl', createUnfurlRoutes({ requireAuth, userAgent }))
    }
  }
}
