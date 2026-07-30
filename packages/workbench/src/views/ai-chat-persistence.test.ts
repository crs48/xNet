import { describe, expect, it } from 'vitest'
import {
  aiChannelName,
  createAiConversationLog,
  type AiChatPersistenceStore
} from './ai-chat-persistence'

interface CreatedNode {
  schemaName: string
  data: Record<string, unknown>
}

function makeStore(options: { failOn?: number } = {}): {
  store: AiChatPersistenceStore
  created: CreatedNode[]
} {
  const created: CreatedNode[] = []
  let calls = 0
  return {
    created,
    store: {
      async create(schema, data) {
        calls += 1
        if (options.failOn === calls) throw new Error('storage down')
        const record = {
          schemaName: (schema as { schema: { name: string } }).schema.name,
          data: data as Record<string, unknown>
        }
        created.push(record)
        return { id: `node-${created.length}` }
      }
    }
  }
}

describe('aiChannelName', () => {
  it('clips long openings and collapses whitespace', () => {
    expect(aiChannelName('  what   is\nxNet? ')).toBe('AI · what is xNet?')
    expect(aiChannelName('x'.repeat(80))).toBe(`AI · ${'x'.repeat(47)}…`)
    expect(aiChannelName('   ')).toBe('AI · conversation')
  })
})

describe('createAiConversationLog', () => {
  it('creates the channel on the first user message, then logs both sides', async () => {
    const { store, created } = makeStore()
    const log = createAiConversationLog(store)
    await log.logUserMessage('what is xNet?', 'claude')
    await log.logAssistantReply('a local-first data workspace')

    expect(created.map((node) => node.schemaName)).toEqual([
      'Channel',
      'ChatMessage',
      'ChatMessage'
    ])
    expect(created[0].data).toMatchObject({
      kind: 'channel',
      name: 'AI · what is xNet?',
      topic: 'AI conversation — assistant replies via claude'
    })
    expect(created[1].data).toMatchObject({ channel: 'node-1', content: 'what is xNet?' })
    expect(created[2].data).toMatchObject({
      channel: 'node-1',
      content: 'a local-first data workspace'
    })
    expect(log.channelId).toBe('node-1')
  })

  it('reuses the channel on later turns', async () => {
    const { store, created } = makeStore()
    const log = createAiConversationLog(store)
    await log.logUserMessage('first', 'claude')
    await log.logAssistantReply('reply one')
    await log.logUserMessage('second', 'claude')
    expect(created.filter((node) => node.schemaName === 'Channel')).toHaveLength(1)
    expect(created.at(-1)?.data).toMatchObject({ channel: 'node-1', content: 'second' })
  })

  it('skips empty assistant replies and survives storage failures', async () => {
    const warnings: string[] = []
    const { store, created } = makeStore({ failOn: 1 })
    const log = createAiConversationLog(store, {
      warn: (message) => warnings.push(message)
    })
    // Channel create fails → warning, no throw into the chat flow.
    await log.logUserMessage('hello', 'claude')
    expect(warnings).toHaveLength(1)
    expect(log.channelId).toBeNull()
    // No channel → assistant reply is a no-op, not a crash.
    await log.logAssistantReply('   ')
    expect(created).toHaveLength(0)
  })
})
