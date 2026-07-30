/**
 * @xnetjs/slack-compat — Slack wire-protocol compatibility primitives.
 *
 * Pure, dependency-free helpers (node:crypto only) for making integrations
 * written against Slack work against xNet (exploration 0198):
 *
 *   - {@link slackMrkdwnToMarkdown} / {@link blockKitToMarkdown} — translate
 *     Slack's `mrkdwn` and Block Kit to the GitHub-flavored markdown that
 *     `ChatMessage.content` expects (best-effort, lossy by design);
 *   - {@link normalizeIncomingWebhook} — collapse a Slack incoming-webhook
 *     payload to a transport-agnostic message;
 *   - {@link parseSlashCommand} / {@link formatSlashResponse} — Slack-compatible
 *     slash-command request/response;
 *   - {@link verifySlackSignature} / {@link signSlackRequest} — signing-secret
 *     verification (and signing, for tests + outbound deliveries).
 */

export type {
  SlackTextObject,
  SlackContextElement,
  SlackBlock,
  SlackAttachmentField,
  SlackLegacyAttachment,
  SlackIncomingWebhookPayload,
  NormalizedSlackMessage,
  SlackSlashCommand,
  SlackResponseType,
  SlackSlashResponse
} from './types'

export {
  slackMrkdwnToMarkdown,
  replaceAngleTokens,
  convertInlineFormatting,
  unescapeSlackEntities
} from './mrkdwn'

export { blockKitToMarkdown, blockToMarkdown, renderTextObject } from './blocks'

export { normalizeIncomingWebhook, legacyAttachmentsToMarkdown } from './normalize'

export { parseSlashCommand, formatSlashResponse } from './slash'

export { verifySlackSignature, signSlackRequest, DEFAULT_TOLERANCE_SECONDS } from './signature'
