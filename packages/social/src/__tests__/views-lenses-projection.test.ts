import { validateSavedViewDescriptor } from '@xnetjs/data'
import { describe, expect, it } from 'vitest'
import {
  createDefaultSocialGraphLenses,
  createDefaultSocialSavedViews,
  createIgnoredSourceRecord,
  createLargeArchiveStoragePlan,
  createSocialCanvasProjectionPlan,
  createSocialImportTelemetryEvents,
  createSourceRecord,
  createStagingSummary,
  SocialActorSchema,
  SocialContentSchema,
  type ArchiveEntryRef,
  type StagedSocialRecord
} from '..'

function entry(path: string, byteSize = 1024): ArchiveEntryRef {
  return {
    path,
    byteSize,
    compressedByteSize: byteSize,
    sha256: `hash-${path}`
  }
}

describe('social saved views', () => {
  it('creates platform-neutral saved view descriptors for core social tables', () => {
    const views = createDefaultSocialSavedViews({ pageSize: 25 })

    expect(views.map((view) => view.id)).toEqual([
      'social.people',
      'social.content',
      'social.interactions',
      'social.messages',
      'social.collections',
      'social.import-runs'
    ])

    for (const view of views) {
      expect(validateSavedViewDescriptor(view.descriptor).valid).toBe(true)
      expect(view.savedViewProperties.descriptor).toContain('"version":1')
    }
  })
})

describe('social graph lenses', () => {
  it('creates the starter graph lenses as valid dashboard query sets', () => {
    const lenses = createDefaultSocialGraphLenses({ pageSize: 50 })

    expect(lenses.map((lens) => lens.id)).toEqual([
      'social.lens.people-i-follow',
      'social.lens.saved-content-by-creator',
      'social.lens.conversation-references',
      'social.lens.ai-citations'
    ])

    for (const lens of lenses) {
      expect(lens.descriptor.query.kind).toBe('query-set')
      expect(lens.descriptor.query.mode).toBe('dashboard')
      expect(validateSavedViewDescriptor(lens.descriptor).valid).toBe(true)
      expect(lens.edgeRules.length).toBeGreaterThan(0)
    }
  })
})

describe('social canvas projections', () => {
  it('creates bounded source-backed canvas node and edge drafts', () => {
    const plan = createSocialCanvasProjectionPlan({
      options: {
        title: 'People I Follow',
        lensId: 'social.lens.people-i-follow',
        maxNodes: 2,
        maxEdges: 1,
        columns: 2
      },
      nodes: [
        {
          id: 'actor:self',
          schemaId: SocialActorSchema._schemaId,
          kind: 'actor',
          title: 'Self',
          platform: 'instagram'
        },
        {
          id: 'actor:creator',
          schemaId: SocialActorSchema._schemaId,
          kind: 'actor',
          title: 'Creator',
          platform: 'instagram'
        },
        {
          id: 'content:ignored',
          schemaId: SocialContentSchema._schemaId,
          kind: 'content',
          title: 'Outside bound'
        }
      ],
      edges: [
        {
          sourceId: 'actor:self',
          targetId: 'actor:creator',
          relationshipKind: 'follows'
        },
        {
          sourceId: 'actor:creator',
          targetId: 'content:ignored',
          relationshipKind: 'authored'
        }
      ]
    })

    expect(plan.commandId).toBe('social.canvasProjection.create')
    expect(plan.nodeCount).toBe(2)
    expect(plan.edgeCount).toBe(1)
    expect(plan.omittedNodeCount).toBe(1)
    expect(plan.nodes[0].sourceNodeId).toBe('actor:self')
    expect(plan.nodes[0].sourceSchemaId).toBe(SocialActorSchema._schemaId)
    expect(plan.edges[0].relationship.properties.socialRelationshipKind).toBe('follows')
  })
})

describe('social import telemetry', () => {
  it('emits local counters without raw content, source paths, handles, or URLs', () => {
    const source = entry('private/messages/message_1.json')
    const records: StagedSocialRecord[] = [
      createSourceRecord({
        archiveId: 'archive',
        importRunId: 'run',
        platform: 'instagram',
        bucketId: 'instagram.messages',
        source,
        sourceRecordKind: 'message',
        sourceRecordId: 'message-1',
        payload: {
          content: 'private text that must not be logged',
          href: 'https://example.invalid/private'
        },
        privacyClass: 'third-party-private',
        warnings: ['encoding:mojibake']
      }),
      createIgnoredSourceRecord({
        archiveId: 'archive',
        importRunId: 'run',
        platform: 'instagram',
        bucketId: 'instagram.account',
        source: entry('account/security.json'),
        sourceRecordKind: 'account-metadata',
        sourceRecordId: 'account',
        payload: { session: 'secret' },
        privacyClass: 'account-security',
        ignoredReason: 'sensitive account metadata'
      })
    ]

    const events = createSocialImportTelemetryEvents({
      adapterId: 'instagram',
      adapterVersion: '1.0.0',
      platform: 'instagram',
      stagedRecords: records,
      stagingSummary: createStagingSummary(records),
      storagePlan: createLargeArchiveStoragePlan({
        filename: 'sample.zip',
        byteSize: 423_000_000,
        entries: [source]
      }),
      stageDurationMs: 123,
      commitDurationMs: 45,
      commitSummary: { created: 2, updated: 1, unchanged: 0 },
      createdAt: '2026-06-06T00:00:00.000Z'
    })
    const serialized = JSON.stringify(events)

    expect(events.some((event) => event.metric === 'social.import.stage.records')).toBe(true)
    expect(serialized).not.toContain('private text')
    expect(serialized).not.toContain('https://example.invalid/private')
    expect(serialized).not.toContain('private/messages/message_1.json')
    expect(serialized).not.toContain('secret')
  })

  it('keeps source record provenance stable across adapter version restaging', () => {
    const base = {
      archiveId: 'archive',
      platform: 'grok' as const,
      bucketId: 'grok.conversations',
      source: entry('prod-grok-backend.json'),
      sourceRecordKind: 'conversation' as const,
      sourceRecordId: 'conversation-1',
      payload: { id: 'conversation-1', title: 'Example' },
      privacyClass: 'private' as const
    }
    const v1 = createSourceRecord({ ...base, importRunId: 'run-v1' })
    const v2 = createSourceRecord({ ...base, importRunId: 'run-v2' })

    expect(v1.deterministicId).toBe(v2.deterministicId)
    expect(v1.sourceRecordHash).toBe(v2.sourceRecordHash)
    expect(v1.properties.importRun).toBe('run-v1')
    expect(v2.properties.importRun).toBe('run-v2')
  })
})
