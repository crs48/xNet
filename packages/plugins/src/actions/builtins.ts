/**
 * @xnetjs/plugins — first-party outbound actions (exploration 0213).
 *
 * The Top-5/Top-10 notification sinks built on {@link defineAction}: Discord and
 * Slack incoming webhooks, Telegram bots, transactional email (Resend), and a
 * generic webhook-out that bridges Zapier/Make/n8n. Each reads its credential
 * from the broker-scoped env, renders the triggering event to a message, and
 * POSTs through the guarded, SSRF-checked fetch. Hosts are declared at build
 * time so egress stays closed-by-default; the generic webhook-out locks its
 * `network` grant to the configured URL's host.
 */

import type { ActionEvent, ActionTrigger, DefinedAction } from './define-action'
import type { FetchLike } from '../ecosystem/network-endowment'
import { ActionDispatchError } from './runner'
import { defineAction } from './define-action'

/** A compact, human-readable summary of the triggering event. */
export function renderEvent(event: ActionEvent): string {
  if (event.node) {
    const props = event.node.properties ?? {}
    const label = props.title ?? props.name ?? event.node.id
    return `${event.change ?? 'changed'} ${event.node.schemaId}: ${String(label)}`
  }
  return `xNet ${event.trigger} event`
}

interface BaseActionOptions {
  /** Override the connector-style id. */
  id?: string
  /** What fires the action (default: manual). */
  trigger?: ActionTrigger
  /** Render the event to a message (default {@link renderEvent}). */
  render?: (event: ActionEvent) => string
}

const DEFAULT_TRIGGER: ActionTrigger = { kind: 'manual' }

/** POST helper that surfaces an explicit non-ok response as a dispatch error. */
async function postJson(
  ctx: { fetch: FetchLike },
  url: string,
  body: unknown,
  headers: Record<string, string> = {}
): Promise<void> {
  const res = (await ctx.fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body)
  })) as { ok?: boolean; status?: number } | undefined
  if (res && res.ok === false) {
    throw new ActionDispatchError(`outbound POST to ${new URL(url).host} failed (${res.status})`)
  }
}

/** Discord: POST `{ content }` to an incoming-webhook URL (`DISCORD_WEBHOOK_URL`). */
export function buildDiscordAction(options: BaseActionOptions = {}): DefinedAction {
  const render = options.render ?? renderEvent
  return defineAction({
    id: options.id ?? 'dev.xnet.action.discord',
    name: 'Discord',
    description: 'Post a message to a Discord channel via an incoming webhook.',
    capabilities: { secrets: ['DISCORD_WEBHOOK_URL'], network: ['discord.com'] },
    trigger: options.trigger ?? DEFAULT_TRIGGER,
    async dispatch(event, ctx) {
      const url = ctx.env.DISCORD_WEBHOOK_URL
      if (!url) throw new ActionDispatchError('DISCORD_WEBHOOK_URL is not set')
      await postJson(ctx, url, { content: render(event) })
    }
  })
}

/** Slack: POST `{ text }` to an incoming-webhook URL (`SLACK_WEBHOOK_URL`). */
export function buildSlackWebhookAction(options: BaseActionOptions = {}): DefinedAction {
  const render = options.render ?? renderEvent
  return defineAction({
    id: options.id ?? 'dev.xnet.action.slack',
    name: 'Slack',
    description: 'Post a message to a Slack channel via an incoming webhook.',
    capabilities: { secrets: ['SLACK_WEBHOOK_URL'], network: ['hooks.slack.com'] },
    trigger: options.trigger ?? DEFAULT_TRIGGER,
    async dispatch(event, ctx) {
      const url = ctx.env.SLACK_WEBHOOK_URL
      if (!url) throw new ActionDispatchError('SLACK_WEBHOOK_URL is not set')
      await postJson(ctx, url, { text: render(event) })
    }
  })
}

/** Telegram: send a message via the Bot API (`TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID`). */
export function buildTelegramAction(options: BaseActionOptions = {}): DefinedAction {
  const render = options.render ?? renderEvent
  return defineAction({
    id: options.id ?? 'dev.xnet.action.telegram',
    name: 'Telegram',
    description: 'Send a message to a Telegram chat via a bot.',
    capabilities: {
      secrets: ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID'],
      network: ['api.telegram.org']
    },
    trigger: options.trigger ?? DEFAULT_TRIGGER,
    async dispatch(event, ctx) {
      const token = ctx.env.TELEGRAM_BOT_TOKEN
      const chatId = ctx.env.TELEGRAM_CHAT_ID
      if (!token || !chatId) {
        throw new ActionDispatchError('TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID must be set')
      }
      await postJson(ctx, `https://api.telegram.org/bot${token}/sendMessage`, {
        chat_id: chatId,
        text: render(event)
      })
    }
  })
}

export interface EmailActionOptions extends BaseActionOptions {
  /** Verified sender, e.g. `xNet <alerts@example.com>`. */
  from: string
  /** Recipient address(es). */
  to: string | string[]
  /** Subject line (default: a short event summary). */
  subject?: string
}

/** Email (Resend): send a transactional email (`RESEND_API_KEY`). */
export function buildEmailAction(options: EmailActionOptions): DefinedAction {
  const render = options.render ?? renderEvent
  return defineAction({
    id: options.id ?? 'dev.xnet.action.email',
    name: 'Email',
    description: 'Send a transactional email via Resend.',
    capabilities: { secrets: ['RESEND_API_KEY'], network: ['api.resend.com'] },
    trigger: options.trigger ?? DEFAULT_TRIGGER,
    async dispatch(event, ctx) {
      const key = ctx.env.RESEND_API_KEY
      if (!key) throw new ActionDispatchError('RESEND_API_KEY is not set')
      const text = render(event)
      await postJson(
        ctx,
        'https://api.resend.com/emails',
        {
          from: options.from,
          to: options.to,
          subject: options.subject ?? text.slice(0, 120),
          text
        },
        { authorization: `Bearer ${key}` }
      )
    }
  })
}

export interface WebhookOutOptions extends BaseActionOptions {
  /** The destination URL. Its host becomes the action's sole `network` grant. */
  url: string
  /** Transform the event into the POST body (default: the event itself). */
  transform?: (event: ActionEvent) => unknown
  /** Extra request headers. */
  headers?: Record<string, string>
}

/**
 * Generic webhook-out: POST each triggering event as JSON to a configured URL —
 * the escape hatch that bridges Zapier/Make/n8n/IFTTT. The `network` grant is
 * locked to the URL's host (and the SSRF guard still blocks internal targets).
 */
export function buildWebhookOutAction(options: WebhookOutOptions): DefinedAction {
  const host = new URL(options.url).host
  const transform = options.transform ?? ((event: ActionEvent) => event)
  return defineAction({
    id: options.id ?? 'dev.xnet.action.webhook',
    name: 'Outgoing webhook',
    description: 'POST xNet events as JSON to an external URL (Zapier/Make/n8n).',
    capabilities: { network: [host] },
    trigger: options.trigger ?? DEFAULT_TRIGGER,
    async dispatch(event, ctx) {
      await postJson(ctx, options.url, transform(event), options.headers ?? {})
    }
  })
}
