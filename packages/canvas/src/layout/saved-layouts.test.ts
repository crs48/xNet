import type { CanvasEdge, CanvasNode } from '../types'
import { describe, expect, it } from 'vitest'
import {
  CANVAS_SAVED_LAYOUT_DEFINITIONS,
  createCanvasSavedLayoutFrameProperties,
  createCanvasSavedLayoutPlan,
  createCanvasSavedLayoutState,
  getCanvasSavedLayoutDefinition,
  isCanvasSavedLayoutKind
} from './saved-layouts'

function node(id: string, properties: Record<string, unknown> = {}): CanvasNode {
  return {
    id,
    type: 'page',
    position: {
      x: 0,
      y: 0,
      width: 100,
      height: 60
    },
    properties
  }
}

function edge(id: string, sourceId: string, targetId: string): CanvasEdge {
  return {
    id,
    sourceId,
    targetId
  }
}

describe('saved canvas layouts', () => {
  it('defines the first saved layout set for ERP/query frames', () => {
    expect(CANVAS_SAVED_LAYOUT_DEFINITIONS.map((definition) => definition.kind)).toEqual([
      'grid',
      'swimlane',
      'kanban',
      'timeline',
      'dependency-map',
      'org-chart'
    ])
    expect(isCanvasSavedLayoutKind('org-chart')).toBe(true)
    expect(isCanvasSavedLayoutKind('radial')).toBe(false)
    expect(getCanvasSavedLayoutDefinition('dependency-map').layoutHint).toBe('dependency-map')
  })

  it('creates frame properties for saved layout state', () => {
    const properties = createCanvasSavedLayoutFrameProperties('kanban', {
      lanes: ['Queued', 'Building', 'Shipped']
    })

    expect(properties).toMatchObject({
      containerRole: 'frame',
      frameVariant: 'kanban',
      frameIntent: 'kanban',
      layoutHint: 'kanban',
      lanes: ['Queued', 'Building', 'Shipped'],
      savedLayout: {
        kind: 'kanban',
        version: 1
      }
    })
    expect(createCanvasSavedLayoutState('grid', { columns: 2 }).options.columns).toBe(2)
  })

  it('plans compact grid positions with stable row heights', () => {
    const plan = createCanvasSavedLayoutPlan({
      kind: 'grid',
      nodes: [node('a'), node('b'), node('c')],
      origin: { x: 10, y: 20 },
      options: { columns: 2, columnGap: 10, rowGap: 12, padding: 4 }
    })

    expect([...plan.positions.entries()]).toEqual([
      ['a', { x: 14, y: 24, width: 100, height: 60 }],
      ['b', { x: 124, y: 24, width: 100, height: 60 }],
      ['c', { x: 14, y: 96, width: 100, height: 60 }]
    ])
    expect(plan.bounds).toMatchObject({ x: 14, y: 24, width: 210, height: 132 })
  })

  it('groups swimlane and kanban nodes by saved lane field', () => {
    const nodes = [
      node('backlog', { status: 'Backlog' }),
      node('done', { status: 'Done' }),
      node('custom', { status: 'Review' })
    ]
    const plan = createCanvasSavedLayoutPlan({
      kind: 'kanban',
      nodes,
      options: { lanes: ['Backlog', 'Done'], columnGap: 20, rowGap: 8, padding: 0 }
    })

    expect(plan.lanes).toEqual(['Backlog', 'Done', 'Review'])
    expect(plan.positions.get('backlog')?.x).toBe(0)
    expect(plan.positions.get('done')?.x).toBe(260)
    expect(plan.positions.get('custom')?.x).toBe(520)
  })

  it('sorts timeline nodes by date-like fields', () => {
    const plan = createCanvasSavedLayoutPlan({
      kind: 'timeline',
      nodes: [node('later', { dueDate: '2026-09-01' }), node('now', { dueDate: '2026-05-26' })],
      options: { timeField: 'dueDate', columnGap: 10, rowGap: 10, padding: 0 }
    })

    expect(plan.positions.get('now')?.x).toBe(0)
    expect(plan.positions.get('later')?.x).toBe(110)
  })

  it('layers dependency maps and org charts from edges', () => {
    const nodes = [node('ceo'), node('vp'), node('lead')]
    const edges = [edge('e1', 'ceo', 'vp'), edge('e2', 'vp', 'lead')]
    const dependency = createCanvasSavedLayoutPlan({
      kind: 'dependency-map',
      nodes,
      edges,
      options: { columnGap: 40, rowGap: 12, padding: 0, direction: 'RIGHT' }
    })
    const org = createCanvasSavedLayoutPlan({
      kind: 'org-chart',
      nodes,
      edges,
      options: { rowGap: 30, columnGap: 12, padding: 0, direction: 'DOWN' }
    })

    expect(dependency.positions.get('ceo')?.x).toBe(0)
    expect(dependency.positions.get('vp')?.x).toBe(140)
    expect(dependency.positions.get('lead')?.x).toBe(280)
    expect(org.positions.get('ceo')?.y).toBe(0)
    expect(org.positions.get('vp')?.y).toBe(90)
    expect(org.positions.get('lead')?.y).toBe(180)
  })
})
