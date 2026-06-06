/**
 * Social conversation and message schemas.
 */

import type { InferNode } from '@xnetjs/data'
import { checkbox, date, defineSchema, number, relation, select, text } from '@xnetjs/data'
import {
  SOCIAL_NAMESPACE,
  conversationKinds,
  messageKinds,
  privacyClasses,
  socialPlatforms,
  visibilityOptions
} from './constants'

export const SocialConversationSchema = defineSchema({
  name: 'SocialConversation',
  namespace: SOCIAL_NAMESPACE,
  properties: {
    platform: select({ options: socialPlatforms, required: true, default: 'generic' }),
    conversationKind: select({ options: conversationKinds, required: true, default: 'unknown' }),
    platformConversationId: text({ maxLength: 500 }),
    title: text({ maxLength: 1000 }),
    participantActorIdsJson: text({ maxLength: 20000 }),
    startedAt: date({ includeTime: true }),
    lastMessageAt: date({ includeTime: true }),
    messageCount: number({ min: 0, integer: true }),
    starred: checkbox({ default: false }),
    temporary: checkbox({ default: false }),
    sourceRecord: relation({}),
    sourceArchive: relation({}),
    privacyClass: select({ options: privacyClasses, required: true, default: 'private' }),
    visibility: select({ options: visibilityOptions, required: true, default: 'private' }),
    metadataJson: text({ maxLength: 50000 })
  },
  document: undefined
})

export const SocialMessageSchema = defineSchema({
  name: 'SocialMessage',
  namespace: SOCIAL_NAMESPACE,
  properties: {
    platform: select({ options: socialPlatforms, required: true, default: 'generic' }),
    messageKind: select({ options: messageKinds, required: true, default: 'message' }),
    platformMessageId: text({ maxLength: 500 }),
    conversation: relation({ required: true }),
    senderActor: relation({}),
    senderHandle: text({ maxLength: 500 }),
    parentMessage: relation({}),
    model: text({ maxLength: 200 }),
    textPreview: text({ maxLength: 5000 }),
    searchText: text({ maxLength: 20000 }),
    attachmentRefsJson: text({ maxLength: 20000 }),
    externalRefsJson: text({ maxLength: 20000 }),
    reactionSummaryJson: text({ maxLength: 20000 }),
    sentAt: date({ includeTime: true }),
    importedAt: date({ includeTime: true }),
    sourceRecord: relation({}),
    privacyClass: select({ options: privacyClasses, required: true, default: 'private' }),
    visibility: select({ options: visibilityOptions, required: true, default: 'private' }),
    metadataJson: text({ maxLength: 50000 })
  },
  document: undefined
})

export type SocialConversation = InferNode<(typeof SocialConversationSchema)['_properties']>
export type SocialMessage = InferNode<(typeof SocialMessageSchema)['_properties']>
