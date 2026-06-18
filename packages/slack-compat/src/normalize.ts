/**
 * @xnetjs/slack-compat — incoming-webhook normalization (exploration 0198).
 *
 * Collapses the three ways a Slack incoming-webhook payload can carry content
 * (Block Kit `blocks`, legacy `attachments`, or plain `text`) into one
 * transport-agnostic {@link NormalizedSlackMessage}. Preference order matches
 * Slack's own rendering precedence: blocks win, then attachments, then text.
 */

import type {
  NormalizedSlackMessage,
  SlackIncomingWebhookPayload,
  SlackLegacyAttachment
} from './types'
import { blockKitToMarkdown } from './blocks'
import { slackMrkdwnToMarkdown } from './mrkdwn'

/** Render one legacy attachment's textual parts top-to-bottom. */
function attachmentToMarkdown(attachment: SlackLegacyAttachment): string {
  const parts: string[] = []
  if (attachment.pretext) parts.push(slackMrkdwnToMarkdown(attachment.pretext))
  if (attachment.title) parts.push(`**${attachment.title}**`)
  if (attachment.text) parts.push(slackMrkdwnToMarkdown(attachment.text))
  for (const field of attachment.fields ?? []) {
    const title = field.title ? `**${field.title}**: ` : ''
    if (field.value) parts.push(`${title}${slackMrkdwnToMarkdown(field.value)}`)
  }
  // Nothing structured rendered — fall back to the plain-text fallback.
  if (parts.length === 0 && attachment.fallback) parts.push(attachment.fallback)
  return parts.join('\n')
}

/** Render a legacy `attachments` array, or `undefined` if it produced nothing. */
export function legacyAttachmentsToMarkdown(
  attachments: SlackLegacyAttachment[] | undefined
): string | undefined {
  if (!attachments || attachments.length === 0) return undefined
  const rendered = attachments.map(attachmentToMarkdown).filter(Boolean)
  return rendered.length ? rendered.join('\n\n') : undefined
}

/**
 * Normalize a Slack incoming-webhook payload into a {@link NormalizedSlackMessage}.
 * `content` is rendered from blocks → attachments → text (Slack's own order);
 * the channel/username/icon hints pass through for the delivery layer to honour.
 */
export function normalizeIncomingWebhook(
  payload: SlackIncomingWebhookPayload
): NormalizedSlackMessage {
  const content =
    blockKitToMarkdown(payload.blocks) ??
    legacyAttachmentsToMarkdown(payload.attachments) ??
    slackMrkdwnToMarkdown(payload.text ?? '')

  const message: NormalizedSlackMessage = { content }
  if (payload.channel) message.channelHint = payload.channel
  if (payload.username) message.username = payload.username
  if (payload.icon_emoji) message.iconEmoji = payload.icon_emoji
  return message
}
