/**
 * Comms seeder — Channels with threaded ChatMessages, DM channels between the
 * author and demo people, Reactions, and node-anchored Comments on tasks.
 * Channels are scoped into team spaces and tagged.
 *
 * Note: every seeded change is signed by the real author, so messages show the
 * current user as author; `members`/`reactor` use demo DIDs for variety.
 */

import type { SeederModule } from '../types'
import type { DeterministicNodeImportDraft } from '@xnetjs/data'
import { ChannelSchema, ChatMessageSchema, CommentSchema, ReactionSchema } from '@xnetjs/data'
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
  seed: ({ fixtures, authorDID, people, scale, rng }) => {
    const drafts: DeterministicNodeImportDraft[] = []
    const teamSpaces = [fixtures.spaces.engineering, fixtures.spaces.design, fixtures.spaces.org]
    const names = CHANNEL_NAMES.slice(0, scale.channels)

    names.forEach((name, ci) => {
      const channel = channelId(name)
      drafts.push({
        id: channel,
        schemaId: ChannelSchema._schemaId,
        properties: {
          name,
          kind: 'channel',
          topic: `#${name} — seeded demo channel`,
          members: people.map((p) => p.did),
          space: teamSpaces[ci % teamSpaces.length],
          tags: [fixtures.tag(ci % 2 === 0 ? 'backend' : 'design')]
        }
      })

      // A threaded conversation: a root, then a chain of replies + new roots.
      let rootId: string | null = null
      let prevId: string | null = null
      for (let i = 0; i < scale.messagesPerChannel; i++) {
        const id = seedId('msg', name, i)
        const inThread = i > 0 && rng() < 0.5
        const replyTo = inThread ? (rng() < 0.5 ? prevId : rootId) : null
        drafts.push({
          id,
          schemaId: ChatMessageSchema._schemaId,
          properties: {
            channel,
            content: pick(rng, CHAT_LINES),
            ...(replyTo ? { inReplyTo: replyTo } : {})
          }
        })
        if (i === 0) rootId = id
        prevId = id

        // Reactions on roughly every third message.
        if (i % 3 === 0) {
          people.slice(0, 2).forEach((person, r) => {
            drafts.push({
              id: seedId('reaction', name, i, person.did),
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

    // ─── Direct messages: author ↔ each demo person ─────────────────────
    people.slice(0, Math.min(people.length, 3)).forEach((person) => {
      const dm = seedId('dm', person.did)
      drafts.push({
        id: dm,
        schemaId: ChannelSchema._schemaId,
        properties: {
          kind: 'dm',
          members: [authorDID, person.did],
          space: fixtures.spaces.org
        }
      })
      let prev: string | null = null
      for (let i = 0; i < 4; i++) {
        const id = seedId('dmmsg', person.did, i)
        drafts.push({
          id,
          schemaId: ChatMessageSchema._schemaId,
          properties: {
            channel: dm,
            content: pick(rng, CHAT_LINES),
            ...(prev && i % 2 === 1 ? { inReplyTo: prev } : {})
          }
        })
        prev = id
      }
    })

    // ─── Node-anchored comments on the first task of each project ───────
    for (const name of PROJECT_NAMES.slice(0, scale.projects)) {
      drafts.push({
        id: seedId('comment', 'task', name),
        schemaId: CommentSchema._schemaId,
        properties: {
          target: taskId(name, 0),
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
