import { describe, expect, it } from 'vitest'
import { createNode } from '../store'
import {
  applyCanvasFrameVariant,
  createCanvasFrameVariantNode,
  createCanvasFrameVariantProperties,
  getCanvasFrameVariant,
  getCanvasFrameVariantDefinition,
  isCanvasFrameVariant,
  isCanvasFrameVariantNode
} from './frame-variants'

const viewport = {
  x: 120,
  y: 80,
  zoom: 1
}

describe('frame variant helpers', () => {
  it('creates standard frame properties with member metadata', () => {
    expect(
      createCanvasFrameVariantProperties('standard', {
        title: 'Research cluster',
        memberIds: ['page-1', 'note-1']
      })
    ).toMatchObject({
      title: 'Research cluster',
      containerRole: 'frame',
      frameVariant: 'standard',
      frameIntent: 'freeform',
      memberIds: ['page-1', 'note-1'],
      memberCount: 2
    })
  })

  it('creates planning-specific frame nodes with default sizes', () => {
    const presentation = createCanvasFrameVariantNode({
      variant: 'presentation',
      viewport,
      title: 'Demo'
    })
    const kanban = createCanvasFrameVariantNode({
      variant: 'kanban',
      viewport
    })

    expect(presentation).toMatchObject({
      type: 'group',
      position: {
        width: 960,
        height: 540
      },
      properties: {
        title: 'Demo',
        frameVariant: 'presentation',
        exportRole: 'slide',
        aspectRatio: '16:9'
      }
    })
    expect(kanban).toMatchObject({
      type: 'group',
      position: {
        width: 860,
        height: 500
      },
      properties: {
        title: 'Kanban frame',
        frameVariant: 'kanban',
        laneAxis: 'vertical',
        lanes: ['Backlog', 'In progress', 'Done']
      }
    })
  })

  it('applies variants without losing title or frame membership', () => {
    const frame = createNode(
      'group',
      { x: 0, y: 0, width: 640, height: 420 },
      {
        title: 'Launch plan',
        containerRole: 'frame',
        memberIds: ['task-1'],
        memberCount: 1,
        frameVariant: 'kanban',
        lanes: ['Old lane'],
        queryText: 'status=open'
      }
    )

    const timeline = applyCanvasFrameVariant(frame, 'timeline')

    expect(timeline.properties).toMatchObject({
      title: 'Launch plan',
      containerRole: 'frame',
      memberIds: ['task-1'],
      memberCount: 1,
      frameVariant: 'timeline',
      frameIntent: 'timeline',
      timeScale: 'month',
      lanes: ['Now', 'Next', 'Later']
    })
    expect(timeline.properties.queryText).toBeUndefined()
  })

  it('reads and validates variants defensively', () => {
    const frame = createCanvasFrameVariantNode({ viewport })

    expect(isCanvasFrameVariant('query')).toBe(true)
    expect(isCanvasFrameVariant('grid')).toBe(false)
    expect(getCanvasFrameVariant(frame)).toBe('standard')
    expect(getCanvasFrameVariantDefinition('swimlane').defaultTitle).toBe('Swimlane frame')
    expect(isCanvasFrameVariantNode(frame)).toBe(true)
  })
})
