/**
 * @xnetjs/plugins — the Slack migration connector (exploration 0198).
 *
 * "Switch from Slack to xNet and bring my data with me." This is the Half-1
 * answer from exploration 0198: a {@link defineConnector} that pulls a Slack
 * workspace's channels and message history into xNet's native `Channel` and
 * `ChatMessage` nodes, through the guarded connector store (egress-contained to
 * `slack.com`, space-stamped, budget-charged). The Slack token lives in the hub
 * broker and never reaches the agent — it only ever sees the synced nodes.
 *
 * Message bodies are translated to GitHub-flavored markdown via
 * `@xnetjs/slack-compat` (Block Kit first, then `mrkdwn`), so they render
 * natively in xNet chat. Pagination, DMs, files and reactions are deferred (see
 * the exploration's checklist).
 */

import type { AgentToolContribution } from '../agent-tools'
import type { ConnectorSyncContext, DefinedConnector } from './define-connector'
import type { SlackBlock } from '@xnetjs/slack-compat'
import { blockKitToMarkdown, slackMrkdwnToMarkdown } from '@xnetjs/slack-compat'
import { defineConnector } from './define-connector'

/** Default reverse-domain id; matches the worked example in the connector docs. */
export const SLACK_CONNECTOR_ID = 'dev.xnet.connector.slack'

export const CHANNEL_SCHEMA = 'xnet://xnet.fyi/Channel@1.0.0'
export const CHAT_MESSAGE_SCHEMA = 'xnet://xnet.fyi/ChatMessage@1.0.0'

/** Slack `conversations.list` channel (only the fields we map). */
interface SlackApiChannel {
  id: string
  name?: string
  topic?: { value?: string }
}

/** Slack `conversations.history` message (only the fields we map). */
interface SlackApiMessage {
  text?: string
  blocks?: SlackBlock[]
  subtype?: string
}

export interface SlackConnectorOptions {
  /** Override the connector id (default {@link SLACK_CONNECTOR_ID}). */
  id?: string
  /**
   * Backing for the `slack_search_messages` agent tool. When provided, the
   * connector contributes a model-facing search over the imported messages;
   * when omitted, no agent tool is contributed (pull-only migration).
   */
  search?: (args: { query: string }) => unknown | Promise<unknown>
}

/** Read a value that may be a `fetch` Response or an already-parsed object. */
async function asJson<T>(value: unknown): Promise<T> {
  if (value && typeof (value as { json?: unknown }).json === 'function') {
    return (await (value as { json: () => Promise<T> }).json()) as T
  }
  return value as T
}

/** Render a Slack history message to markdown (Block Kit first, then mrkdwn). */
function messageContent(message: SlackApiMessage): string {
  return blockKitToMarkdown(message.blocks) ?? slackMrkdwnToMarkdown(message.text ?? '')
}

/** Import one channel and its history; returns the number of nodes written. */
async function syncChannel(ctx: ConnectorSyncContext, channel: SlackApiChannel): Promise<number> {
  const node = await ctx.store.create({
    schemaId: CHANNEL_SCHEMA,
    properties: {
      name: channel.name ?? channel.id,
      kind: 'channel',
      topic: channel.topic?.value ?? ''
    }
  })
  let written = 1

  const history = await asJson<{ messages?: SlackApiMessage[] }>(
    await ctx.fetch({
      url: `https://slack.com/api/conversations.history?channel=${encodeURIComponent(channel.id)}`
    })
  )
  // Slack returns newest-first; reverse so xNet keeps chronological order.
  for (const message of (history.messages ?? []).slice().reverse()) {
    if (message.subtype) continue // skip joins/leaves/system messages
    const content = messageContent(message)
    if (!content) continue
    await ctx.store.create({
      schemaId: CHAT_MESSAGE_SCHEMA,
      properties: { channel: node.id, content }
    })
    written++
  }
  return written
}

/** The agent tool exposed when a search backing is supplied. */
function searchTool(
  id: string,
  search: NonNullable<SlackConnectorOptions['search']>
): AgentToolContribution {
  return {
    id: `${id}.search`,
    name: 'slack_search_messages',
    description: 'Search messages imported from Slack into xNet channels.',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Full-text query.' } },
      required: ['query']
    },
    invoke: (args) => search({ query: String(args.query ?? '') })
  }
}

/**
 * Build the Slack migration connector. The `pull` imports channels +
 * history into `Channel`/`ChatMessage` nodes via the guarded store.
 */
export function buildSlackConnector(options: SlackConnectorOptions = {}): DefinedConnector {
  const id = options.id ?? SLACK_CONNECTOR_ID
  const agentTools = options.search ? [searchTool(id, options.search)] : []
  return defineConnector({
    id,
    name: 'Slack',
    description: 'Import Slack channels and message history into xNet.',
    capabilities: {
      secrets: ['SLACK_USER_TOKEN'],
      schemaWrite: [CHANNEL_SCHEMA, CHAT_MESSAGE_SCHEMA],
      network: ['slack.com', 'files.slack.com']
    },
    sync: {
      schemas: [CHANNEL_SCHEMA, CHAT_MESSAGE_SCHEMA],
      cadence: 'manual',
      async pull(ctx) {
        const list = await asJson<{ channels?: SlackApiChannel[] }>(
          await ctx.fetch({
            url: 'https://slack.com/api/conversations.list?types=public_channel,private_channel'
          })
        )
        const channels = list.channels ?? []
        let written = 0
        for (const channel of channels) {
          written += await syncChannel(ctx, channel)
        }
        return { written, channels: channels.length }
      }
    },
    agentTools
  })
}
