/**
 * @xnetjs/slack-compat — Slack wire-protocol types (exploration 0198).
 *
 * Just the slices of Slack's payloads the compatibility layer reads. These are
 * intentionally permissive (extra keys allowed) — Slack and the third-party
 * integrations that target it send far more than we render, and we degrade
 * gracefully rather than reject unknown shapes.
 */

/** A Slack text object (`plain_text` or `mrkdwn`). */
export interface SlackTextObject {
  type: 'plain_text' | 'mrkdwn'
  text: string
  emoji?: boolean
}

/** An element inside a `context` block (text object or image). */
export interface SlackContextElement {
  type: string
  text?: string
  [key: string]: unknown
}

/** A Block Kit block. Only the fields we render are typed; the rest pass through. */
export interface SlackBlock {
  type: string
  text?: SlackTextObject
  fields?: SlackTextObject[]
  elements?: SlackContextElement[]
  [key: string]: unknown
}

/** A field within a legacy message attachment. */
export interface SlackAttachmentField {
  title?: string
  value?: string
  short?: boolean
}

/** A legacy (pre-Block-Kit) message attachment. */
export interface SlackLegacyAttachment {
  fallback?: string
  pretext?: string
  title?: string
  text?: string
  fields?: SlackAttachmentField[]
  [key: string]: unknown
}

/** The body an integration POSTs to a Slack incoming webhook. */
export interface SlackIncomingWebhookPayload {
  text?: string
  blocks?: SlackBlock[]
  attachments?: SlackLegacyAttachment[]
  channel?: string
  username?: string
  icon_emoji?: string
  icon_url?: string
  [key: string]: unknown
}

/** A normalized, transport-agnostic message ready to become a ChatMessage. */
export interface NormalizedSlackMessage {
  /** Rendered GitHub-flavored markdown body. */
  content: string
  /** The channel name/id the payload targeted, if any (`channel` field). */
  channelHint?: string
  /** Display name override the payload requested. */
  username?: string
  /** Emoji avatar override the payload requested (e.g. `:rocket:`). */
  iconEmoji?: string
}

/** A parsed Slack slash-command invocation (camelCased from the form body). */
export interface SlackSlashCommand {
  token?: string
  command: string
  text: string
  responseUrl?: string
  triggerId?: string
  userId?: string
  userName?: string
  channelId?: string
  channelName?: string
  teamId?: string
  teamDomain?: string
}

/** Whether a slash-command response is visible to the channel or only the caller. */
export type SlackResponseType = 'in_channel' | 'ephemeral'

/** The JSON body returned to Slack (or a Slack-compatible client) for a command. */
export interface SlackSlashResponse {
  response_type: SlackResponseType
  text: string
  [key: string]: unknown
}
