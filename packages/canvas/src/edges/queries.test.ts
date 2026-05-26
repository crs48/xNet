/**
 * Semantic edge query helper tests.
 */

import type { CanvasEdge } from '../types'
import { describe, expect, it } from 'vitest'
import { createCanvasEdgeEndpoint } from './bindings'
import {
  canvasEdgeMatchesSemanticQuery,
  createCanvasSemanticEdgeQuery,
  createCanvasSemanticEdgeQueryRows,
  filterCanvasEdgesBySemanticQuery,
  runCanvasSemanticEdgeQuery
} from './queries'
import { createCanvasEdgeRelationship } from './relationships'

function createSemanticEdge(
  id: string,
  sourceId: string,
  targetId: string,
  properties: Partial<Omit<CanvasEdge, 'id' | 'sourceId' | 'targetId'>> = {}
): CanvasEdge {
  return {
    id,
    sourceId,
    targetId,
    source: createCanvasEdgeEndpoint(sourceId, properties.source),
    target: createCanvasEdgeEndpoint(targetId, properties.target),
    ...properties
  }
}

describe('semantic edge queries', () => {
  it('normalizes reusable query definitions', () => {
    expect(
      createCanvasSemanticEdgeQuery({
        name: ' ERP Dependencies ',
        description: '  Important production dependencies  ',
        filter: {
          relationshipKinds: ['depends-on', 'depends-on'],
          source: {
            objectIds: [' task-b ', 'task-a', ''],
            pageNumbers: [2, 1, 0, 1]
          },
          query: ' blocked ',
          relationshipPropertyEquals: {
            ' priority ': 'high',
            '': true
          }
        },
        sort: { field: 'label' },
        limit: 2
      })
    ).toEqual({
      id: 'canvas-semantic-edge-query:erp-dependencies',
      name: 'ERP Dependencies',
      description: 'Important production dependencies',
      filter: {
        relationshipKinds: ['depends-on'],
        source: {
          objectIds: ['task-a', 'task-b'],
          pageNumbers: [1, 2]
        },
        query: 'blocked',
        relationshipPropertyEquals: {
          priority: 'high'
        }
      },
      sort: { field: 'label' },
      limit: 2
    })
  })

  it('filters edges by relationship, roles, schema, labels, anchors, text, and properties', () => {
    const dependsOnPurchaseOrder = createSemanticEdge('edge-1', 'invoice', 'purchase-order', {
      source: createCanvasEdgeEndpoint('invoice', {
        pageNumber: 2,
        blockAnchorId: 'line-total',
        placement: 'right'
      }),
      target: createCanvasEdgeEndpoint('purchase-order', {
        pageId: 'po-1',
        placement: 'left'
      }),
      relationship: createCanvasEdgeRelationship({
        kind: 'depends-on',
        label: 'Requires',
        sourceRole: 'invoice',
        targetRole: 'purchase order',
        schemaId: 'erp.invoice.po',
        properties: { strength: 'hard', reviewed: true }
      })
    })
    const reference = createSemanticEdge('edge-2', 'brief', 'source', {
      relationship: createCanvasEdgeRelationship({
        kind: 'references',
        label: 'Reference',
        schemaId: 'docs.references'
      })
    })

    const filter = {
      relationshipKinds: ['depends-on'],
      source: {
        objectIds: ['invoice'],
        pageNumbers: [2],
        blockAnchorIds: ['line-total'],
        placements: ['right']
      },
      target: {
        objectIds: ['purchase-order'],
        pageIds: ['po-1'],
        placements: ['left']
      },
      schemaIds: ['erp.invoice.po'],
      sourceRoles: ['invoice'],
      targetRoles: ['purchase order'],
      labels: ['Requires'],
      query: 'hard',
      relationshipPropertyEquals: { reviewed: true }
    } as const

    expect(canvasEdgeMatchesSemanticQuery(dependsOnPurchaseOrder, filter)).toBe(true)
    expect(canvasEdgeMatchesSemanticQuery(reference, filter)).toBe(false)
    expect(filterCanvasEdgesBySemanticQuery([reference, dependsOnPurchaseOrder], filter)).toEqual([
      dependsOnPurchaseOrder
    ])
  })

  it('can match swapped endpoints for undirected relationship filters', () => {
    const duplicate = createSemanticEdge('edge-1', 'record-a', 'record-b', {
      relationship: createCanvasEdgeRelationship({
        kind: 'duplicates'
      })
    })
    const swappedEndpointFilter = {
      source: { objectIds: ['record-b'] },
      target: { objectIds: ['record-a'] }
    }

    expect(canvasEdgeMatchesSemanticQuery(duplicate, swappedEndpointFilter)).toBe(false)
    expect(
      canvasEdgeMatchesSemanticQuery(duplicate, {
        ...swappedEndpointFilter,
        includeUndirectedEndpointSwaps: true
      })
    ).toBe(true)
  })

  it('returns serializable rows and summaries for query-backed grids', () => {
    const edges = [
      createSemanticEdge('edge-account-order', 'account-1', 'order-2', {
        relationship: createCanvasEdgeRelationship({
          kind: 'references',
          label: 'Order',
          schemaId: 'erp.order'
        })
      }),
      createSemanticEdge('edge-account-ticket', 'account-1', 'ticket-1', {
        relationship: createCanvasEdgeRelationship({
          kind: 'blocks',
          label: 'Risk',
          schemaId: 'support.ticket'
        })
      }),
      createSemanticEdge('edge-task-order', 'task-1', 'order-2', {
        relationship: createCanvasEdgeRelationship({
          kind: 'references',
          label: 'Task order',
          schemaId: 'erp.order'
        })
      })
    ]

    const result = runCanvasSemanticEdgeQuery(
      edges,
      createCanvasSemanticEdgeQuery({
        name: 'Account relationships',
        filter: {
          connectedObjectIds: ['account-1']
        },
        sort: { field: 'label', direction: 'desc' },
        limit: 1
      })
    )

    expect(createCanvasSemanticEdgeQueryRows(edges)[0]).toMatchObject({
      edgeId: 'edge-account-order',
      sourceObjectId: 'account-1',
      targetObjectId: 'order-2',
      sourceAnchorId: 'account-1#placement:auto',
      targetAnchorId: 'order-2#placement:auto'
    })
    expect(result.rows).toMatchObject([
      {
        id: 'edge-account-ticket',
        kind: 'blocks',
        label: 'Risk',
        schemaId: 'support.ticket'
      }
    ])
    expect(result.totalEdgeCount).toBe(3)
    expect(result.matchedEdgeCount).toBe(2)
    expect(result.returnedEdgeCount).toBe(1)
    expect(result.relationshipKindCounts).toEqual({
      blocks: 1,
      references: 1
    })
    expect(result.schemaIdCounts).toEqual({
      'erp.order': 1,
      'support.ticket': 1
    })
  })
})
