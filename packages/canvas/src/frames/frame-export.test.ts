import type { CanvasEdge, CanvasNode } from '../types'
import { describe, expect, it } from 'vitest'
import { createCanvasEdgeEndpoint } from '../edges/bindings'
import {
  createCanvasFrameExportDocument,
  getCanvasFrameExportEdges,
  getCanvasFrameExportMembers,
  isCanvasNodeInsideFrameExportBounds
} from './frame-export'

function createNode(input: CanvasNode): CanvasNode {
  return input
}

describe('frame export helpers', () => {
  it('collects explicit and spatial frame members for board-section export', () => {
    const frame = createNode({
      id: 'frame-1',
      type: 'group',
      position: { x: 0, y: 0, width: 640, height: 360, zIndex: 0 },
      properties: {
        title: 'Launch walkthrough',
        containerRole: 'frame',
        frameVariant: 'presentation',
        frameIntent: 'presentation',
        exportRole: 'slide',
        aspectRatio: '16:9',
        layoutHint: 'deck',
        memberIds: ['explicit-note']
      }
    })
    const spatialNote = createNode({
      id: 'spatial-note',
      type: 'note',
      position: { x: 40, y: 48, width: 220, height: 120, zIndex: 2 },
      properties: { title: 'Inside the frame' }
    })
    const explicitNote = createNode({
      id: 'explicit-note',
      type: 'note',
      position: { x: 780, y: 48, width: 220, height: 120, zIndex: 1 },
      properties: { title: 'Explicit member' }
    })
    const outsideNote = createNode({
      id: 'outside-note',
      type: 'note',
      position: { x: 900, y: 480, width: 220, height: 120, zIndex: 3 },
      properties: { title: 'Outside' }
    })

    const members = getCanvasFrameExportMembers(frame, [
      frame,
      spatialNote,
      explicitNote,
      outsideNote
    ])

    expect(isCanvasNodeInsideFrameExportBounds(frame, spatialNote)).toBe(true)
    expect(isCanvasNodeInsideFrameExportBounds(frame, outsideNote)).toBe(false)
    expect(members.map((node) => node.id)).toEqual(['explicit-note', 'spatial-note'])
  })

  it('exports a frame section as JSON Canvas with internal semantic edges only', () => {
    const frame = createNode({
      id: 'frame-1',
      type: 'group',
      position: { x: 0, y: 0, width: 640, height: 360, zIndex: 0 },
      properties: {
        title: 'Launch walkthrough',
        containerRole: 'frame',
        frameVariant: 'presentation',
        frameIntent: 'presentation',
        exportRole: 'slide',
        aspectRatio: '16:9',
        layoutHint: 'deck'
      }
    })
    const first = createNode({
      id: 'note-1',
      type: 'note',
      position: { x: 40, y: 48, width: 220, height: 120, zIndex: 1 },
      properties: { title: 'Opening' }
    })
    const second = createNode({
      id: 'link-1',
      type: 'external-reference',
      position: { x: 340, y: 48, width: 220, height: 120, zIndex: 2 },
      properties: { title: 'Reference', url: 'https://example.com' }
    })
    const outside = createNode({
      id: 'outside-note',
      type: 'note',
      position: { x: 900, y: 480, width: 220, height: 120, zIndex: 3 },
      properties: { title: 'Outside' }
    })
    const internalEdge: CanvasEdge = {
      id: 'edge-1',
      sourceId: first.id,
      targetId: second.id,
      source: createCanvasEdgeEndpoint(first.id, { placement: 'right' }),
      target: createCanvasEdgeEndpoint(second.id, { placement: 'left' }),
      relationship: { kind: 'references', label: 'Reference' },
      style: { markerEnd: 'arrow' }
    }
    const externalEdge: CanvasEdge = {
      id: 'edge-2',
      sourceId: first.id,
      targetId: outside.id
    }

    const frameExport = createCanvasFrameExportDocument({
      frame,
      nodes: [frame, first, second, outside],
      edges: [externalEdge, internalEdge],
      exportedAt: '2026-05-26T12:00:00.000Z'
    })

    expect(getCanvasFrameExportEdges(['note-1', 'link-1'], [externalEdge, internalEdge])).toEqual([
      internalEdge
    ])
    expect(frameExport).toMatchObject({
      format: 'json-canvas',
      frameId: 'frame-1',
      title: 'Launch walkthrough',
      exportedAt: '2026-05-26T12:00:00.000Z',
      variant: 'presentation',
      presentation: {
        exportRole: 'slide',
        aspectRatio: '16:9',
        layoutHint: 'deck'
      },
      memberNodeIds: ['note-1', 'link-1'],
      edgeIds: ['edge-1']
    })
    expect(frameExport.document.nodes.map((node) => node.id)).toEqual([
      'frame-1',
      'note-1',
      'link-1'
    ])
    expect(frameExport.document.edges?.map((edge) => edge.id)).toEqual(['edge-1'])
  })
})
