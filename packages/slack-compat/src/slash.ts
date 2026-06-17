/**
 * @xnetjs/slack-compat — slash-command parse/format (exploration 0198).
 *
 * Slack POSTs slash commands as `application/x-www-form-urlencoded`. This parses
 * that body (string or already-decoded record) into a camelCased
 * {@link SlackSlashCommand}, and formats the JSON reply.
 *
 * Compatibility note (mirrors Mattermost): Slack defaults an *omitted*
 * `response_type` to `ephemeral`, so a command built for Slack that relies on
 * that default still behaves; integrations that want a channel-visible reply set
 * `in_channel` explicitly.
 */

import type { SlackResponseType, SlackSlashCommand, SlackSlashResponse } from './types'

/** Read a value from either a URLSearchParams or a plain record. */
function field(source: URLSearchParams | Record<string, string>, key: string): string | undefined {
  const value = source instanceof URLSearchParams ? source.get(key) : source[key]
  return value ?? undefined
}

/** Parse a Slack slash-command body (urlencoded string or decoded record). */
export function parseSlashCommand(
  body: string | Record<string, string>
): SlackSlashCommand {
  const source = typeof body === 'string' ? new URLSearchParams(body) : body
  const command: SlackSlashCommand = {
    command: field(source, 'command') ?? '',
    text: field(source, 'text') ?? ''
  }
  const optional: Array<[keyof SlackSlashCommand, string]> = [
    ['token', 'token'],
    ['responseUrl', 'response_url'],
    ['triggerId', 'trigger_id'],
    ['userId', 'user_id'],
    ['userName', 'user_name'],
    ['channelId', 'channel_id'],
    ['channelName', 'channel_name'],
    ['teamId', 'team_id'],
    ['teamDomain', 'team_domain']
  ]
  for (const [prop, key] of optional) {
    const value = field(source, key)
    if (value !== undefined) command[prop] = value
  }
  return command
}

/** Build a Slack-shaped slash-command response (defaults to `ephemeral`). */
export function formatSlashResponse(options: {
  text: string
  responseType?: SlackResponseType
}): SlackSlashResponse {
  return {
    response_type: options.responseType ?? 'ephemeral',
    text: options.text
  }
}
