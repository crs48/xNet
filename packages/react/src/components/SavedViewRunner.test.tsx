/**
 * @xnetjs/react - Tests for saved view result rendering.
 */

import type { SavedViewQueryResult } from '../hooks/useSavedView'
import type { QueryASTNodeQuery, SavedViewDescriptor } from '@xnetjs/data'
import type { ReactNode } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useSavedView } from '../hooks/useSavedView'
import {
  createSavedViewLensDraft,
  deriveCachedSavedViewDateBucketSummaries,
  deriveCachedSavedViewFacetSummaries,
  deriveSavedViewGraphLensNodes,
  deriveSavedViewDateBucketSummaries,
  deriveSavedViewFacetSummaries,
  deriveSavedViewColumns,
  deriveSavedViewPrivacyChips,
  deriveSavedViewRowInspector,
  filterSavedViewRowsByDateBrush,
  filterSavedViewRowsByFacets,
  formatSavedViewCellValue,
  getSavedViewSensitiveResultWarning,
  SavedViewRunner,
  SavedViewResultTable
} from './SavedViewRunner'

vi.mock('../hooks/useSavedView', () => ({
  useSavedView: vi.fn()
}))

function createQueryResult(overrides: Partial<SavedViewQueryResult> = {}): SavedViewQueryResult {
  return {
    queryId: 'primary',
    rowRole: 'Social Content',
    schemaId: 'xnet://schema/social/content',
    schemaName: 'Social Content',
    data: [
      {
        id: 'row-1',
        schemaId: 'xnet://schema/social/content',
        createdAt: 1,
        createdBy: 'did:key:test',
        updatedAt: 1,
        updatedBy: 'did:key:test',
        deleted: false,
        title: 'Launch post',
        platform: 'instagram',
        metadata: { source: 'archive' }
      }
    ],
    status: 'success',
    loading: false,
    error: null,
    pageInfo: {
      totalCount: 1,
      countMode: 'estimate',
      hasMore: false,
      hasNextPage: false,
      hasPreviousPage: false,
      loadedCount: 1
    },
    totalCount: 1,
    hasMore: false,
    plan: null,
    metadata: null,
    plannerGate: {
      validation: { valid: true, errors: [] },
      relationIndexRequirements: [],
      aggregatePlans: [],
      useFindReady: true,
      blockers: []
    },
    blockers: [],
    warnings: [],
    canExecute: true,
    aggregates: null,
    privacy: {
      counts: {},
      sensitiveCount: 0
    },
    ...overrides
  }
}

