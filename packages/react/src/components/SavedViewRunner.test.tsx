/**
 * @xnetjs/react - Tests for saved view result rendering.
 */

import type { SavedViewQueryResult } from '../hooks/useSavedView'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import {
  deriveSavedViewColumns,
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
