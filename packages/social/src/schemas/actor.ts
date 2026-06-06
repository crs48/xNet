/**
 * Social actor schemas.
 */

import type { InferNode } from '@xnetjs/data'
import { checkbox, date, defineSchema, number, relation, select, text, url } from '@xnetjs/data'
import {
  SOCIAL_NAMESPACE,
  actorKinds,
  identityClaimKinds,
  privacyClasses,
  socialPlatforms,
  visibilityOptions
} from './constants'

export const SocialActorSchema = defineSchema({
  name: 'SocialActor',
  namespace: SOCIAL_NAMESPACE,
  properties: {
    platform: select({ options: socialPlatforms, required: true, default: 'generic' }),
    actorKind: select({ options: actorKinds, required: true, default: 'unknown' }),
    platformActorId: text({ maxLength: 500 }),
    handle: text({ maxLength: 500 }),
    displayName: text({ maxLength: 500 }),
    profileUrl: url({}),
    avatarMedia: relation({}),
    observedBy: text({ maxLength: 500 }),
    observedAt: date({ includeTime: true }),
    privacyClass: select({ options: privacyClasses, required: true, default: 'public' }),
    visibility: select({ options: visibilityOptions, required: true, default: 'private' }),
    isSelf: checkbox({ default: false }),
    sourceRecord: relation({}),
    metadataJson: text({ maxLength: 20000 })
  },
  document: undefined
})

export const SocialIdentityClaimSchema = defineSchema({
  name: 'SocialIdentityClaim',
  namespace: SOCIAL_NAMESPACE,
  properties: {
    subjectActor: relation({ required: true }),
    objectActor: relation({ required: true }),
    claimKind: select({ options: identityClaimKinds, required: true, default: 'same-url' }),
    confidence: number({ min: 0, max: 1 }),
    observedBy: text({ maxLength: 500 }),
    observedAt: date({ includeTime: true }),
    visibility: select({ options: visibilityOptions, required: true, default: 'private' }),
    sourceRecord: relation({}),
    evidenceJson: text({ maxLength: 20000 })
  },
  document: undefined
})

export type SocialActor = InferNode<(typeof SocialActorSchema)['_properties']>
export type SocialIdentityClaim = InferNode<(typeof SocialIdentityClaimSchema)['_properties']>