describe('SavedViewRunner helpers', () => {
  it('derives preferred columns and hides system columns', () => {
    const columns = deriveSavedViewColumns([
      {
        id: 'row-1',
        title: 'Post',
        platform: 'instagram',
        deleted: false,
        _schemaVersion: 1,
        customField: 'value'
      }
    ])

    expect(columns).toEqual(['title', 'platform', 'id', 'customField'])
  })

  it('formats complex values for read-only table cells', () => {
    expect(formatSavedViewCellValue('tags', ['a', 'b'])).toBe('2 items')
    expect(formatSavedViewCellValue('metadata', { source: 'archive' })).toBe('{"source":"archive"}')
  })

  it('derives loaded-row facet counts for low-cardinality fields', () => {
    const facets = deriveSavedViewFacetSummaries(
      [
        { id: 'row-1', platform: 'instagram', privacyClass: 'public', title: 'One' },
        { id: 'row-2', platform: 'instagram', privacyClass: 'public', title: 'Two' },
        { id: 'row-3', platform: 'youtube', privacyClass: 'private', title: 'Three' }
      ],
      ['title', 'platform', 'privacyClass']
    )

    expect(facets[0]).toMatchObject({
      field: 'platform',
      values: [
        { valueKey: 'string:instagram', label: 'instagram', count: 2 },
        { valueKey: 'string:youtube', label: 'youtube', count: 1 }
      ]
    })
    expect(facets.find((facet) => facet.field === 'title')).toBeUndefined()
  })

  it('caches loaded-row facet counts and invalidates changed row versions', () => {
    const rows = [
      { id: 'row-1', updatedAt: 1, platform: 'instagram' },
      { id: 'row-2', updatedAt: 1, platform: 'youtube' }
    ]
    const input = {
      rows,
      columns: ['platform'],
      identity: { queryId: 'content', schemaId: 'xnet://schema/social/content' }
    }

    const first = deriveCachedSavedViewFacetSummaries(input)
    const second = deriveCachedSavedViewFacetSummaries(input)
    const changed = deriveCachedSavedViewFacetSummaries({
      ...input,
      rows: [{ id: 'row-1', updatedAt: 2, platform: 'instagram' }, rows[1]]
    })

    expect(second).toBe(first)
    expect(changed).not.toBe(first)
  })

  it('filters loaded rows by selected facet value keys', () => {
    const rows = [
      { id: 'row-1', platform: 'instagram', privacyClass: 'public' },
      { id: 'row-2', platform: 'youtube', privacyClass: 'public' },
      { id: 'row-3', platform: 'youtube', privacyClass: 'private' }
    ]

    expect(
      filterSavedViewRowsByFacets(rows, {
        platform: ['string:youtube'],
        privacyClass: ['string:public']
      })
    ).toEqual([{ id: 'row-2', platform: 'youtube', privacyClass: 'public' }])
  })

  it('derives date buckets for date-like fields', () => {
    const firstDay = Date.UTC(2024, 0, 1)
    const secondDay = Date.UTC(2024, 0, 2)
    const buckets = deriveSavedViewDateBucketSummaries(
      [
        { id: 'row-1', publishedAt: firstDay + 1000 },
        { id: 'row-2', publishedAt: firstDay + 2000 },
        { id: 'row-3', publishedAt: secondDay + 1000 }
      ],
      ['id', 'publishedAt']
    )

    expect(buckets[0]).toMatchObject({
      field: 'publishedAt',
      interval: 'day',
      buckets: [
        { bucketKey: `day:${firstDay}`, count: 2 },
        { bucketKey: `day:${secondDay}`, count: 1 }
      ]
    })
  })

  it('caches loaded-row date buckets and invalidates changed row versions', () => {
    const firstDay = Date.UTC(2024, 0, 1)
    const rows = [
      { id: 'row-1', updatedAt: 1, publishedAt: firstDay + 1000 },
      { id: 'row-2', updatedAt: 1, publishedAt: firstDay + 2000 }
    ]
    const input = {
      rows,
      columns: ['publishedAt'],
      identity: { queryId: 'content', schemaId: 'xnet://schema/social/content' }
    }

    const first = deriveCachedSavedViewDateBucketSummaries(input)
    const second = deriveCachedSavedViewDateBucketSummaries(input)
    const changed = deriveCachedSavedViewDateBucketSummaries({
      ...input,
      rows: [{ id: 'row-1', updatedAt: 2, publishedAt: firstDay + 1000 }, rows[1]]
    })

    expect(second).toBe(first)
    expect(changed).not.toBe(first)
  })

  it('filters loaded rows by selected date brush buckets', () => {
    const firstDay = Date.UTC(2024, 0, 1)
    const secondDay = Date.UTC(2024, 0, 2)
    const rows = [
      { id: 'row-1', publishedAt: firstDay + 1000 },
      { id: 'row-2', publishedAt: secondDay + 1000 }
    ]

    expect(
      filterSavedViewRowsByDateBrush(rows, {
        field: 'publishedAt',
        bucketKeys: [`day:${secondDay}`]
      })
    ).toEqual([{ id: 'row-2', publishedAt: secondDay + 1000 }])
  })

  it('builds row inspector sections for fields, relations, sources, and imports', () => {
    const model = deriveSavedViewRowInspector(
      {
        id: 'row-1',
        schemaId: 'xnet://schema/social/content',
        title: 'Launch post',
        contentKind: 'video',
        actorId: 'actor-1',
        conversation: 'conversation-1',
        sourceRecordId: 'source-1',
        externalRefsJson: '[{"url":"https://example.com"}]',
        platform: 'youtube',
        importRunId: 'run-1',
        importedAt: Date.UTC(2024, 0, 1)
      },
      createQueryResult()
    )

    expect(model.rowRole).toBe('Social Content')
    expect(model.fields.map((item) => item.key)).toEqual(['title', 'contentKind'])
    expect(model.relations.map((item) => item.key)).toEqual(['actorId', 'conversation'])
    expect(model.sourceRecords.map((item) => item.key)).toEqual([
      'sourceRecordId',
      'platform',
      'externalRefsJson'
    ])
    expect(model.importRuns.map((item) => item.key)).toEqual(['importRunId', 'importedAt'])
    expect(model.rawJson).toContain('"sourceRecordId": "source-1"')
  })

  it('derives privacy chips and sensitive result warning copy', () => {
    const query = createQueryResult({
      privacy: {
        counts: {
          public: 3,
          private: 2,
          'account-security': 1,
          unknown: 1
        },
        sensitiveCount: 3
      }
    })

    const chips = deriveSavedViewPrivacyChips(query)

    expect(chips.map((chip) => chip.privacyClass)).toEqual([
      'public',
      'private',
      'account-security',
      'unknown'
    ])
    expect(chips.find((chip) => chip.privacyClass === 'public')).toMatchObject({
      label: 'Public',
      tone: 'safe'
    })
    expect(chips.find((chip) => chip.privacyClass === 'private')).toMatchObject({
      label: 'Private',
      tone: 'warning'
    })
    expect(chips.find((chip) => chip.privacyClass === 'unknown')).toMatchObject({
      label: 'Unknown',
      tone: 'neutral'
    })
    expect(getSavedViewSensitiveResultWarning(query)).toBe(
      '3 loaded rows include non-public privacy classes.'
    )
    expect(getSavedViewSensitiveResultWarning(createQueryResult())).toBeNull()
  })

  it('creates saved lens descriptors from selected facets and timeline buckets', () => {
    const firstDay = Date.UTC(2024, 0, 1)
    const descriptor: SavedViewDescriptor = {
      version: 1,
      title: 'Content',
      scope: 'workspace',
      query: {
        version: 1,
        kind: 'node',
        schemaId: 'xnet://schema/social/content',
        page: { first: 100, count: 'estimate' }
      }
    }
    const draft = createSavedViewLensDraft({
      descriptor,
      queryId: 'primary',
      query: createQueryResult({
        data: [
          {
            id: 'row-1',
            schemaId: 'xnet://schema/social/content',
            createdAt: 1,
            createdBy: 'did:key:test',
            updatedAt: 1,
            updatedBy: 'did:key:test',
            deleted: false,
            title: 'Video',
            platform: 'youtube',
            publishedAt: firstDay + 1000
          }
        ]
      }),
      facetSelection: { platform: ['string:youtube'] },
      dateBrushSelection: { field: 'publishedAt', bucketKeys: [`day:${firstDay}`] },
      sortField: 'publishedAt',
      sortDirection: 'desc',
      pageSize: 50,
      title: 'Content',
      description: null
    })

    expect(draft?.title).toBe('Content Lens')
    expect(draft?.description).toContain('platform facets')
    expect(draft?.stateSummary).toMatchObject({
      facetFields: ['platform'],
      dateField: 'publishedAt',
      dateBucketCount: 1,
      sortField: 'publishedAt',
      sortDirection: 'desc',
      pageSize: 50
    })

    const query = draft?.descriptor.query as QueryASTNodeQuery
    expect(query.orderBy).toEqual([{ field: 'publishedAt', direction: 'desc' }])
    expect(query.page).toMatchObject({ first: 50, offset: 0, count: 'estimate' })
    expect(query.predicate).toMatchObject({
      kind: 'and',
      predicates: [
        { kind: 'comparison', field: 'platform', op: 'in', values: ['youtube'] },
        {
          kind: 'comparison',
          field: 'publishedAt',
          op: 'between',
          values: [firstDay, firstDay + 86_400_000 - 1]
        }
      ]
    })
  })

  it('derives graph lens nodes from source-backed rows', () => {
    const query = createQueryResult({
      queryId: 'actors',
      rowRole: 'Social Actor',
      schemaId: 'xnet://schema/social/actor',
      schemaName: 'Social Actor',
      data: [
        {
          id: 'actor-1',
          schemaId: 'xnet://schema/social/actor',
          createdAt: 1,
          createdBy: 'did:key:test',
          updatedAt: 1,
          updatedBy: 'did:key:test',
          deleted: false,
          displayName: 'Ada Lovelace',
          platform: 'instagram',
          privacyClass: 'public',
          sourceRecordId: 'source-actor-1'
        }
      ]
    })

    expect(deriveSavedViewGraphLensNodes(query)).toEqual([
      {
        queryId: 'actors',
        rowId: 'actor-1',
        label: 'Ada Lovelace',
        detail: 'instagram / public / source source-actor-1',
        rowRole: 'Social Actor',
        schemaId: 'xnet://schema/social/actor',
        privacyClass: 'public',
        sourceRecordId: 'source-actor-1'
      }
    ])
  })
})

