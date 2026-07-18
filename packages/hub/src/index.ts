/**
 * @xnetjs/hub - Hub entry point.
 */

import type { HubConfig, HubInstance } from './types'
import { mkdirSync } from 'fs'
import { getDemoOverrides } from './config'
import { createServer } from './server'
import { DEFAULT_CONFIG } from './types'
export { resolveConfig } from './config'

export type { HubConfig, HubInstance, DemoOverrides } from './types'
export { DEMO_DEFAULTS } from './types'
export { getDemoOverrides } from './config'
export type {
  YjsEnvelopeV2Verifier,
  YjsEnvelopeV2VerifierContext,
  YjsEnvelopeV2VerifierResult
} from './services/relay'
export { EvictionService, type EvictionStorage } from './services/eviction'
export {
  HUB_ACTION_MAP,
  verifyHubCapability,
  type HubAction,
  type HubCapability
} from './auth/capabilities'
export { createHubAuthError, type HubAuthError, type HubAuthErrorCode } from './auth/errors'

// Inbound webhooks (0213/0346): the inbox feature plus the first-party
// deliver/apply sinks that close the "normalized then discarded" seam.
export {
  webhookInboxFeature,
  WEBHOOK_INBOX_FEATURE_ID,
  type WebhookInboxDelivery,
  type WebhookInboxPorts,
  type WebhookInboxRoute
} from './features/webhook-inbox'
export {
  createFrameAwareDeliver,
  createIntegrationApply,
  EXTERNAL_ITEM_SCHEMA,
  type FrameAwareDeliverOptions,
  type WebhookNodeWriter
} from './features/webhook-deliver'

/**
 * Create an xNet Hub instance.
 *
 * @example
 * ```typescript
 * const hub = await createHub({ port: 4444 })
 * await hub.start()
 * ```
 */
export const createHub = async (config: Partial<HubConfig> = {}): Promise<HubInstance> => {
  const resolved: HubConfig = { ...DEFAULT_CONFIG, ...config }

  // `demo: true` must always carry enforceable limits: the CLI path resolves
  // demoOverrides from env, but a programmatic `createHub({ demo: true })`
  // used to leave them undefined — and every demo guardrail silently no-op'd
  // (exploration 0291). Env vars still override the defaults here.
  if (resolved.demo && !resolved.demoOverrides) {
    resolved.demoOverrides = getDemoOverrides(true) ?? undefined
  }

  mkdirSync(resolved.dataDir, { recursive: true })

  return createServer(resolved)
}
