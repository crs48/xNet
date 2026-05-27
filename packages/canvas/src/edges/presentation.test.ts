/**
 * Edge presentation helper tests.
 */

import { describe, expect, it } from 'vitest'
import { createEdge } from '../store'
import {
  canvasEdgeMatchesFilter,
  filterCanvasEdges,
  getCanvasEdgePresentation,
  pickCanvasEdgeEndpointAnchor
} from './presentation'
import { createCanvasEdgeRelationship } from './relationships'

describe('edge presentation helpers', () => {
  it('uses semantic relationship presets and explicit edge style overrides', () => {
    expect(
      getCanvasEdgePresentation(
        createEdge('a', 'b', {
          relationship: createCanvasEdgeRelationship({
            kind: 'depends-on',
            label: 'Needs'
          })
        })
      )
    ).toEqual({
      label: 'Needs',
      stroke: '#dc2626',
      strokeWidth: 1.75,
      markerEnd: 'arrow',
      curved: true
    })

    expect(
      getCanvasEdgePresentation(
        createEdge('a', 'b', {
          relationship: createCanvasEdgeRelationship({ kind: 'duplicates' }),
          label: 'Same as',
          style: {
            stroke: '#111827',
            strokeWidth: 4,
            strokeDasharray: '2 2',
            curved: false
          }
        })
      )
    ).toEqual({
      label: 'Same as',
      stroke: '#111827',
      strokeWidth: 4,
      strokeDasharray: '2 2',
      curved: false
    })
  })

  it('filters edges by relationship kind, endpoint, and query', () => {
    const depends = createEdge('task', 'blocked-by', {
      relationship: createCanvasEdgeRelationship({
        kind: 'depends-on',
        label: 'Blocked by'
      })
    })
    const reference = createEdge('doc', 'source', {
      relationship: createCanvasEdgeRelationship({
        kind: 'references',
        label: 'Reference'
      })
    })

    expect(canvasEdgeMatchesFilter(depends, { relationshipKinds: ['depends-on'] })).toBe(true)
    expect(canvasEdgeMatchesFilter(depends, { sourceObjectIds: ['doc'] })).toBe(false)
    expect(filterCanvasEdges([depends, reference], { query: 'reference' })).toEqual([reference])
  })

  it('picks placement and ratio anchors from object-relative pointer positions', () => {
    const rect = { x: 100, y: 50, width: 200, height: 100 }

    expect(
      pickCanvasEdgeEndpointAnchor({
        objectId: 'node',
        rect,
        point: { x: 290, y: 90 }
      })
    ).toEqual({
      objectId: 'node',
      placement: 'right',
      anchorId: 'node#placement:right'
    })

    expect(
      pickCanvasEdgeEndpointAnchor({
        objectId: 'node',
        rect,
        point: { x: 150, y: 75 },
        mode: 'ratio'
      })
    ).toEqual({
      objectId: 'node',
      xRatio: 0.25,
      yRatio: 0.25,
      anchorId: 'node#ratio:0.25,0.25'
    })
  })
})
