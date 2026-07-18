/**
 * @xnetjs/hub — first-party webhook deliver sink (0346, closing the 0213
 * seam).
 *
 * Until now every inbound integration deferred the same callback: the
 * webhook inbox's `deliver` and the declarative webhooks' `apply` were
 * injected seams nobody wired, so normalized deliveries were reported
 * and DISCARDED. This module provides the standard materialization over
 * a minimal injected node-writer port: deliveries become `ExternalItem`
 * nodes, space-stamped from the route, provenance-tagged, and — the
 * frame-aware part (0346) — optionally addressed at a target page via
 * `frameTarget`, so clients can ensure a live frame surfaces the feed
 * where people already look.
 */

import type { IntegrationWebhookAction } from './webhook-integrations'
import type { WebhookInboxDelivery, WebhookInboxPorts } from './webhook-inbox'

/** Minimal server-side node writer the app injects (store or relay). */
export interface WebhookNodeWriter {
  create(options: {
    schemaId: string
    properties: Record<string, unknown>
  }): Promise<{ id: string }>
}

export const EXTERNAL_ITEM_SCHEMA = 'xnet://xnet.fyi/ExternalItem@1.0.0'

/** Cap stored payloads so a hostile sender can't bloat the node log. */
const MAX_PAYLOAD_CHARS = 16_384

export interface FrameAwareDeliverOptions {
  writer: WebhookNodeWriter
  /**
   * Page id deliveries should surface on: stamped as `frameTarget` on
   * every materialized node so clients ensure a frame for the feed.
   */
  frameTargetPage?: string
  nowMs?: () => number
}

function payloadTitle(payload: unknown): string {
  if (typeof payload === 'object' && payload !== null) {
    const record = payload as Record<string, unknown>
    for (const key of ['title', 'summary', 'subject', 'name', 'event', 'action', 'type']) {
      const value = record[key]
      if (typeof value === 'string' && value.trim()) return value.slice(0, 200)
    }
  }
  return 'Webhook delivery'
}

function boundedJson(payload: unknown): string {
  try {
    const text = JSON.stringify(payload)
    return text.length > MAX_PAYLOAD_CHARS ? `${text.slice(0, MAX_PAYLOAD_CHARS)}…` : text
  } catch {
    return '"[unserializable payload]"'
  }
}

/**
 * The standard inbox sink: delivery → one `ExternalItem` node. Wire it
 * as `webhookInboxFeature({ resolveToken, deliver })`.
 */
export function createFrameAwareDeliver(
  options: FrameAwareDeliverOptions
): WebhookInboxPorts['deliver'] {
  const now = options.nowMs ?? Date.now
  return async (delivery: WebhookInboxDelivery) => {
    await options.writer.create({
      schemaId: delivery.route.schema ?? EXTERNAL_ITEM_SCHEMA,
      properties: {
        space: delivery.route.space,
        source: 'webhook',
        kind: delivery.route.label ?? 'inbox',
        externalId: `${delivery.token}:${now()}`,
        title: payloadTitle(delivery.payload),
        payload: boundedJson(delivery.payload),
        receivedAt: now(),
        ...(options.frameTargetPage ? { frameTarget: options.frameTargetPage } : {})
      }
    })
  }
}

/**
 * The standard apply for signed integration webhooks (Stripe / Sentry /
 * PagerDuty / GitHub): each normalized action → one `ExternalItem`.
 */
export function createIntegrationApply(
  options: FrameAwareDeliverOptions & { space: string }
): (actions: IntegrationWebhookAction[]) => Promise<void> {
  const now = options.nowMs ?? Date.now
  return async (actions) => {
    for (const action of actions) {
      await options.writer.create({
        schemaId: EXTERNAL_ITEM_SCHEMA,
        properties: {
          space: options.space,
          source: action.source,
          kind: action.kind,
          externalId: action.externalId,
          title: action.title,
          ...(action.url ? { url: action.url } : {}),
          ...(action.status ? { status: action.status } : {}),
          receivedAt: now(),
          ...(options.frameTargetPage ? { frameTarget: options.frameTargetPage } : {})
        }
      })
    }
  }
}
