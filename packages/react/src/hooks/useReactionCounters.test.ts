import type { PublicInteractionPolicySnapshot } from './useModeratedComments'
import type { DID, NodeState, SchemaIRI } from '@xnetjs/data'
import { describe, expect, it } from 'vitest'
import {
  createReactionCounterSnapshot,
  dedupeReactions,
  isReactionVisible,
  summarizeReactionNode,
  type ReactionNode
} from './useReactionCounters'

const testDID = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK'
const otherDID = 'did:key:z6MkwPn7YjgojZ7ErSJfugcA5mNYG6PzhFGFbXuSfRJQPjDf'

const createPolicy = (
  overrides: Partial<PublicInteractionPolicySnapshot> = {}
): PublicInteractionPolicySnapshot => ({
  id: 'policy-1',
  target: 'page-1',
  scope: 'workspace',
  commentMode: 'authenticated',
  replyMode: 'trusted',
  reactionMode: 'authenticated',
  quoteMode: 'trusted',
  mentionMode: 'trusted',
  communityNoteMode: 'reviewed',
  messageMode: 'authenticated',
  crawlMode: 'closed',
  indexMode: 'reviewed',
  defaultVisibility: 'visible',
  firstContactMode: 'slow-mode',
  moderationMode: 'post-review',
  requiresVerifiedIdentity: false,
  acceptsPolicySubscriptions: true,
  policyLists: [],
  activeLabels: [],
  maintainers: [],
  moderators: [],
  policyPublishers: [],
  trustedDIDs: [testDID],
  mutedDIDs: [],
  blockedDIDs: [],
  updatedAt: 1,
  createdAt: 1,
  ...overrides
})

const createReaction = (
  id: string,
  reactionType: ReactionNode['reactionType'],
  reactor = testDID,
  createdAt = 1
): ReactionNode => ({
  id,
  target: 'page-1',
  reactionType,
  reactor,
  createdAt,
  createdBy: reactor
})

describe('reaction counter helpers', () => {
  it('summarizes reaction nodes', () => {
    const node: NodeState = {
      id: 'reaction-1',
      schemaId: 'xnet://xnet.fyi/Reaction@1.0.0' as SchemaIRI,
      properties: {
        target: 'page-1',
        targetSchema: 'xnet://xnet.fyi/Page',
        reactionType: 'like',
        reactor: testDID,
        annotation: 'good'
      },
      timestamps: {},
      deleted: false,
      createdAt: 10,
      createdBy: testDID as DID,
      updatedAt: 10,
      updatedBy: testDID as DID
    }

    expect(summarizeReactionNode(node)).toMatchObject({
      id: 'reaction-1',
      target: 'page-1',
      reactionType: 'like',
      reactor: testDID,
      annotation: 'good'
    })
  })

  it('dedupes repeated reactions by actor and type before counting', () => {
    const reactions = [
      createReaction('like-1', 'like', testDID, 1),
      createReaction('like-2', 'like', testDID, 2),
      createReaction('repost-1', 'repost', otherDID, 1)
    ]

    expect(dedupeReactions(reactions).map((reaction) => reaction.id)).toEqual([
      'like-2',
      'repost-1'
    ])
    expect(createReactionCounterSnapshot(reactions, 3)).toEqual({
      likes: 1,
      reposts: 1,
      bookmarks: 0,
      emoji: 0,
      replies: 3,
      totalReactions: 2,
      total: 5
    })
  })

  it('filters reactions from blocked actors', () => {
    const reaction = createReaction('like-1', 'like', otherDID)

    expect(isReactionVisible(reaction, [], createPolicy({ blockedDIDs: [otherDID] }))).toBe(false)
  })

  it('filters reactions with high-confidence hidden labels', () => {
    const reaction = createReaction('like-1', 'like')

    expect(
      isReactionVisible(
        reaction,
        [
          {
            id: 'label-1',
            target: reaction.id,
            value: 'spam',
            confidence: 0.91,
            sourceWeight: 1,
            createdAt: 1
          }
        ],
        createPolicy()
      )
    ).toBe(false)
  })
})
