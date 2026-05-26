import { describe, expect, it } from 'vitest'
import { createCanvasSmartSnap } from '../selection/snap-guides'
import { createNode } from '../store'

describe('canvas smart snap guides', () => {
  it('snaps moving bounds to nearby object edges', () => {
    const target = createNode('page', { x: 206, y: 24, width: 120, height: 80 })
    const result = createCanvasSmartSnap({
      movingBounds: { x: 0, y: 0, width: 100, height: 80 },
      stationaryNodes: [target],
      canvasDelta: { x: 104, y: 0 },
      threshold: 4
    })

    expect(result.canvasDelta.x).toBe(106)
    expect(result.canvasDelta.y).toBe(0)
    expect(result.guides).toEqual([
      expect.objectContaining({
        source: 'object',
        orientation: 'vertical',
        position: 206,
        relatedNodeIds: [target.id]
      })
    ])
  })

  it('prefers frame edge guides for frame-like containers', () => {
    const frame = createNode(
      'group',
      { x: 300, y: -40, width: 460, height: 320 },
      { containerRole: 'frame' }
    )
    const result = createCanvasSmartSnap({
      movingBounds: { x: 0, y: 0, width: 100, height: 80 },
      stationaryNodes: [frame],
      canvasDelta: { x: 296, y: 0 },
      threshold: 6
    })

    expect(result.canvasDelta.x).toBe(300)
    expect(result.guides[0]).toMatchObject({
      source: 'frame',
      orientation: 'vertical',
      position: 300
    })
  })

  it('creates equal-spacing guides between neighboring objects', () => {
    const left = createNode('page', { x: 0, y: 0, width: 100, height: 80 })
    const right = createNode('page', { x: 300, y: 0, width: 100, height: 80 })
    const result = createCanvasSmartSnap({
      movingBounds: { x: 0, y: 0, width: 100, height: 80 },
      stationaryNodes: [left, right],
      canvasDelta: { x: 148, y: 0 },
      threshold: 4
    })

    expect(result.canvasDelta.x).toBe(150)
    expect(result.guides[0]).toMatchObject({
      source: 'spacing',
      orientation: 'vertical',
      position: 200,
      relatedNodeIds: [left.id, right.id],
      label: 'Equal 50px'
    })
  })

  it('caps snapping to nearby candidate nodes', () => {
    const farTarget = createNode('page', { x: 906, y: 0, width: 100, height: 80 })
    const result = createCanvasSmartSnap({
      movingBounds: { x: 0, y: 0, width: 100, height: 80 },
      stationaryNodes: [farTarget],
      canvasDelta: { x: 804, y: 0 },
      threshold: 4,
      searchRadius: 100
    })

    expect(result.canvasDelta.x).toBe(804)
    expect(result.guides).toEqual([])
  })
})
