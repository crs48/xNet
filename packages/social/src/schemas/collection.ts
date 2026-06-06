/**
 * Social collection schemas.
 */

import type { InferNode } from '@xnetjs/data'
import { date, defineSchema, number, relation, select, text, url } from '@xnetjs/data'
import {
  SOCIAL_NAMESPACE,
  collectionKinds,
  privacyClasses,
  socialPlatforms,
  visibilityOptions
} from './constants'

export const SocialCollectionSchema = defineSchema({
  name: 'SocialCollection',
  namespace: SOCIAL_NAMESPACE,
  properties: {
    platform: select({ options: socialPlatforms, required: true, default: 'generic' }),
    collectionKind: select({ options: collectionKinds, required: true, default: 'unknown' }),
    platformCollectionId: text({ maxLength: 500 }),
    title: text({ required: true, maxLength: 1000 }),
    ownerActor: relation({}),
    canonicalUrl: url({}),
    itemCount: number({ min: 0, integer: true }),
    observedAt: date({ includeTime: true }),
    sourceRecord: relation({}),
    privacyClass: select({ options: privacyClasses, required: true, default: 'private' }),
    visibility: select({ options: visibilityOptions, required: true, default: 'private' }),
    metadataJson: text({ maxLength: 50000 })
  },
  document: undefined
})

export const SocialCollectionItemSchema = defineSchema({
  name: 'SocialCollectionItem',
  namespace: SOCIAL_NAMESPACE,
  properties: {
    collection: relation({ required: true }),
    item: relation({ required: true }),
    itemSchema: text({ maxLength: 500 }),
    platform: select({ options: socialPlatforms, required: true, default: 'generic' }),
    sortKey: text({ maxLength: 500 }),
    addedAt: date({ includeTime: true }),
    sourceRecord: relation({}),
    privacyClass: select({ options: privacyClasses, required: true, default: 'private' }),
    visibility: select({ options: visibilityOptions, required: true, default: 'private' }),
    metadataJson: text({ maxLength: 20000 })
  },
  document: undefined
})

export type SocialCollection = InferNode<(typeof SocialCollectionSchema)['_properties']>
export type SocialCollectionItem = InferNode<(typeof SocialCollectionItemSchema)['_properties']>
