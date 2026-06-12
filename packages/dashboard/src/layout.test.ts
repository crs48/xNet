import type { DashboardWidgetInstance } from '@xnetjs/data'
import { describe, expect, it } from 'vitest'
import { applyLayoutChanges, placeWidget, resolveLayout } from './layout'

const SIZE = { w: 6, h: 4 }

function widget(id: string): DashboardWidgetInstance {
  return { id, widgetType: 'metric.count', config: {} }
}

describe('placeWidget', () => {
  it('places the first widget at the origin', () => {
    expect(placeWidget([], SIZE)).toEqual({ x: 0, y: 0 })
  })

  it('fills gaps left-to-right before opening a new row', () => {
    const existing = [{ id: 'a', x: 0, y: 0, w: 6, h: 4 }]
    expect(placeWidget(existing, SIZE)).toEqual({ x: 6, y: 0 })
  })

  it('opens a new row when the current rows are full', () => {
    const existing = [
      { id: 'a', x: 0, y: 0, w: 6, h: 4 },
      { id: 'b', x: 6, y: 0, w: 6, h: 4 }
    ]
    expect(placeWidget(existing, SIZE)).toEqual({ x: 0, y: 4 })
  })
})

describe('resolveLayout', () => {
  it('returns stored items and appends placements for new widgets', () => {
    const widgets = [widget('a'), widget('b')]
    const layouts = { lg: [{ id: 'a', x: 3, y: 0, w: 6, h: 4 }] }

    const resolved = resolveLayout(widgets, layouts, () => SIZE)

    expect(resolved[0]).toEqual({ id: 'a', x: 3, y: 0, w: 6, h: 4 })
    expect(resolved[1]).toMatchObject({ id: 'b', w: 6, h: 4 })
  })

  it('falls back to the lg layout for missing breakpoints', () => {
    const widgets = [widget('a')]
    const layouts = { lg: [{ id: 'a', x: 2, y: 1, w: 4, h: 3 }] }

    expect(resolveLayout(widgets, layouts, () => SIZE, 'md')[0]).toEqual({
      id: 'a',
      x: 2,
      y: 1,
      w: 4,
      h: 3
    })
  })
})

describe('applyLayoutChanges', () => {
  it('merges changed items by id', () => {
    const layout = [
      { id: 'a', x: 0, y: 0, w: 6, h: 4 },
      { id: 'b', x: 6, y: 0, w: 6, h: 4 }
    ]

    expect(applyLayoutChanges(layout, [{ id: 'b', x: 0, y: 4, w: 12, h: 2 }])).toEqual([
      { id: 'a', x: 0, y: 0, w: 6, h: 4 },
      { id: 'b', x: 0, y: 4, w: 12, h: 2 }
    ])
  })
})
