import { describe, expect, it } from 'vitest'
import {
  SOCIAL_NAMESPACE,
  SocialActorSchema,
  SocialContentSchema,
  SocialConversationSchema,
  SocialImportArchiveSchema,
  SocialImportJobSchema,
  SocialImportRunSchema,
  SocialInteractionSchema,
  SocialMessageSchema,
  SocialSourceRecordSchema,
  socialSchemas
} from '../schemas'

type SchemaLike = {
  schema: {
    properties: Array<{ name: string }>
  }
}

function propertyNames(schema: SchemaLike): string[] {
  return schema.schema.properties.map((property) => property.name)
}

describe('social schemas', () => {
  it('defines every canonical social schema under the social namespace', () => {
    expect(socialSchemas.map((schema) => schema.schema['@id'])).toEqual([
      `${SOCIAL_NAMESPACE}SocialImportArchive@1.0.0`,
      `${SOCIAL_NAMESPACE}SocialImportRun@1.0.0`,
      `${SOCIAL_NAMESPACE}SocialImportJob@1.0.0`,
      `${SOCIAL_NAMESPACE}SocialSourceRecord@1.0.0`,
      `${SOCIAL_NAMESPACE}SocialActor@1.0.0`,
      `${SOCIAL_NAMESPACE}SocialIdentityClaim@1.0.0`,
      `${SOCIAL_NAMESPACE}SocialContent@1.0.0`,
      `${SOCIAL_NAMESPACE}SocialInteraction@1.0.0`,
      `${SOCIAL_NAMESPACE}SocialConversation@1.0.0`,
      `${SOCIAL_NAMESPACE}SocialMessage@1.0.0`,
      `${SOCIAL_NAMESPACE}SocialCollection@1.0.0`,
      `${SOCIAL_NAMESPACE}SocialCollectionItem@1.0.0`
    ])
  })

  it('uses source provenance schemas for archives, runs, and source records', () => {
    expect(propertyNames(SocialImportArchiveSchema)).toContain('archiveHash')
    expect(propertyNames(SocialImportRunSchema)).toContain('selectedBucketsJson')
    expect(propertyNames(SocialImportJobSchema)).toContain('checkpointJson')
    expect(propertyNames(SocialSourceRecordSchema)).toContain('sourceRecordHash')
  })

  it('separates actors, content, interactions, conversations, and messages', () => {
    expect(propertyNames(SocialActorSchema)).toContain('platformActorId')
    expect(propertyNames(SocialContentSchema)).toContain('platformContentKind')
    expect(propertyNames(SocialInteractionSchema)).toContain('platformInteractionKind')
    expect(propertyNames(SocialConversationSchema)).toContain('participantActorIdsJson')
    expect(propertyNames(SocialMessageSchema)).toContain('messageKind')
  })
})
