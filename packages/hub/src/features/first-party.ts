/**
 * @xnetjs/hub - First-party hub features (exploration 0189).
 *
 * The bundled integrations re-expressed as `HubFeature`s so they mount through
 * the feature registry instead of bespoke `app.route(...)` calls in `server.ts`.
 * Behaviour is identical to the previous hardcoded mounts — the only change is
 * that each feature now receives a broker-scoped env (e.g. billing can read
 * `STRIPE_*`/`BTCPAY_*` but never `HUB_GITHUB_WEBHOOK_SECRET`).
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
import { createBillingStore } from '../services/billing-store'

/** Billing (Stripe + Bitcoin) — opt-in via env; 503 when unconfigured (0187). */
export function billingFeature(): HubFeature {
  return {
    id: 'fyi.xnet.billing',
    // Every env key `billingProviderFromEnv` reads — and nothing else.
    secrets: [
      'XNET_BILLING_PROVIDER',
      'STRIPE_SECRET_KEY',
      'STRIPE_WEBHOOK_SECRET',
      'BTCPAY_*',
      'BILLING_FAKE_SECRET'
    ],
    mount({ app, env, requireAuth, storage, dataDir, appUrl }) {
      app.route(
        '/billing',
        createBillingRoutes({
          provider: billingProviderFromEnv(env),
          store: createBillingStore({ storage, dataDir }),
          requireAuth,
          appUrl
        })
      )
    }
  }
}

/** Task short-ids + the GitHub → Tasks webhook (0006/0187). */
export function tasksFeature(identifiers: TaskIdentifierService): HubFeature {
  return {
    id: 'fyi.xnet.github-tasks',
    secrets: ['HUB_GITHUB_WEBHOOK_SECRET'],
    mount({ app, env, requireAuth }) {
      app.use('/tasks/short-ids/*', requireAuth)
      app.route(
        '/tasks',
        createTaskRoutes({
          identifiers,
          githubWebhookSecret: env.HUB_GITHUB_WEBHOOK_SECRET
        })
      )
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
