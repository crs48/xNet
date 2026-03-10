import type { CanvasNode } from '../types'
import { describe, expect, it } from 'vitest'
import {
  createFrameSelectionNode,
  createAlignmentUpdates,
  createDistributionUpdates,
  createLayerShiftUpdates,
  createLockUpdates,
  createResizeUpdate,
  createTidySelectionUpdates,
  expandContainerPositionUpdates,
  getCanvasContainerMemberIds,
  getCanvasContainerRole,
  getSelectionBounds,
  getSelectionLockState,
  getUnlockedSelection
} from '../selection/scene-operations'

function createNode(
  id: string,
  position: { x: number; y: number; width?: number; height?: number; zIndex?: number },
  locked = false
): CanvasNode {
  return {
    id,
    type: 'page',
    locked,
    position: {
      x: position.x,
      y: position.y,
      width: position.width ?? 120,
      height: position.height ?? 80,
      zIndex: position.zIndex ?? 0
    },
    properties: {
      title: id
    }
  }
}

describe('scene operations', () => {
  it('calculates selection bounds', () => {
    const bounds = getSelectionBounds([
      createNode('a', { x: 40, y: 30, width: 100, height: 80 }),
      createNode('b', { x: 220, y: 160, width: 140, height: 120 })
    ])

    expect(bounds).toEqual({
      x: 40,
      y: 30,
      width: 320,
      height: 250
    })
  })

  it('filters unlocked selections and toggles lock state', () => {
    const nodes = [
      createNode('a', { x: 40, y: 30 }, false),
      createNode('b', { x: 220, y: 160 }, true)
    ]

    expect(getUnlockedSelection(nodes).map((node) => node.id)).toEqual(['a'])
    expect(getSelectionLockState(nodes)).toEqual({
      anyLocked: true,
      allLocked: false,
      nextLocked: true
    })
    expect(createLockUpdates(nodes)).toEqual([{ id: 'a', locked: true }])
    expect(createLockUpdates(nodes, false)).toEqual([{ id: 'b', locked: false }])
  })

  it('aligns selections against the shared bounds', () => {
    const nodes = [
      createNode('a', { x: 40, y: 30, width: 100, height: 80 }),
      createNode('b', { x: 220, y: 160, width: 140, height: 120 })
    ]

    expect(createAlignmentUpdates(nodes, 'left')).toEqual([
      { id: 'a', position: { x: 40 } },
      { id: 'b', position: { x: 40 } }
    ])
    expect(createAlignmentUpdates(nodes, 'middle')).toEqual([
      { id: 'a', position: { y: 115 } },
      { id: 'b', position: { y: 95 } }
    ])
  })

  it('distributes selections evenly across horizontal and vertical axes', () => {
    const nodes = [
      createNode('a', { x: 40, y: 20, width: 80, height: 60 }),
      createNode('b', { x: 180, y: 180, width: 80, height: 60 }),
      createNode('c', { x: 400, y: 360, width: 80, height: 60 })
    ]

    expect(createDistributionUpdates(nodes, 'horizontal')).toEqual([
      { id: 'b', position: { x: 220 } }
    ])
    expect(createDistributionUpdates(nodes, 'vertical')).toEqual([
      { id: 'b', position: { y: 190 } }
    ])
  })

  it('creates tidy grid updates from the visual order', () => {
    const nodes = [
      createNode('a', { x: 300, y: 220, width: 100, height: 80 }),
      createNode('b', { x: 40, y: 20, width: 100, height: 80 }),
      createNode('c', { x: 180, y: 120, width: 100, height: 80 }),
      createNode('d', { x: 420, y: 320, width: 100, height: 80 })
    ]

    expect(createTidySelectionUpdates(nodes, 32)).toEqual([
      { id: 'b', position: { x: 40, y: 20 } },
      { id: 'c', position: { x: 172, y: 20 } },
      { id: 'a', position: { x: 40, y: 132 } },
      { id: 'd', position: { x: 172, y: 132 } }
    ])
  })

  it('moves selections forward and backward through z-order', () => {
    const nodes = [
      createNode('a', { x: 40, y: 20, zIndex: 2 }),
      createNode('b', { x: 180, y: 80, zIndex: 0 })
    ]

    expect(createLayerShiftUpdates(nodes, 'forward')).toEqual([
      { id: 'a', position: { zIndex: 3 } },
      { id: 'b', position: { zIndex: 1 } }
    ])
    expect(createLayerShiftUpdates(nodes, 'backward')).toEqual([
      { id: 'a', position: { zIndex: 1 } },
      { id: 'b', position: { zIndex: 0 } }
    ])
  })

  it('creates resize updates for edge and corner handles', () => {
    const node = createNode('page-1', { x: 80, y: 60, width: 240, height: 180 })

    expect(createResizeUpdate(node, 'bottom-right', { x: 48, y: 32 })).toEqual({
      id: 'page-1',
      position: {
        x: 80,
        y: 60,
        width: 288,
        height: 212
      }
    })

    expect(createResizeUpdate(node, 'top-left', { x: 40, y: 20 })).toEqual({
      id: 'page-1',
      position: {
        x: 120,
        y: 80,
        width: 200,
        height: 160
      }
    })
  })

  it('clamps resize updates to the minimum dimensions', () => {
    const node = createNode('page-1', { x: 80, y: 60, width: 140, height: 110 })

    expect(createResizeUpdate(node, 'left', { x: 120, y: 0 })).toEqual({
      id: 'page-1',
      position: {
        x: 124,
        y: 60,
        width: 96,
        height: 110
      }
    })

    expect(createResizeUpdate(node, 'top', { x: 0, y: 120 })).toEqual({
      id: 'page-1',
      position: {
        x: 80,
        y: 98,
        width: 140,
        height: 72
      }
    })
  })

  it('creates a frame container around the current selection', () => {
    const frame = createFrameSelectionNode([
      createNode('a', { x: 40, y: 30, width: 100, height: 80, zIndex: 4 }),
      createNode('b', { x: 220, y: 160, width: 140, height: 120, zIndex: 7 })
    ])

    expect(frame).not.toBeNull()
    expect(frame?.type).toBe('group')
    expect(getCanvasContainerRole(frame!)).toBe('frame')
    expect(getCanvasContainerMemberIds(frame!)).toEqual(['a', 'b'])
    expect(frame?.position).toMatchObject({
      x: -8,
      y: -18,
      width: 416,
      height: 346,
      zIndex: 3
    })
  })

  it('propagates container moves and layer shifts to member nodes', () => {
    const frame = {
      id: 'frame-1',
      type: 'group',
      position: {
        x: 80,
        y: 60,
        width: 360,
        height: 240,
        zIndex: 2
      },
      properties: {
        title: 'Frame',
        containerRole: 'frame',
        memberIds: ['page-1', 'page-2']
      }
    } satisfies CanvasNode

    const pageOne = createNode('page-1', { x: 120, y: 110, zIndex: 3 })
    const pageTwo = createNode('page-2', { x: 280, y: 180, zIndex: 4 })
    const nodesById = new Map([frame, pageOne, pageTwo].map((node) => [node.id, node] as const))

    expect(
      expandContainerPositionUpdates(nodesById, [
        {
          id: 'frame-1',
          position: {
            x: 140,
            y: 100,
            zIndex: 5
          }
        }
      ])
    ).toEqual([
      {
        id: 'frame-1',
        position: {
          x: 140,
          y: 100,
          zIndex: 5
        }
      },
      {
        id: 'page-1',
        position: {
          x: 180,
          y: 150,
          zIndex: 6
        }
      },
      {
        id: 'page-2',
        position: {
          x: 340,
          y: 220,
          zIndex: 7
        }
      }
    ])
  })
})
