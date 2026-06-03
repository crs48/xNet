import type { DID } from '../node'
import { describe, expect, it } from 'vitest'
import {
  AbuseReportSchema,
  AppealSchema,
  CommunityNoteSchema,
  ContentProvenanceSchema,
  ModerationLabelSchema,
  NoteRatingSchema,
  PolicyListSchema,
  PolicySubscriptionSchema,
  QualitySignalSchema,
  ReviewTaskSchema
} from './moderation'
import { builtInSchemas } from './index'

describe('moderation schemas', () => {
  const testDID = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK' as DID
  const target = 'page-abc123'
  const allowRoles = (expr: unknown): readonly string[] => {
    expect(expr).toMatchObject({ _tag: 'allow' })
    return (expr as { _tag: 'allow'; roles: readonly string[] }).roles
  }

  const examples = [
    {
      name: 'AbuseReport',
      versionedIri: 'xnet://xnet.fyi/AbuseReport@1.0.0',
      legacyIri: 'xnet://xnet.fyi/AbuseReport',
      create: () =>
        AbuseReportSchema.create(
          {
            target,
            reporter: testDID,
            category: 'spam',
            reason: 'Repeated promotional replies',
            evidenceRefs: JSON.stringify(['comment-1'])
          },
          { createdBy: testDID }
        ),
      validate: AbuseReportSchema.validate
    },
    {
      name: 'ModerationLabel',
      versionedIri: 'xnet://xnet.fyi/ModerationLabel@1.0.0',
      legacyIri: 'xnet://xnet.fyi/ModerationLabel',
      create: () =>
        ModerationLabelSchema.create(
          {
            target,
            value: 'spam',
            sourceDID: testDID,
            sourceType: 'policy-list',
            confidence: 0.92,
            sourceWeight: 2,
            evidenceRefs: JSON.stringify(['report-1']),
            signedEnvelope: 'signed-label-envelope'
          },
          { createdBy: testDID }
        ),
      validate: ModerationLabelSchema.validate
    },
    {
      name: 'PolicyList',
      versionedIri: 'xnet://xnet.fyi/PolicyList@1.0.0',
      legacyIri: 'xnet://xnet.fyi/PolicyList',
      create: () =>
        PolicyListSchema.create(
          {
            title: 'Local spam denylist',
            publisher: testDID,
            scope: 'hub',
            entries: JSON.stringify([{ value: 'spam', action: 'hide' }]),
            labelers: [testDID],
            reviewers: [testDID],
            operators: [testDID]
          },
          { createdBy: testDID }
        ),
      validate: PolicyListSchema.validate
    },
    {
      name: 'PolicySubscription',
      versionedIri: 'xnet://xnet.fyi/PolicySubscription@1.0.0',
      legacyIri: 'xnet://xnet.fyi/PolicySubscription',
      create: () =>
        PolicySubscriptionSchema.create(
          {
            policyList: 'policy-list-1',
            subscriber: testDID,
            scope: 'workspace',
            trust: 0.7,
            maxLabelsPerHour: 500
          },
          { createdBy: testDID }
        ),
      validate: PolicySubscriptionSchema.validate
    },
    {
      name: 'CommunityNote',
      versionedIri: 'xnet://xnet.fyi/CommunityNote@1.0.0',
      legacyIri: 'xnet://xnet.fyi/CommunityNote',
      create: () =>
        CommunityNoteSchema.create(
          {
            target,
            author: testDID,
            body: 'This claim needs more context.',
            claim: 'The cited source does not support the headline.',
            citations: JSON.stringify(['https://example.com/source'])
          },
          { createdBy: testDID }
        ),
      validate: CommunityNoteSchema.validate
    },
    {
      name: 'NoteRating',
      versionedIri: 'xnet://xnet.fyi/NoteRating@1.0.0',
      legacyIri: 'xnet://xnet.fyi/NoteRating',
      create: () =>
        NoteRatingSchema.create(
          {
            note: 'note-1',
            rater: testDID,
            helpfulness: 'helpful',
            confidence: 0.8,
            reason: 'The citation directly addresses the claim.'
          },
          { createdBy: testDID }
        ),
      validate: NoteRatingSchema.validate
    },
    {
      name: 'QualitySignal',
      versionedIri: 'xnet://xnet.fyi/QualitySignal@1.0.0',
      legacyIri: 'xnet://xnet.fyi/QualitySignal',
      create: () =>
        QualitySignalSchema.create(
          {
            target,
            sourceDID: testDID,
            sourceType: 'local-ai',
            signal: 'citation-coverage',
            score: 0.35,
            confidence: 0.75,
            modelProvider: 'local',
            modelName: 'deterministic-citation-checker'
          },
          { createdBy: testDID }
        ),
      validate: QualitySignalSchema.validate
    },
    {
      name: 'ContentProvenance',
      versionedIri: 'xnet://xnet.fyi/ContentProvenance@1.0.0',
      legacyIri: 'xnet://xnet.fyi/ContentProvenance',
      create: () =>
        ContentProvenanceSchema.create(
          {
            target,
            sourceUrl: 'https://example.com/article',
            sourceDID: testDID,
            sourceType: 'mixed',
            aiGenerated: true,
            modelProvider: 'example-provider',
            modelName: 'summarizer',
            toolchain: JSON.stringify(['crawler', 'summarizer'])
          },
          { createdBy: testDID }
        ),
      validate: ContentProvenanceSchema.validate
    },
    {
      name: 'Appeal',
      versionedIri: 'xnet://xnet.fyi/Appeal@1.0.0',
      legacyIri: 'xnet://xnet.fyi/Appeal',
      create: () =>
        AppealSchema.create(
          {
            target,
            decision: 'label-1',
            appellant: testDID,
            reason: 'This is a false positive.'
          },
          { createdBy: testDID }
        ),
      validate: AppealSchema.validate
    },
    {
      name: 'ReviewTask',
      versionedIri: 'xnet://xnet.fyi/ReviewTask@1.0.0',
      legacyIri: 'xnet://xnet.fyi/ReviewTask',
      create: () =>
        ReviewTaskSchema.create(
          {
            target,
            decision: 'label-1',
            queue: 'safety',
            priority: 80,
            reasonCodes: JSON.stringify(['trusted-abuse-label'])
          },
          { createdBy: testDID }
        ),
      validate: ReviewTaskSchema.validate
    }
  ] as const

  it.each(examples)('creates and validates $name nodes', ({ create, validate, versionedIri }) => {
    const node = create()

    expect(node.schemaId).toBe(versionedIri)
    expect(validate(node)).toEqual({ valid: true, errors: [] })
  })

  it.each(examples)(
    'registers $name in built-in schema aliases',
    async ({ legacyIri, versionedIri }) => {
      const versioned = await builtInSchemas[versionedIri]()
      const legacy = await builtInSchemas[legacyIri]()

      expect(versioned.schema['@id']).toBe(versionedIri)
      expect(legacy.schema['@id']).toBe(versionedIri)
    }
  )

  it('bounds label confidence between zero and one', () => {
    const invalid = {
      ...ModerationLabelSchema.create(
        {
          target,
          value: 'spam',
          sourceDID: testDID,
          sourceType: 'user',
          confidence: 0.5,
          sourceWeight: 1
        },
        { createdBy: testDID }
      ),
      confidence: 1.1
    }

    const result = ModerationLabelSchema.validate(invalid)

    expect(result.valid).toBe(false)
    expect(result.errors.map((error) => error.path)).toContain('confidence')
  })

  it('defines role-specific authorization for moderation workflows', () => {
    expect(ModerationLabelSchema.schema.authorization?.roles.operator).toEqual({
      _tag: 'property',
      propertyName: 'operators'
    })
    expect(ModerationLabelSchema.schema.authorization?.roles.labeler).toEqual({
      _tag: 'property',
      propertyName: 'labelers'
    })
    expect(allowRoles(ModerationLabelSchema.schema.authorization?.actions.write)).toEqual([
      'owner',
      'operator',
      'labeler',
      'reviewer',
      'source'
    ])
    expect(PolicyListSchema.schema.authorization?.roles.publisher).toEqual({
      _tag: 'property',
      propertyName: 'publisher'
    })
    expect(PolicyListSchema.schema.authorization?.roles.policyPublisher).toEqual({
      _tag: 'property',
      propertyName: 'publishers'
    })
    expect(allowRoles(PolicyListSchema.schema.authorization?.actions.share)).toContain('publisher')
    expect(allowRoles(PolicyListSchema.schema.authorization?.actions.share)).toContain(
      'policyPublisher'
    )
    expect(AppealSchema.schema.authorization?.roles.appellant).toEqual({
      _tag: 'property',
      propertyName: 'appellant'
    })
    expect(allowRoles(AppealSchema.schema.authorization?.actions.write)).toContain('appellant')
    expect(allowRoles(AppealSchema.schema.authorization?.actions.write)).toContain('reviewer')
    expect(ReviewTaskSchema.schema.authorization?.roles.assignee).toEqual({
      _tag: 'property',
      propertyName: 'assignedTo'
    })
    expect(allowRoles(ReviewTaskSchema.schema.authorization?.actions.write)).toContain('assignee')
    expect(allowRoles(ReviewTaskSchema.schema.authorization?.actions.write)).toContain('reviewer')
  })
})
