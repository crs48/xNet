import type { PublicInteractionPolicySnapshot } from './useModeratedComments'
import type { DID, NodeState, SchemaIRI } from '@xnetjs/data'
import { describe, expect, it } from 'vitest'
import {
  createConversationKey,
  createMessageRequestProperties,
  evaluateFirstContactDecision,
  findLatestMessageRequest,
  hasAcceptedContact,
  summarizeMessageRequest,
  type MessageRequestNode
} from './useMessageRequests'

const senderDID = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK'
const recipientDID = 'did:key:z6MkwPn7YjgojZ7ErSJfugcA5mNYG6PzhFGFbXuSfRJQPjDf'

const createPolicy = (
  overrides: Partial<PublicInteractionPolicySnapshot> = {}
): PublicInteractionPolicySnapshot => ({
  id: 'policy-1',
  target: 'inbox-1',
  scope: 'user',
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
  slowModeSeconds: 30,
  requiresVerifiedIdentity: false,
  acceptsPolicySubscriptions: true,
  policyLists: [],
  activeLabels: [],
  maintainers: [],
  moderators: [],
  policyPublishers: [],
  trustedDIDs: [],
  mutedDIDs: [],
  blockedDIDs: [],
  updatedAt: 1,
  createdAt: 1,
  ...overrides
})

const createRequest = (overrides: Partial<MessageRequestNode> = {}): MessageRequestNode => ({
  id: 'request-1',
  conversationKey: createConversationKey(senderDID, recipientDID),
  sender: senderDID,
  recipient: recipientDID,
  status: 'pending',
  admission: 'message-request',
  reasonCodes: ['first-contact'],
  reviewers: [],
  createdAt: 1,
  createdBy: senderDID,
  ...overrides
})

describe('message request helpers', () => {
  it('summarizes message request nodes and expires active requests', () => {
    const node: NodeState = {
      id: 'request-1',
      schemaId: 'xnet://xnet.fyi/MessageRequest@1.0.0' as SchemaIRI,
      properties: {
        conversationKey: createConversationKey(senderDID, recipientDID),
        sender: senderDID,
        recipient: recipientDID,
        status: 'pending',
        admission: 'message-request',
        reasonCodes: ['first-contact'],
        expiresAt: 50
      },
      timestamps: {},
      deleted: false,
      createdAt: 10,
      createdBy: senderDID as DID,
      updatedAt: 10,
      updatedBy: senderDID as DID
    }

    expect(summarizeMessageRequest(node, 100)).toMatchObject({
      id: 'request-1',
      sender: senderDID,
      recipient: recipientDID,
      status: 'expired',
      admission: 'message-request'
    })
  })

  it('finds accepted contact state by deterministic conversation key', () => {
    const requests = [
      createRequest({ id: 'older', createdAt: 1, status: 'pending' }),
      createRequest({ id: 'newer', createdAt: 2, status: 'accepted' })
    ]

    expect(createConversationKey(recipientDID, senderDID)).toBe(
      createConversationKey(senderDID, recipientDID)
    )
    expect(findLatestMessageRequest(requests, senderDID, recipientDID)?.id).toBe('newer')
    expect(hasAcceptedContact(requests, senderDID, recipientDID)).toBe(true)
  })

  it('maps slow-mode first contact to a quiet message request', () => {
    const decision = evaluateFirstContactDecision({
      senderDID,
      recipientDID,
      policy: createPolicy(),
      now: 1_000
    })

    expect(decision).toMatchObject({
      admission: 'message-request',
      status: 'pending',
      visibility: 'requests',
      notifyRecipient: true,
      shouldCreateRequest: true,
      reasonCodes: ['first-contact', 'policy-slow-mode'],
      quarantineUntil: 31_000
    })
  })

  it('quarantines muted or policy-quarantined first contacts', () => {
    expect(
      evaluateFirstContactDecision({
        senderDID,
        recipientDID,
        policy: createPolicy({ mutedDIDs: [senderDID] })
      })
    ).toMatchObject({
      admission: 'quarantine',
      status: 'quarantined',
      visibility: 'quarantine',
      notifyRecipient: false,
      requiresReview: true,
      reasonCodes: ['sender-muted']
    })

    expect(
      evaluateFirstContactDecision({
        senderDID,
        recipientDID,
        policy: createPolicy({ firstContactMode: 'quarantine' })
      })
    ).toMatchObject({
      admission: 'quarantine',
      reasonCodes: ['first-contact', 'policy-quarantine']
    })
  })

  it('blocks first-contact messages when the target message policy is closed', () => {
    expect(
      evaluateFirstContactDecision({
        senderDID,
        recipientDID,
        policy: createPolicy({ messageMode: 'closed' })
      })
    ).toMatchObject({
      admission: 'block',
      status: 'blocked',
      visibility: 'hidden',
      shouldCreateRequest: false,
      reasonCodes: ['message-policy-denied', 'interaction-closed']
    })
  })

  it('routes reviewed message policies to review before request delivery', () => {
    expect(
      evaluateFirstContactDecision({
        senderDID,
        recipientDID,
        policy: createPolicy({ messageMode: 'reviewed' })
      })
    ).toMatchObject({
      admission: 'review',
      status: 'pending',
      visibility: 'requests',
      requiresReview: true,
      shouldCreateRequest: true,
      reasonCodes: ['message-review-required']
    })
  })

  it('lets trusted and accepted contacts bypass request creation', () => {
    expect(
      evaluateFirstContactDecision({
        senderDID,
        recipientDID,
        policy: createPolicy({ trustedDIDs: [senderDID] })
      })
    ).toMatchObject({
      admission: 'allow',
      shouldCreateRequest: false,
      reasonCodes: ['trusted-sender']
    })

    expect(
      evaluateFirstContactDecision({
        senderDID,
        recipientDID,
        policy: createPolicy(),
        existingRequests: [createRequest({ status: 'accepted' })]
      })
    ).toMatchObject({
      admission: 'allow',
      shouldCreateRequest: false,
      reasonCodes: ['known-contact']
    })
  })

  it('creates durable request properties from the decision snapshot', () => {
    const decision = evaluateFirstContactDecision({
      senderDID,
      recipientDID,
      policy: createPolicy({ firstContactMode: 'review' })
    })
    const preview = 'a'.repeat(1_100)

    expect(
      createMessageRequestProperties(
        {
          senderDID,
          recipientDID,
          firstMessagePreview: preview,
          reviewers: [recipientDID]
        },
        decision,
        createPolicy({ firstContactMode: 'review' })
      )
    ).toMatchObject({
      conversationKey: createConversationKey(senderDID, recipientDID),
      status: 'pending',
      admission: 'review',
      reasonCodes: ['first-contact', 'policy-review'],
      policy: 'policy-1',
      policyMode: 'review',
      reviewers: [recipientDID]
    })
  })
})
