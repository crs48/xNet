/**
 * @xnetjs/react - Tests for saved view result rendering.
 */

import type { SavedViewQueryResult } from '../hooks/useSavedView'
import type { QueryASTNodeQuery, SavedViewDescriptor } from '@xnetjs/data'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import {
  createSavedViewLensDraft,
  deriveSavedViewDateBucketSummaries,
  deriveSavedViewFacetSummaries,
  deriveSavedViewColumns,
  deriveSavedViewPrivacyChips,
  deriveSavedViewRowInspector,
  filterSavedViewRowsByDateBrush,
  filterSavedViewRowsByFacets,
  formatSavedViewCellValue,
  getSavedViewSensitiveResultWarning,
  SavedViewResultTable
} from './SavedViewRunner'

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