/** Mock a saved view with one social-content row that renders as a visual card. */
function mockSingleContentCardView(): SavedViewDescriptor {
  const descriptor: SavedViewDescriptor = {
    version: 1,
    title: 'Content',
    scope: 'workspace',
    query: {
      version: 1,
      kind: 'node',
      schemaId: 'xnet://schema/social/content',
      page: { first: 25, count: 'estimate' }
    }
  }
  const query = createQueryResult({
    data: [
      {
        id: 'content-1',
        schemaId: 'xnet://schema/social/content',
        createdAt: 1,
        createdBy: 'did:key:test',
        updatedAt: 1,
        updatedBy: 'did:key:test',
        deleted: false,
        title: 'Saved video',
        platform: 'youtube',
        contentKind: 'video',
        canonicalUrl: 'https://www.youtube.com/watch?v=abc123',
        actorHandle: '@creator',
        privacyClass: 'public',
        visibility: 'public'
      }
    ]
  })

  vi.mocked(useSavedView).mockReturnValue({
    descriptor,
    validation: { valid: true, errors: [] },
    kind: 'node',
    status: 'success',
    loading: false,
    error: null,
    title: 'Content',
    description: 'Imported content',
    primaryQueryId: 'primary',
    queryIds: ['primary'],
    queries: { primary: query },
    primary: query,
    blockers: [],
    warnings: [],
    privacy: { counts: {}, sensitiveCount: 0 },
    reload: vi.fn()
  })
  return descriptor
}

