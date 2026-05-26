import type { CanvasEdge, CanvasNode, JsonCanvasDocument } from '../index'
import { describe, expect, it } from 'vitest'
import {
  createCanvasEdgeEndpoint,
  exportCanvasToJsonCanvas,
  importCanvasFromJsonCanvas
} from '../index'

function createNode(input: CanvasNode): CanvasNode {
  return input
}

function getNode(document: JsonCanvasDocument, id: string) {
  const node = document.nodes.find((candidate) => candidate.id === id)

  if (!node) {
    throw new Error(`Expected JSON Canvas node '${id}'`)
  }

  return node
}

function getImportedNode(nodes: readonly CanvasNode[], id: string): CanvasNode {
  const node = nodes.find((candidate) => candidate.id === id)

  if (!node) {
    throw new Error(`Expected imported canvas node '${id}'`)
  }

  return node
}

describe('JSON Canvas interop', () => {
  it('exports xNet canvas nodes to text, link, file, group, and edge records', () => {
    const note = createNode({
      id: 'note-1',
      type: 'note',
      alias: 'Planning note',
      position: { x: 0, y: 10, width: 260, height: 140, zIndex: 1 },
      properties: {
        subtitle: 'Workshop',
        text: 'Collect launch risks.',
        color: '#facc15'
      }
    })
    const link = createNode({
      id: 'link-1',
      type: 'external-reference',
      sourceNodeId: 'source-link-1',
      position: { x: 320, y: 10, width: 320, height: 180, zIndex: 2 },
      properties: {
        title: 'Reference',
        url: 'https://example.com/reference'
      }
    })
    const file = createNode({
      id: 'file-1',
      type: 'media',
      position: { x: 680, y: 10, width: 300, height: 220, zIndex: 3 },
      properties: {
        title: 'Roadmap PDF',
        filePath: 'files/roadmap.pdf',
        mimeType: 'application/pdf'
      }
    })
    const frame = createNode({
      id: 'frame-1',
      type: 'group',
      position: { x: -40, y: -40, width: 1080, height: 340, zIndex: 0 },
      properties: {
        title: 'Launch frame',
        containerRole: 'frame'
      }
    })
    const edge: CanvasEdge = {
      id: 'edge-1',
      sourceId: note.id,
      targetId: link.id,
      source: createCanvasEdgeEndpoint(note.id, { placement: 'right' }),
      target: createCanvasEdgeEndpoint(link.id, { placement: 'left' }),
      label: 'reference',
      relationship: { kind: 'references', label: 'Reference' },
      style: { stroke: '#0f766e', markerEnd: 'arrow' }
    }

    const document = exportCanvasToJsonCanvas({
      nodes: [link, note, file, frame],
      edges: [edge]
    })

    expect(document.nodes.map((node) => node.id)).toEqual(['frame-1', 'note-1', 'link-1', 'file-1'])
    expect(getNode(document, 'note-1')).toMatchObject({
      type: 'text',
      text: 'Planning note\nWorkshop\nCollect launch risks.',
      color: '#facc15'
    })
    expect(getNode(document, 'link-1')).toMatchObject({
      type: 'link',
      url: 'https://example.com/reference',
      xnet: {
        sourceNodeId: 'source-link-1'
      }
    })
    expect(getNode(document, 'file-1')).toMatchObject({
      type: 'file',
      file: 'files/roadmap.pdf'
    })
    expect(getNode(document, 'frame-1')).toMatchObject({
      type: 'group',
      label: 'Launch frame'
    })
    expect(document.edges?.[0]).toMatchObject({
      fromNode: 'note-1',
      fromSide: 'right',
      toNode: 'link-1',
      toSide: 'left',
      toEnd: 'arrow',
      color: '#0f766e',
      label: 'reference'
    })
  })

  it('imports JSON Canvas nodes as source-backed canvas objects and connectors', () => {
    const document: JsonCanvasDocument = {
      nodes: [
        {
          id: 'text-1',
          type: 'text',
          text: 'Workshop note\nCollect risks',
          x: 0,
          y: 0,
          width: 240,
          height: 140
        },
        {
          id: 'link-1',
          type: 'link',
          url: 'https://example.com',
          x: 300,
          y: 0,
          width: 280,
          height: 160
        },
        {
          id: 'file-1',
          type: 'file',
          file: 'attachments/brief.pdf',
          x: 620,
          y: 0,
          width: 300,
          height: 220
        },
        {
          id: 'group-1',
          type: 'group',
          label: 'Research frame',
          x: -40,
          y: -40,
          width: 1000,
          height: 360
        }
      ],
      edges: [
        {
          id: 'edge-1',
          fromNode: 'text-1',
          fromSide: 'right',
          toNode: 'link-1',
          toSide: 'left',
          toEnd: 'arrow',
          label: 'opens'
        }
      ]
    }

    const result = importCanvasFromJsonCanvas(document)

    expect(result.warnings).toEqual([])
    expect(getImportedNode(result.nodes, 'text-1')).toMatchObject({
      type: 'note',
      properties: {
        title: 'Workshop note',
        text: 'Workshop note\nCollect risks'
      }
    })
    expect(getImportedNode(result.nodes, 'link-1')).toMatchObject({
      type: 'external-reference',
      properties: {
        url: 'https://example.com'
      }
    })
    expect(getImportedNode(result.nodes, 'file-1')).toMatchObject({
      type: 'media',
      properties: {
        file: 'attachments/brief.pdf',
        title: 'brief.pdf'
      }
    })
    expect(getImportedNode(result.nodes, 'group-1')).toMatchObject({
      type: 'group',
      properties: {
        title: 'Research frame',
        containerRole: 'frame'
      }
    })
    expect(result.edges[0]).toMatchObject({
      id: 'edge-1',
      sourceId: 'text-1',
      targetId: 'link-1',
      label: 'opens',
      source: {
        placement: 'right'
      },
      target: {
        placement: 'left'
      },
      style: {
        markerEnd: 'arrow'
      }
    })
  })

  it('round-trips xNet metadata and warns about missing edge endpoints', () => {
    const shape = createNode({
      id: 'shape-1',
      type: 'shape',
      sourceNodeId: 'source-shape-1',
      sourceSchemaId: 'xnet://fixtures/shape',
      alias: 'Decision',
      locked: true,
      display: { styleVariant: 'warning' },
      position: { x: 40, y: 80, width: 180, height: 120 },
      properties: {
        title: 'Decision',
        shapeType: 'diamond',
        fill: '#f97316'
      }
    })
    const document = exportCanvasToJsonCanvas({
      nodes: [shape],
      edges: [
        {
          id: 'missing-edge',
          sourceId: 'shape-1',
          targetId: 'missing-node'
        }
      ]
    })
    const imported = importCanvasFromJsonCanvas(document)

    expect(getImportedNode(imported.nodes, 'shape-1')).toMatchObject({
      type: 'shape',
      sourceNodeId: 'source-shape-1',
      sourceSchemaId: 'xnet://fixtures/shape',
      alias: 'Decision',
      locked: true,
      display: { styleVariant: 'warning' },
      properties: {
        shapeType: 'diamond',
        fill: '#f97316'
      }
    })
    expect(imported.warnings).toEqual([
      "JSON Canvas edge 'missing-edge' references a missing node."
    ])
  })
})
