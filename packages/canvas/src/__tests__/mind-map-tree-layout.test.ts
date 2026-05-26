/**
 * Mind-map tree layout helper tests.
 */

import { describe, expect, it } from 'vitest'
import {
  createCanvasMindMapTreeLayoutRequest,
  createCanvasMindMapTreePositionUpdates,
  layoutCanvasMindMapTree
} from '../mind-map/tree-layout'
import { createLayoutManager, type LayoutEdge, type LayoutNode } from '../workers'

function createLayoutNode(id: string, x = 0, y = 0, width = 220, height = 88): LayoutNode {
  return {
    id,
    position: { x, y, width, height }
  }
}

function createLayoutEdge(id: string, sourceId: string, targetId: string): LayoutEdge {
  return { id, sourceId, targetId }
}

describe('createCanvasMindMapTreeLayoutRequest', () => {
  it('maps mind-map layout options onto the tree worker request', () => {
    const request = createCanvasMindMapTreeLayoutRequest({
      nodes: [createLayoutNode('root'), createLayoutNode('branch')],
      edges: [createLayoutEdge('root-branch', 'root', 'branch')],
      direction: 'left',
      siblingGap: 64,
      levelGap: 180
    })

    expect(request.algorithm).toBe('tree')
    expect(request.options).toEqual(
      expect.objectContaining({
        'elk.direction': 'LEFT',
        'elk.spacing.nodeNode': '64',
        'elk.layered.spacing.nodeNodeBetweenLayers': '180'
      })
    )
  })

  it('allows callers to override raw ELK options when needed', () => {
    const request = createCanvasMindMapTreeLayoutRequest({
      nodes: [createLayoutNode('root')],
      edges: [],
      options: {
        'elk.direction': 'DOWN',
        'elk.spacing.nodeNode': '12'
      }
    })

    expect(request.options).toEqual(
      expect.objectContaining({
        'elk.direction': 'DOWN',
        'elk.spacing.nodeNode': '12'
      })
    )
  })
})

describe('createCanvasMindMapTreePositionUpdates', () => {
  it('keeps an anchor node in place while shifting the layout', () => {
    const nodes = [createLayoutNode('root', 500, 600), createLayoutNode('branch', 720, 600)]
    const positions = new Map([
      ['root', { x: 10, y: 20 }],
      ['branch', { x: 300, y: 20 }]
    ])

    expect(
      createCanvasMindMapTreePositionUpdates({
        nodes,
        positions,
        anchorNodeId: 'root'
      })
    ).toEqual([
      { id: 'root', position: { x: 500, y: 600 } },
      { id: 'branch', position: { x: 790, y: 600 } }
    ])
  })

  it('skips nodes that do not have layout results', () => {
    expect(
      createCanvasMindMapTreePositionUpdates({
        nodes: [createLayoutNode('root'), createLayoutNode('missing')],
        positions: new Map([['root', { x: 12, y: 24 }]])
      })
    ).toEqual([{ id: 'root', position: { x: 12, y: 24 } }])
  })
})

describe('layoutCanvasMindMapTree', () => {
  it('uses the layout manager tree algorithm and produces position updates', async () => {
    const manager = createLayoutManager({ useWorker: false })
    const nodes = [
      createLayoutNode('root', 400, 300, 280, 120),
      createLayoutNode('branch-a'),
      createLayoutNode('branch-b'),
      createLayoutNode('leaf-a')
    ]
    const edges = [
      createLayoutEdge('root-a', 'root', 'branch-a'),
      createLayoutEdge('root-b', 'root', 'branch-b'),
      createLayoutEdge('a-leaf', 'branch-a', 'leaf-a')
    ]

    try {
      const result = await layoutCanvasMindMapTree({
        nodes,
        edges,
        manager,
        anchorNodeId: 'root',
        useWorker: false
      })

      expect(result.request.algorithm).toBe('tree')
      expect(result.positions.size).toBe(nodes.length)
      expect(result.positionUpdates).toHaveLength(nodes.length)
      expect(result.positionUpdates[0]).toEqual({
        id: 'root',
        position: { x: 400, y: 300 }
      })

      const branchUpdate = result.positionUpdates.find((update) => update.id === 'branch-a')
      expect(branchUpdate).toBeDefined()
      expect(branchUpdate!.position.x !== 400 || branchUpdate!.position.y !== 300).toBe(true)
    } finally {
      manager.terminate()
    }
  })
})
