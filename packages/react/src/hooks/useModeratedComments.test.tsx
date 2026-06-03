import type { CommentNode, CommentThread } from './useComments'
import type {
  ModerationLabelSummary,
  PublicInteractionPolicySnapshot
} from './useModeratedComments'
import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  createModerationLabelIndex,
  evaluateCommentModeration,
  evaluateInteractionPermission,
  moderateThread,
  selectActiveInteractionPolicy,
  selectPublicInteractionMode,
  useModeratedThread
} from './useModeratedComments'

const testDID = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK'
const otherDID = 'did:key:z6MkwPn7YjgojZ7ErSJfugcA5mNYG6PzhFGFbXuSfRJQPjDf'

const createComment = (id: string, inReplyTo?: string): CommentNode => ({
  id,
  schemaId: 'xnet://xnet.fyi/Comment@1.0.0',
  createdAt: 1,
  lamportTime: 1,
  wallTime: 1,
  properties: {
    target: 'page-1',
    inReplyTo,
    anchorType: 'node',
    anchorData: '{}',
    content: `comment ${id}`,
    resolved: false,
    edited: false,
    createdBy: testDID
  }
})

const createLabel = (
  target: string,
  value: string,
  confidence: number
): ModerationLabelSummary => ({
  id: `${target}-${value}`,
  target,
  value,
  confidence,
  sourceWeight: 1,
  sourceType: 'policy-list',
  createdAt: 1
})

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

describe('moderated comment helpers', () => {
  it('hides high-confidence abuse labels and keeps hidden comments out by default', () => {
    const comment = createComment('comment-1')
    const moderated = evaluateCommentModeration(comment, {
      labels: [createLabel(comment.id, 'spam', 0.92)],
      policy: createPolicy()
    })

    expect(moderated.visibility).toBe('hidden')
    expect(moderated.visible).toBe(false)
    expect(moderated.reasons).toContain('label:spam')
  })

  it('collapses quality labels by default', () => {
    const comment = createComment('comment-1')
    const moderated = evaluateCommentModeration(comment, {
      labels: [createLabel(comment.id, 'slop', 0.72)],
      policy: createPolicy()
    })

    expect(moderated.visibility).toBe('collapsed')
    expect(moderated.visible).toBe(true)
  })

  it('lets safe labels override lower-confidence abuse labels', () => {
    const comment = createComment('comment-1')
    const moderated = evaluateCommentModeration(comment, {
      labels: [createLabel(comment.id, 'spam', 0.86), createLabel(comment.id, 'safe', 0.91)],
      policy: createPolicy()
    })

    expect(moderated.visibility).toBe('visible')
    expect(moderated.visible).toBe(true)
  })

  it('filters hidden replies from moderated threads', () => {
    const root = createComment('root')
    const hiddenReply = createComment('reply-1', root.id)
    const visibleReply = createComment('reply-2', root.id)
    const thread: CommentThread = { root, replies: [hiddenReply, visibleReply] }
    const labelIndex = createModerationLabelIndex([createLabel(hiddenReply.id, 'spam', 0.9)])

    const moderated = moderateThread(thread, {
      labelIndex,
      policy: createPolicy()
    })

    expect(moderated.visible).toBe(true)
    expect(moderated.visibleReplies.map((reply) => reply.comment.id)).toEqual(['reply-2'])
    expect(moderated.hiddenReplyCount).toBe(1)
  })

  it('selects the newest public interaction policy', () => {
    const older = createPolicy({ id: 'older', updatedAt: 10 })
    const newer = createPolicy({ id: 'newer', updatedAt: 20 })

    expect(selectActiveInteractionPolicy([older, newer])?.id).toBe('newer')
  })

  it('evaluates trusted and blocked interaction modes', () => {
    const policy = createPolicy({ blockedDIDs: [otherDID] })

    expect(
      evaluateInteractionPermission('trusted', policy, {
        viewerDID: testDID
      }).allowed
    ).toBe(true)
    expect(
      evaluateInteractionPermission('trusted', policy, {
        viewerDID: otherDID
      })
    ).toMatchObject({
      allowed: false,
      reasons: ['viewer-blocked']
    })
  })

  it('does not treat missing public-read policy as open interaction permission', () => {
    const anonymousSurfaces = ['comment', 'reaction', 'message', 'crawl', 'index'] as const

    expect(selectPublicInteractionMode(null, 'comment')).toBe('authenticated')
    expect(selectPublicInteractionMode(null, 'reaction')).toBe('authenticated')
    expect(selectPublicInteractionMode(null, 'message')).toBe('authenticated')
    expect(selectPublicInteractionMode(null, 'crawl')).toBe('closed')
    expect(selectPublicInteractionMode(null, 'index')).toBe('reviewed')

    expect(
      anonymousSurfaces.map((surface) =>
        evaluateInteractionPermission(selectPublicInteractionMode(null, surface), null)
      )
    ).toEqual([
      {
        allowed: false,
        requiresReview: false,
        mode: 'authenticated',
        reasons: ['authentication-required']
      },
      {
        allowed: false,
        requiresReview: false,
        mode: 'authenticated',
        reasons: ['authentication-required']
      },
      {
        allowed: false,
        requiresReview: false,
        mode: 'authenticated',
        reasons: ['authentication-required']
      },
      {
        allowed: false,
        requiresReview: false,
        mode: 'closed',
        reasons: ['interaction-closed']
      },
      {
        allowed: false,
        requiresReview: true,
        mode: 'reviewed',
        reasons: ['authentication-required']
      }
    ])
    expect(
      evaluateInteractionPermission(selectPublicInteractionMode(null, 'index'), null, {
        viewerDID: testDID,
        isAuthenticated: true
      })
    ).toEqual({
      allowed: true,
      requiresReview: true,
      mode: 'reviewed',
      reasons: []
    })
  })
})

describe('useModeratedThread', () => {
  it('returns a memoized moderated thread view', () => {
    const root = createComment('root')
    const reply = createComment('reply-1', root.id)
    const thread: CommentThread = { root, replies: [reply] }
    const labelIndex = createModerationLabelIndex([createLabel(reply.id, 'unsupported', 0.8)])

    const { result } = renderHook(() =>
      useModeratedThread({
        thread,
        labelIndex,
        policy: createPolicy()
      })
    )

    expect(result.current?.visible).toBe(true)
    expect(result.current?.visibleReplies).toHaveLength(1)
    expect(result.current?.visibleReplies[0].visibility).toBe('collapsed')
  })
})
