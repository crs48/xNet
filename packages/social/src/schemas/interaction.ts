/**
 * Social interaction schema.
 */

import type { InferNode } from '@xnetjs/data'
import { date, defineSchema, number, relation, select, text } from '@xnetjs/data'
import {
  SOCIAL_NAMESPACE,
  interactionKinds,
  privacyClasses,
  socialPlatforms,
  visibilityOptions
} from './constants'

export const SocialInteractionSchema = defineSchema({
  name: 'SocialInteraction',
  namespace: SOCIAL_NAMESPACE,
  properties: {
    platform: select({ options: socialPlatforms, required: true, default: 'generic' }),
    interactionKind: select({ options: interactionKinds, required: true, default: 'unknown' }),
    platformInteractionKind: text({ maxLength: 300 }),
    actor: relation({ required: true }),
    target: relation({}),
    targetSchema: text({ maxLength: 500 }),
    targetTitle: text({ maxLength: 1000 }),
    targetAuthorActor: relation({}),
    targetAuthorHandle: text({ maxLength: 500 }),
    value: text({ maxLength: 1000 }),
    observedAt: date({ includeTime: true }),
    publishedAt: date({ includeTime: true }),
    importedAt: date({ includeTime: true }),
    sourceRecord: relation({}),
    sourceArchive: relation({}),
    privacyClass: select({ options: privacyClasses, required: true, default: 'unknown' }),
    visibility: select({ options: visibilityOptions, required: true, default: 'private' }),
    confidence: number({ min: 0, max: 1 }),
    metadataJson: text({ maxLength: 20000 })
  },
  document: undefined
})

export type SocialInteraction = InferNode<(typeof SocialInteractionSchema)['_properties']>
