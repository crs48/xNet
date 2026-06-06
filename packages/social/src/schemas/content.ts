/**
 * Social content schemas.
 */

import type { InferNode } from '@xnetjs/data'
import { date, defineSchema, number, relation, select, text, url } from '@xnetjs/data'
import {
  SOCIAL_NAMESPACE,
  contentKinds,
  privacyClasses,
  socialPlatforms,
  visibilityOptions
} from './constants'

export const SocialContentSchema = defineSchema({
  name: 'SocialContent',
  namespace: SOCIAL_NAMESPACE,
  properties: {
    platform: select({ options: socialPlatforms, required: true, default: 'generic' }),
    contentKind: select({ options: contentKinds, required: true, default: 'unknown' }),
    platformContentKind: text({ maxLength: 200 }),
    platformContentId: text({ maxLength: 500 }),
    canonicalUrl: url({}),
    platformUrl: url({}),
    authorActor: relation({}),
    actorHandle: text({ maxLength: 500 }),
    title: text({ maxLength: 1000 }),
    textPreview: text({ maxLength: 5000 }),
    searchText: text({ maxLength: 20000 }),
    language: text({ maxLength: 32 }),
    mediaKind: text({ maxLength: 100 }),
    mediaAsset: relation({}),
    parentContent: relation({}),
    conversation: relation({}),
    sourceRecord: relation({}),
    publishedAt: date({ includeTime: true }),
    observedAt: date({ includeTime: true }),
    importedAt: date({ includeTime: true }),
    privacyClass: select({ options: privacyClasses, required: true, default: 'unknown' }),
    visibility: select({ options: visibilityOptions, required: true, default: 'private' }),
    confidence: number({ min: 0, max: 1 }),
    metadataJson: text({ maxLength: 50000 })
  },
  document: undefined
})

export type SocialContent = InferNode<(typeof SocialContentSchema)['_properties']>
