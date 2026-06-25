/**
 * Comms seeder — Channels with threaded ChatMessages, node-anchored Comments on
 * tasks, and Reactions. All scoped into the demo Space.
 *
 * Note: every seeded change is signed by the real author, so all messages show
 * the current user as author; `members`/`reactor` use demo DIDs for variety.
 */

import { ChannelSchema, ChatMessageSchema, CommentSchema, ReactionSchema } from '@xnetjs/data'
import type { DeterministicNodeImportDraft } from '@xnetjs/data'
import type { SeederModule } from '../types'
import { CHANNEL_NAMES, CHAT_LINES, pick, PROJECT_NAMES, seedId } from '../seed-ids'
import { taskId } from './work'

/** Stable channel node id. */
export const channelId = (name: string): string => seedId('channel', name)

export const commsSeeder: SeederModule = {
  domain: 'comms',
  label: 'Channels & messages',
  schemaIds: [
    ChannelSchema._schemaId,
    ChatMessageSchema._schemaId,
    CommentSchema._schemaId,
    ReactionSchema._schemaId
  ],
  seed: ({ space, people, scale, rng }) => {
    const drafts: DeterministicNodeImportDraft[] = []
    const names = CHANNEL_NAMES.slice(0, scale.channels)

    names.forEach((name) => {
      const channel = channelId(name)
      drafts.push({
        id: channel,
        schemaId: ChannelSchema._schemaId,
        properties: {
          name,
          kind: 'channel',
          topic: `#${name} — seeded demo channel`,
          members: people.map((p) => p.did),
          space
        }
      })

      let firstMessageId: string | null = null
      for (let i = 0; i < scale.messagesPerChannel; i++) {
        const id = seedId('msg', name, i)
        const isReply = i > 0 && rng() < 0.3
        drafts.push({
          id,
          schemaId: ChatMessageSchema._schemaId,
          properties: {
            channel,
            content: pick(rng, CHAT_LINES),
            ...(isReply && firstMessageId ? { inReplyTo: firstMessageId } : {})
          }
        })
        if (i === 0) firstMessageId = id

        // A few reactions on the first message of each channel.
        if (i === 0) {
          people.slice(0, 2).forEach((person, r) => {
            drafts.push({
              id: seedId('reaction', name, person.did),
              schemaId: ReactionSchema._schemaId,
              properties: {
                target: id,
                targetSchema: ChatMessageSchema._schemaId,
                reactionType: r === 0 ? 'like' : 'emoji',
                reactor: person.did,
                emoji: r === 0 ? '👍' : '🎉'
              }
            })
          })
        }
      }
    })

    // Node-anchored comments on the first task of each project.
    for (const name of PROJECT_NAMES.slice(0, scale.projects)) {
      const target = taskId(name, 0)
      drafts.push({
        id: seedId('comment', 'task', name),
        schemaId: CommentSchema._schemaId,
        properties: {
          target,
          targetSchema: 'xnet://xnet.fyi/Task@1.0.0',
          anchorType: 'node',
          anchorData: '{}',
          content: `Can we scope ${name} into smaller tasks?`,
          resolved: false
        }
      })
    }

    return { drafts }
  }
}
