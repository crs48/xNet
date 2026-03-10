import type { CanvasEdge, CanvasNode } from '../types'
import { describe, expect, it } from 'vitest'
import { createCanvasDisplayList } from '../renderer/display-list'
import { createViewport } from '../spatial'

function createNode(id: string, x: number, y: number, width = 240, height = 160): CanvasNode {
  return {
    id,
    type: 'page',
    position: {
      x,
      y,
      width,
      height,
      zIndex: 0
    },
    properties: {
      title: id
    }
  }
}

function createEdge(id: string, sourceId: string, targetId: string): CanvasEdge {
  return {
    id,
    sourceId,
    targetId
  }
}

describe('createCanvasDisplayList', () => {
  it('keeps all visible nodes in the DOM for sparse scenes', () => {
    const viewport = createViewport({
      x: 400,
      y: 300,
      zoom: 1,
      width: 800,
      height: 600
    })
    const nodes = [createNode('node-1', 100, 120), createNode('node-2', 420, 220)]
    const edges = [createEdge('edge-1', 'node-1', 'node-2')]

    const result = createCanvasDisplayList({
      viewport,
      nodes,
      edges,
      store: {
        getVisibleNodes: () => nodes
      },
      selectedNodeIds: new Set()
    })

    expect(result.visibleNodes).toHaveLength(2)
    expect(result.domNodes).toHaveLength(2)
    expect(result.overviewNodes).toHaveLength(0)
    expect(result.visibleEdges).toHaveLength(1)
  })

  it('bounds DOM mounts for dense scenes while keeping selected nodes interactive', () => {
    const viewport = createViewport({
      x: 1200,
      y: 900,
      zoom: 1,
      width: 1280,
      height: 720
    })
    const nodes = Array.from({ length: 96 }, (_, index) =>
      createNode(`node-${index + 1}`, (index % 12) * 220, Math.floor(index / 12) * 190)
    )
    const selectedNodeIds = new Set(['node-96'])

    const result = createCanvasDisplayList({
      viewport,
      nodes,
      edges: [],
      store: {
        getVisibleNodes: () => nodes
      },
      selectedNodeIds,
      domNodeLimit: 24
    })

    expect(result.visibleNodes).toHaveLength(96)
    expect(result.domNodes).toHaveLength(24)
    expect(result.overviewNodes).toHaveLength(72)
    expect(result.domNodeIds.has('node-96')).toBe(true)
  })
})
