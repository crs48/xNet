/**
 * Tests for the Slack migration connector (exploration 0198). Verifies the pull
 * imports channels + history into Channel/ChatMessage nodes with markdown-
 * translated bodies, and that it composes with the connector governance guards
 * (space stamping, egress containment).
 */

import type { ConnectorFetch, ConnectorStore } from '../connectors/define-connector'
import { describe, it, expect, vi } from 'vitest'
import { runConnectorSync } from '../connectors'
import {
  buildSlackConnector,
  CHANNEL_SCHEMA,
  CHAT_MESSAGE_SCHEMA,
  SLACK_CONNECTOR_ID
} from '../connectors/slack-migration'

/** In-memory store recording every create, returning stable ids. */
function memStore(): ConnectorStore & {
  created: Array<{ schemaId: string; properties: Record<string, unknown> }>
} {
  const created: Array<{ schemaId: string; properties: Record<string, unknown> }> = []
  let n = 0
  return {
    created,
    async create({ schemaId, properties }) {
      created.push({ schemaId, properties })
      return { id: `n${++n}`, schemaId }
    },
    async get() {
      return null
    },
    async update() {
      return {}
    }
  }
}

/** A fake Slack Web API: routes conversations.list / .history to canned JSON. */
function slackApi(responses: Record<string, unknown>): ConnectorFetch {
  return vi.fn(async (input) => {
    const url = typeof input === 'string' ? input : input.url
    const key = Object.keys(responses).find((k) => url.includes(k))
    return { json: async () => responses[key ?? ''] ?? {} }
  })
}

describe('buildSlackConnector — definition', () => {
  it('is a valid connector with the expected id and schemaWrite', () => {
    const connector = buildSlackConnector()
    expect(connector.module.id).toBe(SLACK_CONNECTOR_ID)
    expect(connector.module.hub).toEqual({ featureId: `${SLACK_CONNECTOR_ID}.sync` })
    expect(connector.definition.capabilities.schemaWrite).toEqual([
      CHANNEL_SCHEMA,
      CHAT_MESSAGE_SCHEMA
    ])
  })

  it('contributes no agent tool by default but one when a search backing is given', () => {
    expect(buildSlackConnector().agentTools).toEqual([])
    const withSearch = buildSlackConnector({ search: () => [{ id: 'm1' }] })
    expect(withSearch.agentTools.map((t) => t.name)).toEqual(['slack_search_messages'])
  })

  it('invokes the search backing through the contributed tool', async () => {
    const search = vi.fn(() => [{ id: 'm1' }])
    const connector = buildSlackConnector({ search })
    await connector.agentTools[0].invoke({ query: 'deploy' })
    expect(search).toHaveBeenCalledWith({ query: 'deploy' })
  })
})

describe('buildSlackConnector — pull', () => {
  it('imports channels and chronologically-ordered, markdown-translated history', async () => {
    const fetch = slackApi({
      'conversations.list': {
        channels: [{ id: 'C1', name: 'ops', topic: { value: 'Operations' } }]
      },
      'conversations.history': {
        messages: [
          { text: 'second <https://x|link>' },
          { text: 'first *bold*' },
          { subtype: 'channel_join', text: 'joined' }
        ]
      }
    })
    const store = memStore()
    const result = await runConnectorSync(buildSlackConnector().definition, {
      env: { SLACK_USER_TOKEN: 'xoxp-1' },
      fetch,
      store,
      space: 'space-A'
    })

    expect(result.written).toBe(3) // 1 channel + 2 real messages (join skipped)
    expect(result.channels).toBe(1)

    const channel = store.created[0]
    expect(channel.schemaId).toBe(CHANNEL_SCHEMA)
    expect(channel.properties).toMatchObject({ name: 'ops', kind: 'channel', topic: 'Operations' })
    expect(channel.properties.space).toBe('space-A') // stamped by the runner

    const messages = store.created.filter((c) => c.schemaId === CHAT_MESSAGE_SCHEMA)
    expect(messages.map((m) => m.properties.content)).toEqual([
      'first **bold**',
      'second [link](https://x)'
    ])
    expect(messages.every((m) => m.properties.channel === 'n1')).toBe(true)
  })

  it('handles a workspace with no channels', async () => {
    const result = await runConnectorSync(buildSlackConnector().definition, {
      env: {},
      fetch: slackApi({ 'conversations.list': { channels: [] } }),
      store: memStore(),
      space: 'space-A'
    })
    expect(result).toMatchObject({ written: 0, channels: 0 })
  })
})
