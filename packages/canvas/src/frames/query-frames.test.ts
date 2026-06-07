import type { SavedViewDescriptor } from '@xnetjs/data'
import { describe, expect, it } from 'vitest'
import { applyCanvasFrameVariant, createCanvasFrameVariantNode } from './frame-variants'
import {
  createCanvasQueryFrameDefinition,
  createCanvasQueryFrameDefinitionFromSavedView,
  createCanvasQueryFrameNode,
  createCanvasQueryFrameResultPreview,
  createCanvasQueryFrameResultSummaryFromExecution,
  getCanvasQueryFrameDefinition,
  getCanvasQueryFrameResultPreview,
  getCanvasQueryFrameResultSummary,
  isCanvasQueryFrameNode,
  updateCanvasQueryFrameResults,
  updateCanvasQueryFrameResultSummary
} from './query-frames'

const viewport = {
  x: 100,
  y: 200,
  zoom: 1
}

describe('query frame helpers', () => {
  it('creates normalized query definitions for saved operational views', () => {
    const definition = createCanvasQueryFrameDefinition({
      source: 'database',
      label: ' At-risk renewals ',
      databaseId: 'db-crm',
      viewId: 'renewals',
      queryText: ' status = "at risk" ',
      filters: [
        { field: ' status ', operator: 'equals', value: 'at-risk' },
        { field: ' ', operator: 'equals', value: 'ignored' }
      ],
      sorts: [
        { field: ' closeDate ', direction: 'asc' },
        { field: '', direction: 'desc' }
      ],
      limit: 1200,
      refreshMode: 'live',
      materialization: 'pinned-cards',
      resultCardKind: 'crm.opportunity-card'
    })

    expect(definition).toMatchObject({
      id: 'canvas-query:database:db-crm',
      source: 'database',
      label: 'At-risk renewals',
      databaseId: 'db-crm',
      viewId: 'renewals',
      queryText: 'status = "at risk"',
      limit: 500,
      refreshMode: 'live',
      materialization: 'pinned-cards',
      resultCardKind: 'crm.opportunity-card'
    })
    expect(definition.filters).toEqual([{ field: 'status', operator: 'equals', value: 'at-risk' }])
    expect(definition.sorts).toEqual([{ field: 'closeDate', direction: 'asc' }])
  })

  it('creates query frame definitions from saved view descriptors', () => {
    const descriptor: SavedViewDescriptor = {
      version: 1,
      title: 'YouTube Saves Lens',
      scope: 'workspace',
      query: {
        version: 1,
        kind: 'node',
        schemaId: 'xnet://xnet.fyi/SocialContent@1.0.0',
        predicate: {
          kind: 'and',
          predicates: [
            { kind: 'comparison', field: 'platform', op: 'in', values: ['youtube'] },
            {
              kind: 'comparison',
              field: 'publishedAt',
              op: 'between',
              values: [1704067200000, 1704153599999]
            }
          ]
        },
        orderBy: [{ field: 'publishedAt', direction: 'desc' }],
        page: { first: 50, count: 'estimate' }
      }
    }

    const definition = createCanvasQueryFrameDefinitionFromSavedView({
      viewId: 'saved-view-1',
      descriptor
    })

    expect(definition).toMatchObject({
      source: 'schema',
      label: 'YouTube Saves Lens',
      viewId: 'saved-view-1',
      schemaId: 'xnet://xnet.fyi/SocialContent@1.0.0',
      limit: 50,
      refreshMode: 'manual',
      materialization: 'virtual',
      resultCardKind: 'saved-view.result-card'
    })
    expect(definition.filters).toEqual([
      { field: 'platform', operator: 'in', value: ['youtube'] },
      {
        field: 'publishedAt',
        operator: 'greater-than-or-equal',
        value: 1704067200000
      },
      {
        field: 'publishedAt',
        operator: 'less-than-or-equal',
        value: 1704153599999
      }
    ])
    expect(definition.sorts).toEqual([{ field: 'publishedAt', direction: 'desc' }])
    expect(definition.queryText).toBe(JSON.stringify(descriptor))
  })

  it('creates query-backed frame nodes with result summaries', () => {
    const frame = createCanvasQueryFrameNode({
      viewport,
      query: {
        source: 'schema',
        schemaId: 'xnet://fixtures.erp/purchase-order',
        label: 'Open purchase orders',
        filters: [{ field: 'status', operator: 'not-equals', value: 'received' }]
      },
      resultSummary: {
        totalCount: 18,
        visibleCount: 8,
        stale: true,
        sourceVersion: 'v7'
      },
      resultPreview: {
        cards: [
          {
            id: 'po-1',
            title: 'PO-1001',
            subtitle: 'Vendor A',
            eyebrow: 'Purchase order',
            badges: ['open', 'urgent']
          }
        ],
        overflowCount: 3
      }
    })

    expect(isCanvasQueryFrameNode(frame)).toBe(true)
    expect(frame).toMatchObject({
      type: 'group',
      properties: {
        title: 'Open purchase orders',
        containerRole: 'frame',
        frameVariant: 'query',
        frameIntent: 'query',
        queryMode: 'saved-query'
      }
    })
    expect(getCanvasQueryFrameDefinition(frame)).toMatchObject({
      source: 'schema',
      schemaId: 'xnet://fixtures.erp/purchase-order',
      label: 'Open purchase orders'
    })
    expect(getCanvasQueryFrameResultSummary(frame)).toMatchObject({
      totalCount: 18,
      visibleCount: 8,
      stale: true,
      sourceVersion: 'v7'
    })
    expect(getCanvasQueryFrameResultPreview(frame)).toEqual({
      cards: [
        {
          id: 'po-1',
          title: 'PO-1001',
          subtitle: 'Vendor A',
          eyebrow: 'Purchase order',
          badges: ['open', 'urgent']
        }
      ],
      overflowCount: 3
    })
  })

  it('reads legacy queryText frames as custom query definitions', () => {
    const frame = createCanvasFrameVariantNode({
      variant: 'query',
      viewport,
      title: 'Needs review',
      properties: {
        queryText: 'tag:review'
      }
    })

    expect(getCanvasQueryFrameDefinition(frame)).toMatchObject({
      source: 'custom',
      label: 'Needs review',
      queryText: 'tag:review'
    })
  })

  it('updates query result summaries immutably and ignores non-query frames', () => {
    const frame = createCanvasQueryFrameNode({
      viewport,
      query: {
        source: 'search',
        label: 'Policy docs',
        queryText: 'policy'
      }
    })
    const updated = updateCanvasQueryFrameResultSummary(frame, {
      totalCount: 12,
      visibleCount: 6,
      contentHash: 'hash-1',
      lastUpdatedAt: '2026-05-26T00:00:00.000Z'
    })
    const standard = applyCanvasFrameVariant(frame, 'standard')

    expect(updated).not.toBe(frame)
    expect(getCanvasQueryFrameResultSummary(updated)).toMatchObject({
      totalCount: 12,
      visibleCount: 6,
      stale: false,
      contentHash: 'hash-1'
    })
    expect(updateCanvasQueryFrameResultSummary(standard, { totalCount: 2 })).toBe(standard)
    expect(standard.properties.queryDefinition).toBeUndefined()
    expect(standard.properties.queryResultSummary).toBeUndefined()
  })

  it('normalizes and updates query result previews', () => {
    const preview = createCanvasQueryFrameResultPreview({
      cards: [
        {
          id: ' row-1 ',
          title: ' First row ',
          subtitle: ' Social content ',
          eyebrow: ' Content ',
          description: 'Loaded from an imported archive',
          sourceNodeId: ' social-content-1 ',
          schemaId: ' xnet://xnet.fyi/SocialContent@1.0.0 ',
          href: ' https://example.com/post ',
          badges: [' instagram ', 'public', 'instagram']
        },
        {
          id: 'missing-title',
          title: '',
          badges: ['ignored']
        }
      ],
      overflowCount: 2
    })
    const frame = createCanvasQueryFrameNode({
      viewport,
      query: {
        source: 'schema',
        label: 'Social content'
      }
    })
    const updated = updateCanvasQueryFrameResults(frame, {
      summary: { totalCount: 3, visibleCount: 1, status: 'success' },
      preview
    })
    const standard = applyCanvasFrameVariant(frame, 'standard')

    expect(preview).toEqual({
      cards: [
        {
          id: 'row-1',
          title: 'First row',
          subtitle: 'Social content',
          eyebrow: 'Content',
          description: 'Loaded from an imported archive',
          sourceNodeId: 'social-content-1',
          schemaId: 'xnet://xnet.fyi/SocialContent@1.0.0',
          href: 'https://example.com/post',
          badges: ['instagram', 'public']
        }
      ],
      overflowCount: 2
    })
    expect(getCanvasQueryFrameResultSummary(updated)).toMatchObject({
      totalCount: 3,
      visibleCount: 1,
      status: 'success'
    })
    expect(getCanvasQueryFrameResultPreview(updated)).toEqual(preview)
    expect(updateCanvasQueryFrameResults(standard, { summary: { totalCount: 1 }, preview })).toBe(
      standard
    )
  })

  it('folds saved-view query execution snapshots into frame result summaries', () => {
    const summary = createCanvasQueryFrameResultSummaryFromExecution({
      now: '2026-05-26T00:00:00.000Z',
      queries: [
        {
          status: 'success',
          totalCount: 10,
          visibleCount: 4,
          contentHash: 'hash-a'
        },
        {
          status: 'success',
          totalCount: 5,
          visibleCount: 5,
          contentHash: 'hash-b'
        }
      ]
    })
    const loading = createCanvasQueryFrameResultSummaryFromExecution({
      queries: [{ loading: true, visibleCount: 2 }]
    })
    const error = createCanvasQueryFrameResultSummaryFromExecution({
      queries: [{ status: 'error', errorMessage: 'Schema not registered' }]
    })

    expect(summary).toMatchObject({
      totalCount: 15,
      visibleCount: 9,
      stale: false,
      status: 'success',
      contentHash: 'hash-a|hash-b',
      lastUpdatedAt: '2026-05-26T00:00:00.000Z'
    })
    expect(loading).toMatchObject({
      totalCount: 2,
      visibleCount: 2,
      stale: true,
      status: 'loading'
    })
    expect(error).toMatchObject({
      totalCount: 0,
      visibleCount: 0,
      stale: true,
      status: 'error',
      errorMessage: 'Schema not registered'
    })
  })
})
