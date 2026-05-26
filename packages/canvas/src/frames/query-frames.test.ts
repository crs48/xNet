import { describe, expect, it } from 'vitest'
import { applyCanvasFrameVariant, createCanvasFrameVariantNode } from './frame-variants'
import {
  createCanvasQueryFrameDefinition,
  createCanvasQueryFrameNode,
  getCanvasQueryFrameDefinition,
  getCanvasQueryFrameResultSummary,
  isCanvasQueryFrameNode,
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
})