describe('SavedViewRunner', () => {
  it('switches a saved view into visual card mode and inspects selected cards', async () => {
    const descriptor = mockSingleContentCardView()

    render(<SavedViewRunner descriptor={descriptor} registry={[]} />)

    fireEvent.click(screen.getByRole('button', { name: 'Cards' }))

    expect(screen.getByText('Visual Cards')).toBeTruthy()
    expect(await screen.findByText('Saved video')).toBeTruthy()
    expect((await screen.findAllByText('@creator')).length).toBeGreaterThan(0)

    fireEvent.keyDown(screen.getByLabelText('Preview Saved video'), { key: 'Enter' })

    const inspector = screen.getByText('Inspector').closest('aside')
    expect(inspector).toBeTruthy()
    expect(within(inspector as HTMLElement).getByText('content-1')).toBeTruthy()
  })

  it('wraps each visual card through wrapItem keyed by source node id (render-gate seam)', async () => {
    const descriptor = mockSingleContentCardView()
    const wrapItem = vi.fn((nodeId: string, content: ReactNode) => (
      <div data-testid={`gated-${nodeId}`}>{content}</div>
    ))
    render(<SavedViewRunner descriptor={descriptor} registry={[]} wrapItem={wrapItem} />)

    fireEvent.click(screen.getByRole('button', { name: 'Cards' }))
    expect(screen.getByText('Visual Cards')).toBeTruthy()

    // The card for content-1 is wrapped by the host's gate, keyed by its node id.
    const gated = await screen.findByTestId('gated-content-1')
    expect(within(gated).getByText('Saved video')).toBeTruthy()
    expect(wrapItem).toHaveBeenCalledWith('content-1', expect.anything())
  })

  it('switches timestamped rows into a visual timeline', async () => {
    const firstMonth = Date.UTC(2026, 0, 2)
    const descriptor: SavedViewDescriptor = {
      version: 1,
      title: 'Content',
      scope: 'workspace',
      query: {
        version: 1,
        kind: 'node',
        schemaId: 'xnet://schema/social/content',
        page: { first: 25, count: 'estimate' }
      }
    }
    const query = createQueryResult({
      data: [
        {
          id: 'content-1',
          schemaId: 'xnet://schema/social/content',
          createdAt: 1,
          createdBy: 'did:key:test',
          updatedAt: 1,
          updatedBy: 'did:key:test',
          deleted: false,
          title: 'Saved video',
          platform: 'youtube',
          contentKind: 'video',
          publishedAt: firstMonth,
          privacyClass: 'public'
        }
      ]
    })

    vi.mocked(useSavedView).mockReturnValue({
      descriptor,
      validation: { valid: true, errors: [] },
      kind: 'node',
      status: 'success',
      loading: false,
      error: null,
      title: 'Content',
      description: 'Imported content',
      primaryQueryId: 'primary',
      queryIds: ['primary'],
      queries: { primary: query },
      primary: query,
      blockers: [],
      warnings: [],
      privacy: {
        counts: {},
        sensitiveCount: 0
      },
      reload: vi.fn()
    })

    render(<SavedViewRunner descriptor={descriptor} registry={[]} />)

    fireEvent.click(screen.getByRole('button', { name: 'Timeline' }))

    expect(screen.getByText('Visual Timeline')).toBeTruthy()
    expect(await screen.findByText('Saved video')).toBeTruthy()
  })

  it('builds a source-backed canvas projection request from the visual canvas mode', async () => {
    const onOpenVisualCanvasProjection = vi.fn()
    const descriptor: SavedViewDescriptor = {
      version: 1,
      title: 'Content',
      scope: 'workspace',
      query: {
        version: 1,
        kind: 'node',
        schemaId: 'xnet://schema/social/content',
        page: { first: 25, count: 'estimate' }
      }
    }
    const query = createQueryResult({
      data: [
        {
          id: 'content-1',
          schemaId: 'xnet://schema/social/content',
          createdAt: 1,
          createdBy: 'did:key:test',
          updatedAt: 1,
          updatedBy: 'did:key:test',
          deleted: false,
          title: 'Creator post',
          platform: 'instagram',
          actorHandle: '@creator',
          authorActor: 'actor-1',
          privacyClass: 'public'
        },
        {
          id: 'content-2',
          schemaId: 'xnet://schema/social/content',
          createdAt: 1,
          createdBy: 'did:key:test',
          updatedAt: 1,
          updatedBy: 'did:key:test',
          deleted: false,
          title: 'Another creator post',
          platform: 'youtube',
          actorHandle: '@another',
          authorActor: 'actor-2',
          privacyClass: 'public'
        }
      ]
    })

    vi.mocked(useSavedView).mockReturnValue({
      descriptor,
      validation: { valid: true, errors: [] },
      kind: 'node',
      status: 'success',
      loading: false,
      error: null,
      title: 'Content',
      description: 'Imported content',
      primaryQueryId: 'primary',
      queryIds: ['primary'],
      queries: { primary: query },
      primary: query,
      blockers: [],
      warnings: [],
      privacy: {
        counts: {},
        sensitiveCount: 0
      },
      reload: vi.fn()
    })

    render(
      <SavedViewRunner
        descriptor={descriptor}
        registry={[]}
        onOpenVisualCanvasProjection={onOpenVisualCanvasProjection}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Canvas' }))
    fireEvent.click(screen.getByRole('button', { name: 'Creators' }))

    expect(screen.getByText('Canvas Projection')).toBeTruthy()
    expect(screen.getByText('Projected nodes')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Open as canvas' }))

    expect(onOpenVisualCanvasProjection).toHaveBeenCalledTimes(1)
    expect(onOpenVisualCanvasProjection.mock.calls[0]?.[0]).toMatchObject({
      sourceQueryId: 'primary',
      sourceSchemaId: 'xnet://schema/social/content',
      layout: {
        id: 'creator-clusters',
        projectionGroupBy: 'creator'
      },
      sourceNodeIds: ['content-2', 'content-1'],
      omittedNodeCount: 0,
      previewCount: 2
    })
  })

  it('renders relationship edges in graph mode and selects the source row', () => {
    const descriptor: SavedViewDescriptor = {
      version: 1,
      title: 'Content Graph',
      scope: 'workspace',
      query: {
        version: 1,
        kind: 'node',
        schemaId: 'xnet://schema/social/content',
        page: { first: 25, count: 'estimate' }
      }
    }
    const query = createQueryResult({
      data: [
        {
          id: 'content-1',
          schemaId: 'xnet://schema/social/content',
          createdAt: 1,
          createdBy: 'did:key:test',
          updatedAt: 1,
          updatedBy: 'did:key:test',
          deleted: false,
          title: 'Saved video',
          platform: 'youtube',
          authorActor: 'actor-1',
          actorHandle: '@creator',
          privacyClass: 'public'
        }
      ]
    })

    vi.mocked(useSavedView).mockReturnValue({
      descriptor,
      validation: { valid: true, errors: [] },
      kind: 'node',
      status: 'success',
      loading: false,
      error: null,
      title: 'Content Graph',
      description: 'Relationship view',
      primaryQueryId: 'primary',
      queryIds: ['primary'],
      queries: { primary: query },
      primary: query,
      blockers: [],
      warnings: [],
      privacy: {
        counts: {},
        sensitiveCount: 0
      },
      reload: vi.fn()
    })

    render(<SavedViewRunner descriptor={descriptor} registry={[]} />)

    fireEvent.click(screen.getByRole('button', { name: 'Graph' }))

    expect(screen.getByText('Graph Summary')).toBeTruthy()
    expect(screen.getByText('actor-1 (external)')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Saved video/i }))

    const inspector = screen.getByText('Inspector').closest('aside')
    expect(inspector).toBeTruthy()
    expect(within(inspector as HTMLElement).getByText('content-1')).toBeTruthy()
  })

  it('opens a selected graph lens source record in the shared inspector', () => {
    const descriptor: SavedViewDescriptor = {
      version: 1,
      title: 'People I Follow',
      scope: 'workspace',
      query: {
        version: 1,
        kind: 'query-set',
        mode: 'dashboard',
        queries: {
          actors: {
            version: 1,
            kind: 'node',
            schemaId: 'xnet://schema/social/actor',
            page: { first: 25, count: 'estimate' }
          },
          content: {
            version: 1,
            kind: 'node',
            schemaId: 'xnet://schema/social/content',
            page: { first: 25, count: 'estimate' }
          }
        }
      }
    }
    const actorQuery = createQueryResult({
      queryId: 'actors',
      rowRole: 'Social Actor',
      schemaId: 'xnet://schema/social/actor',
      schemaName: 'Social Actor',
      data: [
        {
          id: 'actor-1',
          schemaId: 'xnet://schema/social/actor',
          createdAt: 1,
          createdBy: 'did:key:test',
          updatedAt: 1,
          updatedBy: 'did:key:test',
          deleted: false,
          displayName: 'Ada Lovelace',
          handle: '@ada',
          platform: 'instagram',
          privacyClass: 'public',
          sourceRecordId: 'source-actor-1',
          importRunId: 'run-1'
        }
      ]
    })
    const contentQuery = createQueryResult({
      queryId: 'content',
      rowRole: 'Social Content',
      schemaId: 'xnet://schema/social/content',
      schemaName: 'Social Content',
      data: [
        {
          id: 'content-1',
          schemaId: 'xnet://schema/social/content',
          createdAt: 1,
          createdBy: 'did:key:test',
          updatedAt: 1,
          updatedBy: 'did:key:test',
          deleted: false,
          title: 'Saved video',
          platform: 'youtube',
          privacyClass: 'private',
          sourceRecordId: 'source-content-1'
        }
      ]
    })

    vi.mocked(useSavedView).mockReturnValue({
      descriptor,
      validation: { valid: true, errors: [] },
      kind: 'query-set',
      status: 'success',
      loading: false,
      error: null,
      title: 'People I Follow',
      description: 'Starter graph lens',
      primaryQueryId: 'actors',
      queryIds: ['actors', 'content'],
      queries: {
        actors: actorQuery,
        content: contentQuery
      },
      primary: actorQuery,
      blockers: [],
      warnings: [],
      privacy: {
        counts: {},
        sensitiveCount: 0
      },
      reload: vi.fn()
    })

    render(<SavedViewRunner descriptor={descriptor} registry={[]} />)

    fireEvent.click(screen.getByRole('button', { name: 'Inspect Ada Lovelace' }))

    const inspector = screen.getByText('Inspector').closest('aside')
    expect(inspector).toBeTruthy()
    expect(within(inspector as HTMLElement).getByText('Social Actor')).toBeTruthy()
    expect(within(inspector as HTMLElement).getByText('actor-1')).toBeTruthy()
    expect(within(inspector as HTMLElement).getByText('source-actor-1')).toBeTruthy()
  })
})

describe('SavedViewResultTable', () => {
  it('renders rows and expands raw row details', () => {
    const onToggleRow = vi.fn()
    const query = createQueryResult()

    const { rerender } = render(
      <SavedViewResultTable
        query={query}
        columns={['title', 'platform']}
        expandedRowId={null}
        onToggleRow={onToggleRow}
      />
    )

    expect(screen.getByText('Launch post')).toBeTruthy()
    expect(screen.getByText('instagram')).toBeTruthy()

    fireEvent.click(screen.getByLabelText('Expand row'))
    expect(onToggleRow).toHaveBeenCalledWith('row-1')

    rerender(
      <SavedViewResultTable
        query={query}
        columns={['title', 'platform']}
        expandedRowId="row-1"
        onToggleRow={onToggleRow}
      />
    )

    expect(screen.getByText('content')).toBeTruthy()
    expect(screen.getByText(/"source": "archive"/)).toBeTruthy()
  })
})
