import type { DefinedSchema, PropertyBuilder } from '@xnetjs/data'
import { describe, expect, it } from 'vitest'
import {
  channelHistoryQuery,
  compareMessages,
  createChannel,
  editMessage,
  ensureDmChannel,
  redactMessage,
  sendMessage,
  type ChatStore
} from './chat-service'
import { dmChannelId, dmMembers, isDmChannelId } from './dm'

const alice = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK'
const bob = 'did:key:z6MkfDbvZkqwzPLs7BA1eMnaGyfXcb4ZUmaqYwhEbBPp7pTV'

/** Tiny in-memory ChatStore capturing nodes by id. */
function memoryStore(): ChatStore & { nodes: Map<string, Record<string, unknown>> } {
  const nodes = new Map<string, Record<string, unknown>>()
  let counter = 0
  return {
    nodes,
    async create<P extends Record<string, PropertyBuilder>>(
      schema: DefinedSchema<P>,
      data: never,
      id?: string
    ) {
      const nodeId = id ?? `node-${++counter}`
      if (nodes.has(nodeId)) throw new Error('exists')
      const node = schema.create(data, { createdBy: alice, id: nodeId })
      nodes.set(nodeId, node as Record<string, unknown>)
      return node
    },
    async update(nodeId, changes) {
      const node = nodes.get(nodeId)
      if (!node) throw new Error('missing')
      Object.assign(node, changes)
      return node
    },
    async get(nodeId) {
      return nodes.get(nodeId) ?? null
    }
  }
}

describe('dmChannelId', () => {
  it('is deterministic and order/duplicate insensitive', () => {
    const id1 = dmChannelId([alice, bob])
    const id2 = dmChannelId([bob, alice, bob])
    expect(id1).toBe(id2)
    expect(isDmChannelId(id1)).toBe(true)
  })

  it('differs for different pairs', () => {
    expect(dmChannelId([alice, bob])).not.toBe(dmChannelId([alice, 'did:key:zCarol']))
  })

  it('rejects fewer than two distinct participants', () => {
    expect(() => dmChannelId([alice, alice])).toThrow()
  })

  it('dmMembers sorts and dedupes', () => {
    expect(dmMembers([bob, alice, bob])).toEqual([alice, bob].sort())
  })
})

describe('ensureDmChannel', () => {
  it('creates the channel once and is idempotent after', async () => {
    const store = memoryStore()
    const first = await ensureDmChannel(store, [alice, bob])
    expect(first.created).toBe(true)

    const second = await ensureDmChannel(store, [bob, alice])
    expect(second.created).toBe(false)
    expect(second.channelId).toBe(first.channelId)
    expect(store.nodes.size).toBe(1)

    const node = store.nodes.get(first.channelId)
    expect(node?.kind).toBe('dm')
    expect(node?.members).toEqual(dmMembers([alice, bob]))
  })

  it('swallows create races when get is unavailable', async () => {
    const store = memoryStore()
    const noGet: ChatStore = { create: store.create, update: store.update }
    const first = await ensureDmChannel(noGet, [alice, bob])
    const second = await ensureDmChannel(noGet, [alice, bob])
    expect(first.created).toBe(true)
    expect(second.created).toBe(false)
  })
})

describe('messages', () => {
  it('sendMessage normalizes mentions and trims content', async () => {
    const store = memoryStore()
    const message = (await sendMessage(store, {
      channelId: 'chan-1',
      content: '  hey @bob  ',
      mentions: { dids: [bob, bob, 'junk'] }
    })) as Record<string, unknown>
    expect(message.content).toBe('hey @bob')
    expect(message.mentions).toEqual({ dids: [bob] })
    expect(message.channel).toBe('chan-1')
  })

  it('rejects empty messages', async () => {
    await expect(sendMessage(memoryStore(), { channelId: 'c', content: '   ' })).rejects.toThrow()
  })

  it('sendMessage passes composer-declared links through, omitting empty lists', async () => {
    const store = memoryStore()
    const linked = (await sendMessage(store, {
      channelId: 'chan-1',
      content: 'see [[Launch Plan]]',
      links: ['node-1', 'node-2']
    })) as Record<string, unknown>
    expect(linked.links).toEqual(['node-1', 'node-2'])

    const plain = (await sendMessage(store, {
      channelId: 'chan-1',
      content: 'no links',
      links: []
    })) as Record<string, unknown>
    expect(plain.links ?? []).toHaveLength(0)
  })

  it('editMessage marks edited; redactMessage tombstones', async () => {
    const store = memoryStore()
    const message = (await sendMessage(store, {
      channelId: 'chan-1',
      content: 'original'
    })) as { id: string }

    await editMessage(store, message.id, 'updated')
    expect(store.nodes.get(message.id)).toMatchObject({ content: 'updated', edited: true })

    await redactMessage(store, message.id)
    expect(store.nodes.get(message.id)).toMatchObject({ content: '', redacted: true })
  })

  it('createChannel defaults to kind channel', async () => {
    const store = memoryStore()
    const channel = (await createChannel(store, { name: 'general' })) as Record<string, unknown>
    expect(channel.kind).toBe('channel')
  })

  it('channelHistoryQuery shape and compareMessages ordering', () => {
    expect(channelHistoryQuery('chan-1', 10)).toEqual({
      where: { channel: 'chan-1' },
      orderBy: { createdAt: 'desc' },
      limit: 10
    })
    const messages = [
      { id: 'b', createdAt: 2 },
      { id: 'a', createdAt: 1 },
      { id: 'c', createdAt: 2 }
    ]
    expect(messages.sort(compareMessages).map((m) => m.id)).toEqual(['a', 'b', 'c'])
  })
})
