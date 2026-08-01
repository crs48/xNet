import { describe, expect, it } from 'vitest'
import {
  SocialContentSchema,
  SocialConversationSchema,
  SocialInteractionSchema,
  SocialMessageSchema
} from '../schemas'
import {
  createDefaultSocialContextPacks,
  createSensitiveSocialContextPack,
  createSocialRetrievalScope,
  filterSocialRetrievalCandidates,
  isSocialNodeRetrievable,
  socialRetrievalDecision,
  SOCIAL_RETRIEVAL_SCOPE
} from './index'

describe('social retrieval scope', () => {
  it('admits content, collections and interactions by default', () => {
    expect(isSocialNodeRetrievable({ schemaId: SocialContentSchema._schemaId })).toBe(true)
    expect(
      isSocialNodeRetrievable({
        schemaId: SocialInteractionSchema._schemaId,
        interactionKind: 'bookmark'
      })
    ).toBe(true)
  })

  it('excludes direct messages and conversations by default', () => {
    expect(socialRetrievalDecision({ schemaId: SocialMessageSchema._schemaId })).toEqual({
      eligible: false,
      reason: 'schema-not-in-scope'
    })
    expect(socialRetrievalDecision({ schemaId: SocialConversationSchema._schemaId }).eligible).toBe(
      false
    )
  })

  it('excludes search history without excluding the rest of the interactions', () => {
    const search = {
      schemaId: SocialInteractionSchema._schemaId,
      interactionKind: 'search'
    }
    expect(socialRetrievalDecision(search)).toEqual({
      eligible: false,
      reason: 'interaction-kind-excluded'
    })
    expect(
      isSocialNodeRetrievable({
        schemaId: SocialInteractionSchema._schemaId,
        interactionKind: 'like'
      })
    ).toBe(true)
  })

  it('excludes account-security, billing and ad-targeting privacy classes', () => {
    for (const privacyClass of ['third-party-private', 'account-security', 'billing', 'ads']) {
      expect(
        socialRetrievalDecision({ schemaId: SocialContentSchema._schemaId, privacyClass })
      ).toEqual({ eligible: false, reason: 'privacy-class-excluded' })
    }
    expect(
      isSocialNodeRetrievable({ schemaId: SocialContentSchema._schemaId, privacyClass: 'public' })
    ).toBe(true)
  })

  it('widens only when asked, and says that it was widened', () => {
    expect(SOCIAL_RETRIEVAL_SCOPE.includesSensitive).toBe(false)

    const widened = createSocialRetrievalScope({ includeMessages: true })
    expect(widened.includesSensitive).toBe(true)
    expect(isSocialNodeRetrievable({ schemaId: SocialMessageSchema._schemaId }, widened)).toBe(true)

    const withSearch = createSocialRetrievalScope({ includeSearchHistory: true })
    expect(
      isSocialNodeRetrievable(
        { schemaId: SocialInteractionSchema._schemaId, interactionKind: 'search' },
        withSearch
      )
    ).toBe(true)
    // Widening one axis must not widen the other.
    expect(isSocialNodeRetrievable({ schemaId: SocialMessageSchema._schemaId }, withSearch)).toBe(
      false
    )
  })

  it('tallies exclusions by reason so a surface can report them', () => {
    const result = filterSocialRetrievalCandidates([
      { schemaId: SocialContentSchema._schemaId },
      { schemaId: SocialContentSchema._schemaId, privacyClass: 'billing' },
      { schemaId: SocialMessageSchema._schemaId },
      { schemaId: SocialInteractionSchema._schemaId, interactionKind: 'search' }
    ])

    expect(result.eligible).toHaveLength(1)
    expect(result.excluded).toEqual({
      'schema-not-in-scope': 1,
      'privacy-class-excluded': 1,
      'interaction-kind-excluded': 1
    })
  })
})

describe('social context packs', () => {
  it('ships two packs, both on the conservative scope', () => {
    const packs = createDefaultSocialContextPacks()
    expect(packs.map((pack) => pack.id)).toEqual([
      'social.pack.saved-library',
      'social.pack.watched-transcripts'
    ])
    for (const pack of packs) {
      expect(pack.scope.includesSensitive).toBe(false)
      expect(pack.limit).toBeGreaterThan(0)
    }
  })

  it('carries the caller query and limit through', () => {
    const [pack] = createDefaultSocialContextPacks({ query: 'fermentation', limit: 5 })
    expect(pack?.query).toBe('fermentation')
    expect(pack?.limit).toBe(5)
  })

  it('keeps the message-reading pack out of the default list', () => {
    const sensitive = createSensitiveSocialContextPack()
    expect(sensitive.scope.includesSensitive).toBe(true)
    expect(createDefaultSocialContextPacks().some((pack) => pack.scope.includesSensitive)).toBe(
      false
    )
  })
})
