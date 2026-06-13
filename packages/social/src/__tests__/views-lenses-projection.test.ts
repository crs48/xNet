import { validateSavedViewDescriptor } from '@xnetjs/data'
import { describe, expect, it } from 'vitest'
import {
  createDefaultSocialFeedViews,
  createDefaultSocialGraphLenses,
  createDefaultSocialGraphAtlas,
  createDefaultSocialSavedViews,
  createDefaultSocialWorkspaceSavedViewSeeds,
  createIgnoredSourceRecord,
  createLargeArchiveStoragePlan,
  createSocialCanvasProjectionPlan,
  createSocialImportTelemetryEvents,
  createSourceRecord,
  createStagingSummary,
  recommendSocialAnalyticsCache,
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

  it('creates graph atlas metadata for starter lenses', () => {
    const atlas = createDefaultSocialGraphAtlas({ pageSize: 50 })

    expect(atlas.map((entry) => entry.id)).toEqual([
      'social.lens.people-i-follow',
      'social.lens.saved-content-by-creator',
      'social.lens.conversation-references',
      'social.lens.ai-citations'
    ])
    expect(atlas[0]).toMatchObject({
      title: 'People I Follow',
      primaryQueryId: 'follows',
      queryCount: 2,
      relationshipKinds: ['follows']
    })
    expect(atlas.every((entry) => entry.nodeRoles.length > 0)).toBe(true)
    expect(atlas.every((entry) => entry.edgeRules.length > 0)).toBe(true)
  })
})

describe('social feed views', () => {
  it('creates platform feed descriptors that open in feed presentation', () => {
    const feeds = createDefaultSocialFeedViews({ pageSize: 50 })

    expect(feeds.map((feed) => feed.id)).toEqual([
      'social.feed.youtube-videos',
      'social.feed.youtube-playlists',
      'social.feed.instagram-saved',
      'social.feed.instagram-likes'
    ])

    for (const feed of feeds) {
      expect(validateSavedViewDescriptor(feed.descriptor).valid).toBe(true)
      expect(feed.descriptor.presentation).toEqual({
        mode: 'feed',
        feedLayout: 'grid',
        feedDensity: 'cozy'
      })
      expect(JSON.parse(feed.savedViewProperties.descriptor).presentation).toEqual(
        feed.descriptor.presentation
      )
    }
  })
})

describe('social workspace seeds', () => {
  it('creates deterministic saved-view seeds for schema views and graph lenses', () => {
    const seeds = createDefaultSocialWorkspaceSavedViewSeeds({
      workspaceId: 'workspace-a',
      pageSize: 20
    })
    const repeated = createDefaultSocialWorkspaceSavedViewSeeds({
      workspaceId: 'workspace-a',
      pageSize: 20
    })

    expect(seeds.map((seed) => seed.id)).toEqual([
      'social.people',
      'social.content',
      'social.interactions',
      'social.messages',
      'social.collections',
      'social.import-runs',
      'social.feed.youtube-videos',
      'social.feed.youtube-playlists',
      'social.feed.instagram-saved',
      'social.feed.instagram-likes',
      'social.lens.people-i-follow',
      'social.lens.saved-content-by-creator',
      'social.lens.conversation-references',
      'social.lens.ai-citations'
    ])
    expect(seeds.map((seed) => seed.deterministicId)).toEqual(
      repeated.map((seed) => seed.deterministicId)
    )
    expect(seeds.filter((seed) => seed.seedKind === 'schema-view')).toHaveLength(6)
    expect(seeds.filter((seed) => seed.seedKind === 'feed-view')).toHaveLength(4)
    expect(seeds.filter((seed) => seed.seedKind === 'graph-lens')).toHaveLength(4)

    for (const seed of seeds) {
      expect(validateSavedViewDescriptor(seed.descriptor).valid).toBe(true)
      expect(seed.savedViewProperties.descriptor).toBe(seed.descriptorJson)
      expect(JSON.parse(seed.descriptorJson)).toMatchObject({ version: 1 })
    }
  })
})

describe('social analytics cache recommendation', () => {
  it('keeps small workspaces on materialized saved-view caches', () => {
    expect(recommendSocialAnalyticsCache({ rowCount: 12_000 }).strategy).toBe(
      'materialized-facet-cache'
    )
  })

  it('recommends a worker columnar cache before DuckDB-Wasm', () => {
    expect(recommendSocialAnalyticsCache({ rowCount: 70_000, columnCount: 12 }).strategy).toBe(
      'columnar-worker-cache'
    )
  })

  it('promotes very large local analytics to DuckDB-Wasm evaluation', () => {
    expect(recommendSocialAnalyticsCache({ rowCount: 600_000, columnCount: 16 }).strategy).toBe(
      'duckdb-wasm-candidate'
    )
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
          platform: 'instagram',
          privacyClass: 'third-party-private'
        },
        {
          id: 'actor:creator',
          schemaId: SocialActorSchema._schemaId,
          kind: 'actor',
          title: 'Creator',
          platform: 'instagram',
          privacyClass: 'public'
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
          targetId: 'actor:self',
          relationshipKind: 'related'
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
    expect(plan.omittedEdgeCount).toBe(1)
    expect(plan.nodes[0].type).toBe('external-reference')
    expect(plan.nodes[0].sourceNodeId).toBe('actor:self')
    expect(plan.nodes[0].sourceSchemaId).toBe(SocialActorSchema._schemaId)
    expect(plan.nodes[0].properties.sourceCardRole).toBe('social-projection')
    expect(plan.nodes[0].properties.privacyClass).toBe('third-party-private')
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
      commitBatchMetrics: {
        timings: {
          preflightMs: 11,
          materializeMs: 22,
          applyMs: 33,
          notifyMs: 4,
          totalMs: 70
        },
        storage: {
          nodeRowsWritten: 3,
          propertyRowsWritten: 9,
          changeRowsWritten: 3,
          scalarRowsWritten: 6,
          ftsRowsWritten: 2
        }
      },
      createdAt: '2026-06-06T00:00:00.000Z'
    })
    const serialized = JSON.stringify(events)

    expect(events.some((event) => event.metric === 'social.import.stage.records')).toBe(true)
    expect(events.some((event) => event.metric === 'social.import.commit.apply_duration')).toBe(
      true
    )
    expect(
      events.some((event) => event.metric === 'social.import.commit.property_rows_written')
    ).toBe(true)
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
