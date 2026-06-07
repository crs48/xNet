/**
 * @xnetjs/react - Tests for saved view result rendering.
 */

import type { SavedViewQueryResult } from '../hooks/useSavedView'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import {
  deriveSavedViewDateBucketSummaries,
  deriveSavedViewFacetSummaries,
  deriveSavedViewColumns,
  filterSavedViewRowsByDateBrush,
  filterSavedViewRowsByFacets,
  formatSavedViewCellValue,
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
