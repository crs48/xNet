/**
 * @xnetjs/hub — Slack compatibility feature (exploration 0198, Tiers 0 + 1).
 *
 * Lets integrations written against Slack reach an xNet workspace unchanged:
 *
 *   - **Tier 0 — Incoming Webhooks.** `POST /slack/services/hooks/:token`
 *     accepts a Slack incoming-webhook payload (`text`/`blocks`/`attachments`),
 *     authenticated by the URL token (as Slack does — no body signature), and
 *     hands the normalized markdown message to an injected delivery sink.
 *   - **Tier 1 — Slash commands.** `POST /slack/commands` verifies the Slack
 *     signing secret (`x-slack-signature`, replay-protected), parses the
 *     Slack-format form body, and returns a Slack-shaped response.
 *
 * Like `connectorSyncFeature` and the GitHub→Tasks webhook (see
 * `first-party.ts`), this feature is **generic over an injected sink**: the hub
 * has no server-authoritative node writes yet, so an app wires `deliverMessage`
 * to materialize a `ChatMessage`. The Slack-specific parsing/verification lives
 * here (via `@xnetjs/slack-compat`); the write is the same deferred seam the
 * connectors carry.
 */

import type { HubFeature } from './types'
import type {
  NormalizedSlackMessage,
  SlackSlashCommand,
  SlackSlashResponse
} from '@xnetjs/slack-compat'
import {
  formatSlashResponse,
  normalizeIncomingWebhook,
  parseSlashCommand,
  verifySlackSignature
} from '@xnetjs/slack-compat'
import { Hono } from 'hono'
import { isRecord } from '../utils/validation'

/** A normalized incoming-webhook message plus the URL token it arrived on. */
export type SlackDelivery = NormalizedSlackMessage & { token: string }

export interface SlackCompatPorts {
  /**
   * Validate an incoming-webhook URL token. Return a routing context (an
   * optional default `channelHint`) for a known token, or `null` to 404 an
   * unknown one. The token is the credential — treat it like a webhook secret.
   */
  resolveHookToken: (
    token: string
  ) => Promise<{ channelHint?: string } | null> | { channelHint?: string } | null
  /** Deliver a normalized message (e.g. materialize a ChatMessage). */
  deliverMessage: (delivery: SlackDelivery) => Promise<void>
  /** Handle a slash command and return its Slack-shaped response. Optional. */
  handleCommand?: (command: SlackSlashCommand) => Promise<SlackSlashResponse> | SlackSlashResponse
}

const ENV_SIGNING_SECRET = 'SLACK_SIGNING_SECRET'

/** Build the Slack-compatibility `HubFeature` (Tier 0 incoming webhooks + Tier 1 commands). */
export function slackCompatFeature(ports: SlackCompatPorts): HubFeature {
  return {
    id: 'fyi.xnet.slack-compat',
    secrets: [ENV_SIGNING_SECRET],
    mount({ app, env }) {
      const routes = new Hono()

      // Tier 0 — Incoming webhook. Token in the path is the credential.
      routes.post('/services/hooks/:token', async (c) => {
        const token = c.req.param('token')
        const context = await ports.resolveHookToken(token)
        if (!context) return c.json({ error: 'Unknown webhook', code: 'UNKNOWN_HOOK' }, 404)

        const body: unknown = await c.req.json().catch(() => null)
        if (!isRecord(body))
          return c.json({ error: 'Invalid JSON payload', code: 'INVALID_INPUT' }, 400)

        const normalized = normalizeIncomingWebhook(body)
        if (!normalized.channelHint && context.channelHint) {
          normalized.channelHint = context.channelHint
        }
        await ports.deliverMessage({ ...normalized, token })
        // Slack incoming webhooks reply with the literal text "ok".
        return c.text('ok')
      })

      // Tier 1 — Slash commands. Signed with the app signing secret.
      routes.post('/commands', async (c) => {
        const secret = env[ENV_SIGNING_SECRET]
        if (!secret) {
          return c.json(
            { error: 'Slack signing secret is not configured', code: 'NOT_CONFIGURED' },
            503
          )
        }
        const rawBody = await c.req.text()
        const ok = await verifySlackSignature({
          signingSecret: secret,
          timestamp: c.req.header('x-slack-request-timestamp'),
          signature: c.req.header('x-slack-signature'),
          rawBody
        })
        if (!ok)
          return c.json({ error: 'Invalid request signature', code: 'INVALID_SIGNATURE' }, 401)

        const command = parseSlashCommand(rawBody)
        if (!ports.handleCommand) {
          return c.json(
            formatSlashResponse({ text: `\`${command.command}\` is not handled here.` })
          )
        }
        return c.json(await ports.handleCommand(command))
      })

      app.route('/slack', routes)
    }
  }
}
